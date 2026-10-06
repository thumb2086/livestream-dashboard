// meetups-http.ts — 聚會功能的 Neon HTTP 存取
//
// 覆蓋 /api/v1/meetups（9 處 Prisma，全部 `(prisma as any)`）。
//
// ─────────────────────────────────────────────────────────
// ★ 順帶修掉一個繼承的 race condition（capacity 超額）
// ─────────────────────────────────────────────────────────
//
// 原碼的報名流程：
//
//     const count = await meetupRegistration.count({ where: { meetupId } });
//     if (count >= meetup.capacity) return 409;    ← 檢查
//     await meetupRegistration.create(...)          ← 插入
//
// **檢查與插入是兩條語句** —— 兩個並發的報名都會通過檢查，
// 然後都插入，名額超過 capacity。而沒有任何機制會發現。
//
// 修法：**單一條件式 INSERT** —— 檢查與插入在同一條語句裡，
// 而單一語句是原子的：
//
//     INSERT ... SELECT ...
//     WHERE (SELECT COUNT(*) ...) < (SELECT capacity ...)
//
// 那個寫法有個好處：它讓「不超額」變成**資料庫保證**，
// 而不是「應用程式剛好沒有並發」。
//
// ── 重複報名回 409（繼承行為，保留）───────────────────────
//
// 原 Prisma 版靠 unique 約束拋 P2002 再轉 409。
// raw SQL 用 RETURNING：沒插到 → 再查一次是「滿了」還是「重複」，
// 分開回，讓呼叫端能給出正確的錯誤訊息。
import { query, queryOne } from "./db-http";

export interface MeetupRow {
  id: string;
  userId: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string | null;
  capacity: number;
  price: number;
  status: string;
  registrations: Array<{ id: string; name: string; createdAt: string }>;
}

const M_COLS = `"id", "userId", "title", "description", "location", "startsAt",
                 "endsAt", "capacity", "price", "status", "createdAt"`;

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToMeetup(r: Record<string, unknown>): MeetupRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    title: String(r.title ?? ''),
    description: String(r.description ?? ''),
    location: String(r.location ?? ''),
    startsAt: String(r.startsAt ?? ''),
    endsAt: r.endsAt ? String(r.endsAt) : null,
    capacity: num(r.capacity),
    price: num(r.price),
    status: String(r.status ?? 'open'),
    registrations: [],
  };
}

/** 聚會 + 報名名單（一次撈全部再分組，不做 N+1）。 */
export async function listMeetups(userId: string): Promise<MeetupRow[]> {
  const ms = await query<Record<string, unknown>>(
    `SELECT ${M_COLS} FROM "Meetup" WHERE "userId" = $1 ORDER BY "startsAt" DESC`,
    [userId],
  );
  if (!ms.length) return [];

  const regs = await query<{ meetupId: string; id: string; name: string; createdAt: string }>(
    `SELECT "meetupId", "id", "name", "createdAt" FROM "MeetupRegistration"
      WHERE "meetupId" = ANY($1::text[])
      ORDER BY "createdAt" ASC`,
    [ms.map((m) => String(m.id))],
  );

  const byMeetup = new Map<string, Array<{ id: string; name: string; createdAt: string }>>();
  for (const r of regs) {
    const bucket = byMeetup.get(r.meetupId);
    if (bucket) bucket.push({ id: r.id, name: r.name, createdAt: String(r.createdAt) });
    else byMeetup.set(r.meetupId, [{ id: r.id, name: r.name, createdAt: String(r.createdAt) }]);
  }

  return ms.map((m) => {
    const row = rowToMeetup(m);
    row.registrations = byMeetup.get(row.id) || [];
    return row;
  });
}

