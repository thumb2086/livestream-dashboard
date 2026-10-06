// donations-http.ts — 斗內功能的 Neon HTTP 存取
//
// 覆蓋 /api/v1/donations（11 處 Prisma）：
//   · GET  → 目標清單 + 使用者設定
//   · POST → updateUser / addGoal / deleteGoal / updateGoal / simulate
//
// ── 為什麼要保留「沒有條件的 updateMany / deleteMany」──────────
//
// Prisma 的 `updateMany({ where })` 與 `deleteMany({ where })`
// **回傳 affected rows 數量**，但這裡的原始碼沒有檢查它。
//
// 也就是說：若 `body.id` 不存在，呼叫**不會報錯**，只是靜默地
// 什麼都沒做，然後回 200 + 目前的目標清單。
//
// 那不是 bug 而是有意的（回傳真實狀態而不是錯誤）——
// 但它意味著「刪掉別人的目標」與「刪掉不存在的目標」**外觀完全相同**。
//
// 所以我在這裡保留同樣的語意，並註明它，因為：
//   · 改掉它（改成回 404）會改變前端行為
//   · 但「不註明」會讓下一個人以為那是漏了
//
// ⚠️ 而 `where` 裡同時有 `id` 與 `userId` —— 那個 `userId` 就是
//   **所有權檢查**。若只 where id，任何登入者都能改別人的目標。
//   搬運時絕不能只帶 id。
import { query, queryOne } from "./db-http";

// ── 型別 ────────────────────────────────────────────────────
//
// ⚠️ DonationGoal.current / goal 是 **Int**（不是 Float）
//    → Neon 回整數，型別上仍是 number，不需要轉換。
//
// ⚠️ ZixiDonation.amount 是 **Float**
//    → Neon 的 numeric 回**字串**，必須轉換，
//      否則前端拿到 "100" 而非 100，而那不會報錯。
//
// 我第一版把兩個都當 Float 處理 —— 那是照直覺猜的，
// 而實際欄位型別查一下就有。

export interface DonationGoal {
  id: string;
  title: string;
  emoji: string;
  current: number;
  goal: number;
  sortOrder: number;
  videoUrl: string;
}

const GOAL_COLS = `"id", "title", "emoji", "current", "goal", "sortOrder", "videoUrl"`;

/** Neon's numeric/decimal 欄位回字串；統一轉 number。 */
export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToGoal(r: Record<string, unknown>): DonationGoal {
  return {
    id: String(r.id),
    title: String(r.title ?? ''),
    emoji: String(r.emoji ?? '🎯'),
    current: num(r.current),
    goal: num(r.goal),
    sortOrder: num(r.sortOrder),
    videoUrl: String(r.videoUrl ?? ''),
  };
}

