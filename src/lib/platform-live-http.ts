// platform-live-http.ts — PlatformConnection 的 Neon HTTP 存取
//
// 為什麼需要這個（與 db-http.ts 同一個原因）
//
// Prisma 7 的 query compiler 是 WASM，而 Cloudflare Workers 拒絕
// 它需要的動態 WASM codegen：
//
//   CompileError: WebAssembly.Module(): Wasm code generation disallowed by embedder
//
// 而 platform-live.ts 是 **共享層**，被 getLiveViewers / refreshToken 等
// 多條路徑呼叫 —— 所以 `live-viewers` 那條 overlay 在 Workers 上
// 必然 500，即使 overlay/[token] 本身已經改寫完成。
//
// ⚠️ 這與我在 overlay-render.ts 犯的錯完全同型：
//    「overlay 路由已經改成 Neon HTTP 了」**不等於**
//    「overlay 能跑」—— 因為它們還會呼叫共用的 helper。
//    而我只掃了路由，沒追共用的呼叫鏈。
//
// ─────────────────────────────────────────────────────────
// 這裡**只**搬查詢，外部 API（Twitch/YouTube）不動
// ─────────────────────────────────────────────────────────
//
// 那些是單純的 fetch，在 Workers 上原生支援。
// 而 Prisma 是唯一擋路的東西 —— 所以搬 Prisma 就夠了，
// 不需要碰 OAuth refresh 的邏輯（那是需要獨立測試的東西）。
import { query, queryOne } from "./db-http";

export interface PlatformConnRow {
  id: string;
  platform: string;
  connected: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: string | null;
  channelId: string | null;
  channelName: string | null;
  liveViewers: number | null;
}

const CONN_COLS = `"id", "platform", "connected", "accessToken", "refreshToken",
                  "tokenExpiresAt", "channelId", "channelName", "liveViewers"`;

/** 已連線的平台連線（對應 Prisma 的 platformConnection.findMany）。 */
export async function listConnectedPlatforms(userId: string): Promise<PlatformConnRow[]> {
  return query<PlatformConnRow>(
    `SELECT ${CONN_COLS} FROM "PlatformConnection"
      WHERE "userId" = $1 AND "connected" = true
      ORDER BY "platform" ASC`,
    [userId],
  );
}

/**
 * 寫回觀看人數。
 *
 * 對應 Prisma 的 `update(...).catch(() => {})`。
 *
 * ⚠️ 原版的 `.catch(() => {})` 會把「Prisma 沒載入」也吞掉 ——
 *    在 Workers 上那是 WASM 錯誤被靜默忽略，症狀是
 *    「觀看人數永遠不更新」而沒有任何錯誤。
 *
 *    所以這裡**不吞**：失敗要回報。
 *    呼叫端（platform-live）決定這是否該讓整個請求失敗。
 */
export async function saveLiveViewers(id: string, value: number | null): Promise<void> {
  await query(
    `UPDATE "PlatformConnection"
        SET "liveViewers" = $2, "liveUpdatedAt" = NOW()
      WHERE "id" = $1`,
    [id, value],
  );
}

/**
 * 寫回 OAuth token（對應 refreshTwitchToken 的 update）。
 *
 * ⚠️ 這裡有個**刻意保留**的行為：refresh_token 只在 Twitch 回傳時才覆寫。
 *    因為「Twitch 只在舊 token 仍有效時才輪替 refresh_token」——
 *    若寫成固定值，會把還沒過期的 refresh token 清成 null。
 *
 *    SQL 用 COALESCE($, 現值) 達成「有才覆寫」。
 */
export async function saveOAuthTokens(
  id: string,
  accessToken: string,
  refreshToken: string | null,
  expiresInMs: number | null,
): Promise<void> {
  await query(
    `UPDATE "PlatformConnection"
        SET "accessToken"     = $2,
            "refreshToken"    = COALESCE($3, "refreshToken"),
            "tokenExpiresAt"  = CASE WHEN $4::bigint IS NULL THEN NULL
                                    ELSE NOW() + ($4::bigint * INTERVAL '1 millisecond') END
      WHERE "id" = $1`,
    [id, accessToken, refreshToken, expiresInMs],
  );
}

/** 依 userId + platform 取單一連線（對應 findUnique 的複合唯一鍵）。 */
export async function findPlatformConnection(
  userId: string,
  platform: string,
): Promise<PlatformConnRow | null> {
  return queryOne<PlatformConnRow>(
    `SELECT ${CONN_COLS} FROM "PlatformConnection"
      WHERE "userId" = $1 AND "platform" = $2
      LIMIT 1`,
    [userId, platform],
  );
}