export async function createMeetup(userId: string, d: {
  title: string; description: string; location: string;
  startsAt: string; endsAt: string | null; capacity: number; price: number; status: string;
}): Promise<void> {
  await query(
    `INSERT INTO "Meetup"
       ("id","userId","title","description","location","startsAt","endsAt","capacity","price","status","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
    [crypto.randomUUID(), userId, d.title, d.description, d.location,
     d.startsAt, d.endsAt, d.capacity, d.price, d.status],
  );
}

/**
 * 更新聚會（對應 updateMany —— 回傳是否真的更新到）。
 *
 * ⚠️ **所有權**：where 必須同時帶 id 與 userId。
 *    沒有 userId 的話，任何登入者都能改別人的聚會 ——
 *    而這條路由有 price 欄位（那是錢相關的）。
 */
export async function updateMeetup(
  id: string, userId: string, d: Record<string, unknown>,
): Promise<boolean> {
  const colMap: Record<string, string> = {
    title: 'title', description: 'description', location: 'location',
    startsAt: 'startsAt', endsAt: 'endsAt', capacity: 'capacity',
    price: 'price', status: 'status',
  };
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const [k, col] of Object.entries(colMap)) {
    if (d[k] !== undefined) {
      params.push(d[k]);
      sets.push(`"${col}" = $${params.length}`);
    }
  }
  if (!sets.length) return false;
  const r = await query<{ id: string }>(
    `UPDATE "Meetup" SET ${sets.join(', ')}
      WHERE "id" = $1 AND "userId" = $2 RETURNING "id"`,
    params,
  );
  return r.length > 0;
}

export async function deleteMeetup(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "Meetup" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}

/**
 * ★★ 報名 —— **單一條件式 INSERT**，檢查與插入是原子的。
 *
 * 回傳：
 *   { ok: true }                    成功
 *   { ok: false, reason: 'full' }   名額已滿
 *   { ok: false, reason: 'dup' }    已報名過（繼承行為：回 409）
 *   { ok: false, reason: 'gone' }   聚會不存在或不是你的
 *
 * ── 為什麼不在應用層先 count 再 insert ──
 *
 * 那是兩條語句，中間有縫：兩個並發報名都會通過檢查。
 * 而單一 INSERT...SELECT 是原子的 —— 資料庫保證不超額。
 *
 * ⚠️ 而 capacity = 0 代表「不限名額」（原碼：`if (capacity > 0)` 才檢查）。
 *    所以條件裡要允許 capacity = 0 直接通過。
 */
export async function registerForMeetup(
  meetupId: string,
  userId: string,
  name: string,
): Promise<{ ok: boolean; reason?: 'full' | 'dup' | 'gone' }> {
  const rows = await query<{ id: string }>(
    `INSERT INTO "MeetupRegistration" ("id","meetupId","name","createdAt")
     SELECT $1, $2, $3, NOW()
      WHERE EXISTS (
        SELECT 1 FROM "Meetup"
         WHERE "id" = $2 AND "userId" = $4
      )
        AND (
          (SELECT "capacity" FROM "Meetup" WHERE "id" = $2) = 0
          OR (SELECT COUNT(*) FROM "MeetupRegistration" WHERE "meetupId" = $2)
             < (SELECT "capacity" FROM "Meetup" WHERE "id" = $2)
        )
        AND NOT EXISTS (
          SELECT 1 FROM "MeetupRegistration"
           WHERE "meetupId" = $2 AND "name" = $3
        )
      RETURNING "id"`,
    [crypto.randomUUID(), meetupId, name, userId],
  );

  if (rows.length > 0) return { ok: true };

  // 沒插到 → 找出原因（呼叫端要給出正確的錯誤訊息）
  const m = await queryOne<{ capacity: number; registered: number; mine: boolean }>(
    `SELECT m."capacity",
            (SELECT COUNT(*) FROM "MeetupRegistration" r WHERE r."meetupId" = m."id") AS registered,
            (m."userId" = $2) AS mine
       FROM "Meetup" m WHERE m."id" = $1 LIMIT 1`,
    [meetupId, userId],
  );
  if (!m) return { ok: false, reason: 'gone' };
  if (!m.mine) return { ok: false, reason: 'gone' };
  if (num(m.capacity) > 0 && num(m.registered) >= num(m.capacity)) return { ok: false, reason: 'full' };
  return { ok: false, reason: 'dup' };
}

/**
 * 移除報名。
 *
 * ⚠️ **所有權**：原碼用 `meetup: { userId }` 巢狀條件 ——
 *    也就是「刪掉**我的聚會**的報名」，不是「刪掉我自己的報名」。
 *    所以這裡 JOIN Meetup 並驗 userId —— 照原樣。
 */
export async function removeRegistration(
  registrationId: string,
  userId: string,
): Promise<boolean> {
  const r = await query<{ id: string }>(
    `DELETE FROM "MeetupRegistration" r
      USING "Meetup" m
      WHERE r."meetupId" = m."id" AND r."id" = $1 AND m."userId" = $2
      RETURNING r."id"`,
    [registrationId, userId],
  );
  return r.length > 0;
}