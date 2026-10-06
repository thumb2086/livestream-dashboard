// giveaways-http.ts — 抽獎功能的 Neon HTTP 存取
//
// 覆蓋 /api/v1/giveaways（13 處 Prisma）。
//
// ─────────────────────────────────────────────────────────
// 所有權模型（照原樣保留，不要「順便改嚴」）
// ─────────────────────────────────────────────────────────
//
// 原 route 的寫入全部帶 userId：
//   toggle / delete / draw / clear → where: { id, userId }
//   join                          → 先 findFirst({ id, userId })
//
// 而 `draw` 與 `clear` 的 **entrants 查詢在所有權檢查之前**：
//
//     const entrants = await giveawayEntrant.findMany({ where: { giveawayId: body.id } });
//     const owned     = await giveaway.findFirst({ where: { id: body.id, userId: user.id } });
//     if (!owned) return 404;
//
// 那不是外洩 —— entrants 沒有被回傳給呼叫端，
// 而 owned 檢查在任何寫入之前就擋下了。
//
// 但它在**讀取別人的資料**。而讀取沒有 userId 條件，
// 意味著任何登入者都能讓伺服器去撈任意 giveawayId 的名單
// （雖然拿不到結果）。
//
// 我把它移到 owned 檢查之後：語意不變（結果相同），
// 但不再對無關的 giveawayId 做讀取 ——
// 而那讓「讀不到不屬於自己的資料」變成結構上保證，
// 而不是靠後面一行擋。
//
// ⚠️ 這是**唯一**一處我調了順序。若要完全零行為差異，
//    保持原順序也可以；我選前者因為它讓意圖更清楚。
import { query, queryOne } from "./db-http";

export interface GiveawayRow {
  id: string;
  userId: string;
  title: string;
  keyword: string;
  enabled: boolean;
  winner: string;
  createdAt: string;
}

export interface EntrantRow {
  id: string;
  giveawayId: string;
  name: string;
  createdAt: string;
}

/**
 * entrants 的取用上限 —— **沿用原值 200**。
 *
 * ⚠️ 這不是「隨便取 200」。它是為了避免一個爆量的抽獎
 *    把回應撐到超過 Worker 的限制。
 *
 *    而它同時是**繼承的限制**：第 201 位參與者不會出現在結果裡，
 *    卻也不會被告知。抽獎隨機挑人時若名單被截斷，
 *    那 201 位之後的人永遠不可能中獎 —— 而沒有人會知道。
 *
 *    記錄下來是為了讓後續有人知道那是**繼承**行為而非疏漏；
 *    若要修，正確方向是分頁 + 明確標示「名單已截斷」。
 */
export const ENTRANT_LIMIT = 200;

const G_COLS = `"id", "userId", "title", "keyword", "enabled", "winner", "createdAt"`;
const E_COLS = `"id", "giveawayId", "name", "createdAt"`;

/** 抽獎 + 其參與者（對應 Prisma 的 include + take:200）。 */
export async function listGiveaways(
  userId: string,
): Promise<Array<GiveawayRow & { entrants: EntrantRow[] }>> {
  const gs = await query<GiveawayRow>(
    `SELECT ${G_COLS} FROM "Giveaway" WHERE "userId" = $1 ORDER BY "createdAt" DESC`,
    [userId],
  );
  if (!gs.length) return [];

  // 一次撈全部參與者，再用 JS 分組 —— 而非每個抽獎查一次。
  // 那是 N+1，而且 N 是使用者的抽獎數（會長大）。
  const all = await query<EntrantRow>(
    `SELECT ${E_COLS} FROM "GiveawayEntrant"
      WHERE "giveawayId" = ANY($1::text[])
      ORDER BY "createdAt" ASC`,
    [gs.map((g) => g.id)],
  );

  const byGiveaway = new Map<string, EntrantRow[]>();
  for (const e of all) {
    // get() 的回傳型別是 T | undefined，而 strict 模式不會縮窄。
    // 而 `!` 在這裡是安全的：我剛剛才用 set() 確認過那個 key 存在。
    // 這是「型別無法表達的不變量」，用邏輯表達而非謊騙編譯器。
    const bucket = byGiveaway.get(e.giveawayId);
    if (bucket) bucket.push(e);
    else byGiveaway.set(e.giveawayId, [e]);
  }

  return gs.map((g) => ({
    ...g,
    // 每個抽獎各自截到 200（沿用原語意），
    // 而取用順序是「所有抽獎混合後 createdAt 排序」——
    // 那與「逐一查詢再排序」等價。
    entrants: (byGiveaway.get(g.id) || []).slice(0, ENTRANT_LIMIT),
  }));
}

export async function createGiveaway(
  userId: string,
  title: string,
  keyword: string,
): Promise<void> {
  await query(
    `INSERT INTO "Giveaway" ("id","userId","title","keyword","createdAt")
     VALUES ($1,$2,$3,$4,NOW())`,
    [crypto.randomUUID(), userId, title, keyword],
  );
}

/** 回傳是否真的更新到（呼叫端可以忽略 —— 原碼不檢查）。 */
export async function setGiveawayEnabled(
  id: string, userId: string, enabled: boolean,
): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "Giveaway" SET "enabled" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, enabled],
  );
  return r.length > 0;
}

export async function deleteGiveaway(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "Giveaway" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}

export async function getGiveaway(id: string, userId: string): Promise<GiveawayRow | null> {
  return queryOne<GiveawayRow>(
    `SELECT ${G_COLS} FROM "Giveaway" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
    [id, userId],
  );
}

/**
 * 加入抽獎（對應 Prisma 的 upsert on giveawayId_name）。
 *
 * ⚠️ 重複加入不會報錯也不會重複 —— 那就是 upsert 的目的。
 *    `update: {}` 表示「已存在就什麼都不做」。
 */
export async function joinGiveaway(giveawayId: string, name: string): Promise<void> {
  await query(
    `INSERT INTO "GiveawayEntrant" ("id","giveawayId","name","createdAt")
     VALUES ($1,$2,$3,NOW())
     ON CONFLICT ("giveawayId","name") DO NOTHING`,
    [crypto.randomUUID(), giveawayId, name],
  );
}

/** 依 giveawayId 取參與者（**沒有** userId 條件 —— 原碼就是這樣）。 */
export async function listEntrants(giveawayId: string): Promise<EntrantRow[]> {
  return query<EntrantRow>(
    `SELECT ${E_COLS} FROM "GiveawayEntrant" WHERE "giveawayId" = $1 ORDER BY "createdAt" ASC`,
    [giveawayId],
  );
}

export async function setWinner(
  id: string, userId: string, winner: string,
): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "Giveaway" SET "winner" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, winner],
  );
  return r.length > 0;
}

export async function clearEntrants(giveawayId: string): Promise<number> {
  const r = await query<{ id: string }>(
    'DELETE FROM "GiveawayEntrant" WHERE "giveawayId" = $1 RETURNING "id"',
    [giveawayId],
  );
  return r.length;
}