/** 依 sortOrder 取目標清單。 */
export async function listGoals(userId: string): Promise<DonationGoal[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${GOAL_COLS} FROM "DonationGoal" WHERE "userId" = $1 ORDER BY "sortOrder" ASC`,
    [userId],
  );
  return rows.map(rowToGoal);
}

export async function countGoals(userId: string): Promise<number> {
  const r = await queryOne<{ n: string }>(
    'SELECT COUNT(*)::text AS n FROM "DonationGoal" WHERE "userId" = $1', [userId],
  );
  return num(r?.n);
}

export async function createGoal(
  userId: string,
  data: { title: string; goal: number; emoji: string; sortOrder: number },
): Promise<void> {
  await query(
    `INSERT INTO "DonationGoal" ("id","userId","title","emoji","goal","sortOrder","current","videoUrl")
     VALUES ($1,$2,$3,$4,$5,$6,0,'')`,
    [crypto.randomUUID(), userId, data.title, data.emoji, data.goal, data.sortOrder],
  );
}

/**
 * 刪除目標。
 *
 * ⚠️ 回傳是否真的刪到東西 —— 原始碼沒有檢查它，而呼叫端也不該
 *    把「不存在」誤會成「沒權限」（那兩個情況外觀相同）。
 */
export async function deleteGoal(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "DonationGoal" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}

/**
 * 更新目標。
 *
 * ⚠️ 原始碼用 `updateMany` 並**沒有檢查 affected rows** ——
 *    所以更新不存在的目標會靜默成功。
 *    這裡保留同樣語意（回 boolean 但呼叫端可忽略）。
 *
 * ⚠️ `current` 在這裡是**由前端傳入**的，不是由斗內金額累加。
 *    那意味著前端可以任意設定進度。
 *    而 updateGoal 是給創作者自己用的（只有本人能呼叫），
 *    所以那是「自己的資料自己設定」，不是偽造他人資料。
 *    順帶一提：simulate 那條路徑才會用伺服器計算的 current。
 */
export async function updateGoal(
  id: string,
  userId: string,
  data: { title?: string; goal?: number; emoji?: string; current?: number },
): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const k of ['title', 'goal', 'emoji', 'current'] as const) {
    if (data[k] !== undefined) {
      params.push(data[k]);
      sets.push(`"${k}" = $${params.length}`);
    }
  }
  if (!sets.length) return false;
  const r = await query<{ id: string }>(
    `UPDATE "DonationGoal" SET ${sets.join(', ')}
      WHERE "id" = $1 AND "userId" = $2 RETURNING "id"`,
    params,
  );
  return r.length > 0;
}

/** 更新使用者的斗內設定。 */
export async function updateDonationSettings(
  userId: string,
  data: { donationMinAmount?: number; donationSound?: string },
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [userId];
  for (const k of ['donationMinAmount', 'donationSound'] as const) {
    if (data[k] !== undefined) {
      params.push(data[k]);
      sets.push(`"${k}" = $${params.length}`);
    }
  }
  if (!sets.length) return;
  await query(`UPDATE "User" SET ${sets.join(', ')} WHERE "id" = $1`, params);
}

/**
 * 建立測試斗內紀錄（simulate 路徑）。
 *
 * ⚠️ txHash = "TEST" 是刻意的標記 —— 該端點的註解寫著
 *    「marks the row so it can be identified and removed from the
 *    donation ledger」。
 *    所以它不能是空字串或 null，否則測試紀錄就沒辦法辨識。
 */
export async function createTestDonation(
  userId: string,
  amount: number,
): Promise<void> {
  await query(
    `INSERT INTO "ZixiDonation"
       ("id","userId","donorAddress","donorName","amount","token","message","txHash","status","createdAt")
     VALUES ($1,$2,'0xTEST','測試贊助者',$3,'TWD','這是一筆測試紀錄，可在斗內紀錄中刪除','TEST','confirmed',NOW())`,
    [crypto.randomUUID(), userId, amount],
  );
}

/** 把目標的 current 往前推，但**不超過 goal**。 */
export async function advanceGoal(id: string, current: number, goal: number): Promise<void> {
  await query(
    'UPDATE "DonationGoal" SET "current" = $2 WHERE "id" = $1',
    [id, Math.min(current, goal)],
  );
}

/**
 * GET 與 refresh() 用的使用者欄位。
 *
 * ⚠️ `donationTotal` / `donationDonors` **必須**在這裡。
 *
 *   那是該端點註解所說的「Totals are server-computed via
 *   simulate/confirmed donations only」—— 前端公開頁面把它們
 *   當成真實收到的錢在顯示。
 *
 *   而它們**不可**由 POST /updateUser 寫入（那正是防偽造的點）。
 *   所以這裡只是**讀取**，而 updateDonationSettings 只碰
 *   donationMinAmount / donationSound。
 *
 * 我第一版的 donationSettings() 只回 minAmount 與 soundEffect，
 * 而 tsc 立刻抓到 donationTotal / donationDonors 不存在。
 *
 * 那是好兆頭：如果沒有用型別把這兩個欄位綁進回應型別，
 * 它們就會安靜地從 API 消失 —— 而前端會顯示 0 元，
 * 那看起來像「還沒收到任何斗內」。
 */
export async function donationSettings(userId: string): Promise<{
  donationMinAmount: number;
  donationSound: string;
  donationTotal: number;
  donationDonors: number;
} | null> {
  const r = await queryOne<{
    donationMinAmount: string; donationSound: string;
    donationTotal: string; donationDonors: string;
  }>(
    `SELECT "donationMinAmount", "donationSound", "donationTotal", "donationDonors"
       FROM "User" WHERE "id" = $1 LIMIT 1`,
    [userId],
  );
  if (!r) return null;
  return {
    donationMinAmount: num(r.donationMinAmount),
    donationSound: String(r.donationSound ?? ''),
    donationTotal: num(r.donationTotal),
    donationDonors: num(r.donationDonors),
  };
}