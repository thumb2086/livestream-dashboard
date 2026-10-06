// obs-http.ts — OBS Browser Source tokens 的 Neon HTTP 存取
//
// 覆蓋 /api/v1/obs（5 處 Prisma，全部 `(prisma as any)`）。
import { query, queryOne } from "./db-http";

export interface OBSSourceRow {
  id: string;
  userId: string;
  sourceKey: string;
  name: string;
  token: string;
  enabled: boolean;
}

export async function listOBSSources(userId: string): Promise<OBSSourceRow[]> {
  return query<OBSSourceRow>(
    'SELECT "id", "userId", "sourceKey", "name", "token", "enabled" FROM "OBSSource" WHERE "userId" = $1',
    [userId],
  );
}

export async function createOBSSource(userId: string, sourceKey: string, name: string, token: string, enabled: boolean): Promise<OBSSourceRow | null> {
  const rows = await query<OBSSourceRow>(
    `INSERT INTO "OBSSource" ("id","userId","sourceKey","name","token","enabled")
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING "id", "userId", "sourceKey", "name", "token", "enabled"`,
    [crypto.randomUUID(), userId, sourceKey, name, token, enabled],
  );
  return rows[0] ?? null;
}

export async function setOBSSourceEnabled(id: string, userId: string, enabled: boolean): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "OBSSource" SET "enabled" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, enabled],
  );
  return r.length > 0;
}

export async function rotateOBSToken(id: string, userId: string, token: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "OBSSource" SET "token" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, token],
  );
  return r.length > 0;
}

export async function renameOBSSource(id: string, userId: string, name: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "OBSSource" SET "name" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, name],
  );
  return r.length > 0;
}
