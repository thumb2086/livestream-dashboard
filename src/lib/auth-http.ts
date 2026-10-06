// auth-http.ts — Session / User 的 Neon HTTP 存取
//
// 為什麼需要這個
//
// getUser.ts 的 getOrCreateUser 是**每一條 API 路由的第一道關卡**
// （`const user = await getOrCreateUser(getSessionId(req))`），
// 而它用 Prisma —— 所以在 Workers 上，getOrCreateUser 會拋 WASM 錯誤，
// 而那個錯誤會在每個 catch 裡變成 401/500。
//
// 換句話說：**只要 getUser.ts 還用 Prisma，整個 API 就都是壞的**，
// 而不只是「某幾條路由」。
//
// ⚠️ 這與我在 overlay 那次的錯完全同型：
//    修了 overlay 的路由，卻沒追「它們呼叫的共用 helper」。
//    而共用層的影響範圍更大 —— 它在每條路由的入口。
//
// ── 為什麼要保留 getOrCreateUser 的「一次查詢」性質 ─────────
//
// 原註解寫著：
//   「One round trip, not two. This sits on the caption hot path where
//    every extra query costs ~400ms against a remote database」
//
// 所以這裡用 **一個 JOIN** 取 session + user，而不是先查 session
// 再查 user。分成兩次查詢在 Neon（跨網路）上會讓每個請求多 400ms ——
// 而那是**所有** API 路由的成本。
import { query, queryOne } from "./db-http";

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  demoMode: boolean;
  chosenPlan: string;
  zixiWallet: string;
  zixiAccessToken: string | null;
  zixiTokenExpiresAt: string | null;
  donationMinAmount: number;
  donationSound: string;
  donationTotal: number;
  donationDonors: number;
  totalViews: number;
  followers: number;
  totalMessages: number;
  avatar: string;
  publicPage: boolean;
}

const USER_COLS = `u."id", u."name", u."username", u."demoMode", u."chosenPlan",
                  u."zixiWallet", u."zixiAccessToken", u."zixiTokenExpiresAt",
                  u."donationMinAmount", u."donationSound", u."donationTotal",
                  u."donationDonors", u."totalViews", u."followers",
                  u."totalMessages", u."avatar", u."publicPage"`;

/**
 * 用 session id 取使用者（單次 JOIN，對應原本的 include: { user: true }）。
 *
 * 回傳 null 代表「沒有這個 session」—— 呼叫端據此回 401。
 */
export async function getSessionUser(sessionId: string): Promise<SessionUser | null> {
  const row = await queryOne<SessionUser>(
    `SELECT ${USER_COLS}
       FROM "Session" s
       JOIN "User" u ON u."id" = s."userId"
      WHERE s."id" = $1
      LIMIT 1`,
    [sessionId],
  );
  if (!row) return null;
  // Neon 的 numeric 回字串；統一轉成 number 讓呼叫端不用各自處理。
  return {
    ...row,
    donationMinAmount: Number(row.donationMinAmount ?? 30),
    donationTotal: Number(row.donationTotal ?? 0),
    donationDonors: Number(row.donationDonors ?? 0),
    totalViews: Number(row.totalViews ?? 0),
    followers: Number(row.followers ?? 0),
    totalMessages: Number(row.totalMessages ?? 0),
  };
}

/**
 * 寫回 ZIXI access token。
 *
 * ⚠️ tokenExpiresAt 的型別轉換：Prisma 傳 Date，而 HTTP 查詢用字串。
 *    這裡直接傳 ISO 字串 —— Neon 的 timestamptz 接受 ISO 8601。
 *
 *    而**不能**寫成 NULL：那會讓「沒有設定過」與「設定成 null」無法區分。
 *    原 Prisma 版本傳的是 Date(now + expires_in*1000)，這裡等價。
 */
export async function saveZixiToken(
  userId: string,
  accessToken: string,
  expiresAtIso: string,
): Promise<void> {
  await query(
    `UPDATE "User"
        SET "zixiAccessToken" = $2, "zixiTokenExpiresAt" = $3
      WHERE "id" = $1`,
    [userId, accessToken, expiresAtIso],
  );
}

/** 只取 session 的 userId（對應 findUnique({ where: { id } }) 後取 .userId）。 */
export async function getSessionUserId(sessionId: string): Promise<string | null> {
  const row = await queryOne<{ userId: string }>(
    'SELECT "userId" FROM "Session" WHERE "id" = $1 LIMIT 1',
    [sessionId],
  );
  return row ? row.userId : null;
}