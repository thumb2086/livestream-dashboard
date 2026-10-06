// replay-notes-http.ts — 回放筆記的 Neon HTTP 存取
//
// 覆蓋 /api/v1/replay-notes（6 處 Prisma）。
import { query, queryOne } from "./db-http";

export interface ReplayNoteRow {
  id: string;
  userId: string;
  title: string;
  sourceUrl: string;
  startsAt: string;
  endsAt: string;
  note: string;
  createdAt: string;
}

const NOTE_COLS = `"id", "userId", "title", "sourceUrl", "startsAt", "endsAt", "note", "createdAt"`;

function rowToNote(r: Record<string, unknown>): ReplayNoteRow {
  return {
    id: String(r.id), userId: String(r.userId), title: String(r.title ?? ''),
    sourceUrl: String(r.sourceUrl ?? ''), startsAt: String(r.startsAt ?? ''),
    endsAt: String(r.endsAt ?? ''), note: String(r.note ?? ''),
    createdAt: String(r.createdAt ?? ''),
  };
}

export async function listReplayNotes(userId: string, take = 100): Promise<ReplayNoteRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${NOTE_COLS} FROM "ReplayNote" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [userId, take],
  );
  return rows.map(rowToNote);
}

export async function countReplayNotes(userId: string): Promise<number> {
  const r = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM "ReplayNote" WHERE "userId" = $1', [userId]);
  return r ? Number(r.count) : 0;
}

export async function createReplayNote(userId: string, data: {
  title: string; sourceUrl: string; startsAt: string; endsAt: string; note: string;
}): Promise<void> {
  await query(
    `INSERT INTO "ReplayNote" ("id","userId","title","sourceUrl","startsAt","endsAt","note","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [crypto.randomUUID(), userId, data.title, data.sourceUrl, data.startsAt, data.endsAt, data.note],
  );
}

export async function updateReplayNote(id: string, userId: string, data: Partial<{
  title: string; sourceUrl: string; startsAt: string; endsAt: string; note: string;
}>): Promise<boolean> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const k of ['title', 'sourceUrl', 'startsAt', 'endsAt', 'note'] as const) {
    if (data[k] !== undefined) {
      params.push(data[k]);
      sets.push(`"${k}" = $${params.length}`);
    }
  }
  if (!sets.length) return false;
  const r = await query<{ id: string }>(
    `UPDATE "ReplayNote" SET ${sets.join(', ')} WHERE "id" = $1 AND "userId" = $2 RETURNING "id"`,
    params,
  );
  return r.length > 0;
}

export async function deleteReplayNote(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "ReplayNote" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}
