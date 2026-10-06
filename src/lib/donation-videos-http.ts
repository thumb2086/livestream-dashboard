// donation-videos-http.ts — 斗內影片的 Neon HTTP 存取
//
// 覆蓋 /api/v1/donation-videos（11 處 Prisma，全部是 `(prisma as any)`）。
//
// ── 所有權：注意這裡的形狀與其他路由不同 ──────────────────
//
// 其他路由是「每個分支的 where 帶 userId」；
// 這個路由是**一次檢查涵蓋所有分支**：
//
//     const owned = await donationVideo.findFirst({ where: { id, userId } });
//     if (!owned) return 404;
//     if (_meta === 'approve') update({ where: { id }, ... })
//     else if (_meta === 'played') update({ where: { id }, ... })
//     ...
//
// 所以後面各分支的 where **只有 id 是正確的**，不代表漏了檢查。
//
// ⚠️ 而我第一輪讀到 `where: { id }` 時判定那是授權缺口 ——
//    讀完上下文才知道檢查在上游。**看見可疑形狀不等於看見漏洞。**
//
// 這裡保留「一次檢查 + 單獨 id 寫入」的形狀，因為它有實際好處：
// 沒有任何寫入能繞過那一次檢查（而逐分支帶 userId 有可能漏掉一個分支）。
import { query, queryOne } from "./db-http";

export interface DonationVideoRow {
  id: string;
  userId: string;
  donorName: string;
  amount: number;
  videoUrl: string;
  startSec: number;
  endSec: number;
  message: string;
  status: string;
  rejectNote: string;
  createdAt: string;
  reviewedAt: string | null;
}

/** 取用上限 —— 沿用原碼的 take: 200。 */
export const VIDEO_LIMIT = 200;

const V_COLS = `"id", "userId", "donorName", "amount", "videoUrl", "startSec", "endSec",
                 "message", "status", "rejectNote", "createdAt", "reviewedAt"`;

/** Neon's numeric/decimal 回字串；統一轉 number。 */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToVideo(r: Record<string, unknown>): DonationVideoRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    donorName: String(r.donorName ?? ''),
    // ⚠️ amount 是 **Float** → Neon 回字串 → 必須轉換。
    //    不轉的話前端拿到 "150" 而非 150，且不會報錯。
    amount: num(r.amount),
    videoUrl: String(r.videoUrl ?? ''),
    startSec: num(r.startSec),
    endSec: num(r.endSec),
    message: String(r.message ?? ''),
    status: String(r.status ?? 'pending_review'),
    rejectNote: String(r.rejectNote ?? ''),
    createdAt: String(r.createdAt ?? ''),
    reviewedAt: r.reviewedAt ? String(r.reviewedAt) : null,
  };
}

export async function listVideos(
  userId: string,
  status?: string | null,
): Promise<DonationVideoRow[]> {
  // status 有值時才過濾（呼叫端已驗過 STATUSES 白名單）。
  // 用參數而不是字串拼接 —— 雖然它來自白名單，但那是呼叫端的契約，
  // 而這一層不該假設。
  const rows = status
    ? await query<Record<string, unknown>>(
        `SELECT ${V_COLS} FROM "DonationVideo"
          WHERE "userId" = $1 AND "status" = $2
          ORDER BY "createdAt" DESC
          LIMIT $3`,
        [userId, status, VIDEO_LIMIT],
      )
    : await query<Record<string, unknown>>(
        `SELECT ${V_COLS} FROM "DonationVideo"
          WHERE "userId" = $1
          ORDER BY "createdAt" DESC
          LIMIT $2`,
        [userId, VIDEO_LIMIT],
      );
  return rows.map(rowToVideo);
}

