// live-commands-http.ts — 聊天室指令的 Neon HTTP 存取
//
// 覆蓋 /api/v1/commands（7 處 Prisma，全部 `(prisma as any)`）。
import { query, queryOne } from "./db-http";

export interface LiveCommandRow {
  id: string;
  userId: string;
  trigger: string;
  response: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const CMD_COLS = `"id", "userId", "trigger", "response", "enabled", "sortOrder", "createdAt"`;

function rowToCmd(r: Record<string, unknown>): LiveCommandRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    trigger: String(r.trigger ?? ''),
    response: String(r.response ?? ''),
    enabled: Boolean(r.enabled),
    sortOrder: num(r.sortOrder),
    createdAt: String(r.createdAt ?? ''),
  };
}

export async function listCommands(userId: string): Promise<LiveCommandRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${CMD_COLS} FROM "LiveCommand" WHERE "userId" = $1 ORDER BY "sortOrder" ASC`,
    [userId],
  );
  return rows.map(rowToCmd);
}

export async function countCommands(userId: string): Promise<number> {
  const r = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM "LiveCommand" WHERE "userId" = $1', [userId]);
  return r ? num(r.count) : 0;
}

export async function createCommand(userId: string, trigger: string, response: string, sortOrder: number): Promise<void> {
  await query(
    `INSERT INTO "LiveCommand" ("id","userId","trigger","response","enabled","sortOrder","createdAt")
     VALUES ($1,$2,$3,$4,true,$5,NOW())`,
    [crypto.randomUUID(), userId, trigger, response, sortOrder],
  );
}

export async function updateCommand(id: string, userId: string, trigger: string, response: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "LiveCommand" SET "trigger" = $3, "response" = $4 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, trigger, response],
  );
  return r.length > 0;
}

export async function setCommandEnabled(id: string, userId: string, enabled: boolean): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "LiveCommand" SET "enabled" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, enabled],
  );
  return r.length > 0;
}

export async function deleteCommand(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "LiveCommand" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}
