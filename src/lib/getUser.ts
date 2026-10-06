// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
//
// ── 為什麼這個檔案特別重要 ──────────────────────────────────
//
// getOrCreateUser 是**每一條 API 路由的第一道關卡**
// （`const user = await getOrCreateUser(getSessionId(req))`）。
//
// 所以在 Cloudflare Workers 上，只要這裡用 Prisma，
// **整個 API 都是壞的** —— 不只是「某幾條路由」。
//
// ⚠️ 而這與我在 overlay 那次的錯完全同型：
//    修了 overlay 的路由，卻沒追「它們呼叫的共用 helper」；
//    而共用層的影響範圍更大 —— 它在每條路由的入口。
//
// 掃描器當時報「overlay 全部零 Prisma」，而 getUser.ts 有 1 處 ——
// 那是真的，但位置在 src/lib/ 而不在 overlay/，
// 所以對「overlay 能不能跑」不構成直接證據，
// 卻是「整個 API 能不能跑」的決定性因素。
//
// ── 為什麼保留「一次查詢」 ──────────────────────────────────
//
// 原註解寫著 extra query costs ~400ms against a remote database，
// 且「the transcription endpoint went from a 491ms upstream call to 2.5s wall」。
//
// 所以 auth-http.ts 用**一個 JOIN** 取 session + user。
// 分成兩次查詢在 Neon（跨網路）上會讓每個請求多 400ms ——
// 而那是**所有** API 路由的成本。
import { getSessionUser } from "./auth-http";

export async function getOrCreateUser(sessionId?: string) {
  if (!sessionId) return null;
  return getSessionUser(sessionId);
}

export function getSessionId(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/sf_session=([^;]+)/);
  return match?.[1];
}

export function unauthorized() {
  return Response.json({ error: "請先登入" }, { status: 401 });
}