/** 取某個功能的設定（對應 FeatureSettings 的 (userId, featureKey) 複合唯一）。 */
export async function videoSettings(
  userId: string,
  featureKey: string,
): Promise<Record<string, unknown>> {
  const r = await queryOne<{ settings: unknown }>(
    'SELECT "settings" FROM "FeatureSettings" WHERE "userId" = $1 AND "featureKey" = $2 LIMIT 1',
    [userId, featureKey],
  );
  if (!r || r.settings === null || r.settings === undefined) return {};
  if (typeof r.settings === 'object') return r.settings as Record<string, unknown>;
  // Neon 的 json/jsonb 欄位透過 HTTP driver 回**字串**（不是解析好的物件）
  // —— 實測確認：欄位型別是 jsonb，但 driver 回的是字串。
  try {
    const parsed = JSON.parse(String(r.settings));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/**
 * 寫入 FeatureSettings（upsert）。
 *
 * ⚠️⚠️ **為什麼這裡一定要帶 "updatedAt"**
 *
 * `FeatureSettings.updatedAt` 是 `DateTime @updatedAt` —— 那是 **Prisma 的
 * client-side 自動更新**，資料庫**沒有 DEFAULT**。
 *
 * 實測（scripts/probe-feature-settings.cjs）：
 *
 *     null value in column "updatedAt" of relation "FeatureSettings"
 *     violates not-null constraint
 *
 * 而 Neon's HTTP driver **不會**像 Prisma 那樣自動填它。
 * 所以任何用 raw SQL 寫 FeatureSettings 而沒給 updatedAt 的地方，
 * 都會在執行時炸 —— 而症狀是「儲存設定失敗」，
 * 看起來像設定問題而不是 schema 問題。
 *
 * 這與 `@default(cuid())` 是同一類陷阱（id 也沒有 DB 預設），
 * 但我先前只在 id 上踩過 —— 因為我只寫過需要 id 的表。
 * `updatedAt` 是這輪第一次寫 FeatureSettings 才暴露。
 */
export async function saveFeatureSettings(
  userId: string,
  featureKey: string,
  settings: Record<string, unknown>,
): Promise<void> {
  await query(
    `INSERT INTO "FeatureSettings" ("id","userId","featureKey","settings","updatedAt")
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT ("userId","featureKey") DO UPDATE SET
       "settings" = EXCLUDED."settings", "updatedAt" = EXCLUDED."updatedAt"`,
    [crypto.randomUUID(), userId, featureKey, JSON.stringify(settings), new Date().toISOString()],
  );
}

/** 依 username 找使用者（公開頁面的投稿入口）。 */
export async function userIdByUsername(username: string): Promise<string | null> {
  const r = await queryOne<{ id: string }>(
    'SELECT "id" FROM "User" WHERE "username" = $1 LIMIT 1', [username],
  );
  return r ? r.id : null;
}

export async function createVideo(
  userId: string,
  data: {
    donorName: string; amount: number; videoUrl: string;
    startSec: number; endSec: number; message: string;
  },
): Promise<DonationVideoRow> {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO "DonationVideo"
       ("id","userId","donorName","amount","videoUrl","startSec","endSec","message","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
    [id, userId, data.donorName, data.amount, data.videoUrl,
     data.startSec, data.endSec, data.message],
  );
  const row = await queryOne<Record<string, unknown>>(
    `SELECT ${V_COLS} FROM "DonationVideo" WHERE "id" = $1`, [id],
  );
  // 剛剛才 INSERT 過，查不到代表有東西不對 —— 不能回 null 讓呼叫端
  // 以為成功（那會讓「建立失敗」看起來像「建立成功但沒資料」）。
  // `!` 在這裡安全：不變量由「同一個 await 之後立刻查到」保證。
  return rowToVideo(row!);
}

/**
 * 審核檢查 —— **這一次檢查涵蓋 approve/reject/played/delete 全部動作**。
 *
 * ⚠️ 見檔頭：後面各分支的 where 只有 id 是正確的。
 *    而這裡**不可**省略 —— 省略它就是真的授權漏洞。
 */
export async function ownedVideo(
  id: string, userId: string,
): Promise<DonationVideoRow | null> {
  const r = await queryOne<Record<string, unknown>>(
    `SELECT ${V_COLS} FROM "DonationVideo" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
    [id, userId],
  );
  return r ? rowToVideo(r) : null;
}

export async function approveVideo(id: string): Promise<void> {
  await query(
    `UPDATE "DonationVideo"
        SET "status" = 'approved', "reviewedAt" = NOW(), "rejectNote" = ''
      WHERE "id" = $1`,
    [id],
  );
}

export async function rejectVideo(id: string, rejectNote: string): Promise<void> {
  await query(
    `UPDATE "DonationVideo"
        SET "status" = 'rejected', "reviewedAt" = NOW(), "rejectNote" = $2
      WHERE "id" = $1`,
    [id, rejectNote],
  );
}

export async function markPlayed(id: string): Promise<void> {
  await query('UPDATE "DonationVideo" SET "status" = \'played\' WHERE "id" = $1', [id]);
}

export async function deleteVideo(id: string): Promise<void> {
  await query('DELETE FROM "DonationVideo" WHERE "id" = $1', [id]);
}