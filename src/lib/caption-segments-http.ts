// caption-segments-http.ts — 字幕分段的 Neon HTTP 存取
//
// 覆蓋 /api/v1/captions/segments（6 處 Prisma）。
import { query, queryOne } from "./db-http";

export interface CaptionSessionRow {
  id: string;
  userId: string;
  label: string;
  status: string;
  createdAt: string;
  endedAt: string | null;
}

export interface CaptionSegmentRow {
  id: string;
  sessionId: string;
  userId: string;
  text: string;
  speaker: string;
  seq: number;
  status: string;
  createdAt: string;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToSession(r: Record<string, unknown>): CaptionSessionRow {
  return {
    id: String(r.id), userId: String(r.userId), label: String(r.label ?? ''),
    status: String(r.status ?? 'active'), createdAt: String(r.createdAt ?? ''),
    endedAt: r.endedAt ? String(r.endedAt) : null,
  };
}

function rowToSegment(r: Record<string, unknown>): CaptionSegmentRow {
  return {
    id: String(r.id), sessionId: String(r.sessionId), userId: String(r.userId),
    text: String(r.text ?? ''), speaker: String(r.speaker ?? ''),
    seq: num(r.seq), status: String(r.status ?? 'final'),
    createdAt: String(r.createdAt ?? ''),
  };
}

export async function findCaptionSource(token: string): Promise<{ userId: string } | null> {
  const r = await queryOne<{ userId: string }>(
    'SELECT "userId" FROM "OBSSource" WHERE "token" = $1 AND "sourceKey" = $2 LIMIT 1',
    [token, "captions"],
  );
  return r;
}

export async function listSegmentsSince(userId: string, since: Date, take = 30): Promise<CaptionSegmentRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT "id", "sessionId", "userId", "text", "speaker", "seq", "status", "createdAt"
       FROM "CaptionSegment"
      WHERE "userId" = $1 AND "createdAt" > $2
      ORDER BY "createdAt" DESC
      LIMIT $3`,
    [userId, since.toISOString(), take],
  );
  return rows.map(rowToSegment);
}

export async function findActiveSession(userId: string): Promise<CaptionSessionRow | null> {
  const r = await queryOne<Record<string, unknown>>(
    `SELECT * FROM "CaptionSession"
      WHERE "userId" = $1 AND "status" = 'active'
      ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  return r ? rowToSession(r) : null;
}

export async function createCaptionSession(userId: string, label: string): Promise<CaptionSessionRow> {
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO "CaptionSession" ("id","userId","label","status","createdAt")
     VALUES ($1,$2,$3,'active',NOW())
     RETURNING *`,
    [crypto.randomUUID(), userId, label],
  );
  return rowToSession(rows[0]);
}

export async function getLastSegment(sessionId: string): Promise<{ seq: number } | null> {
  const r = await queryOne<{ seq: number }>(
    'SELECT "seq" FROM "CaptionSegment" WHERE "sessionId" = $1 ORDER BY "seq" DESC LIMIT 1',
    [sessionId],
  );
  return r ? { seq: num(r.seq) } : null;
}

export async function createSegment(sessionId: string, userId: string, data: {
  text: string; speaker: string; seq: number; status: string;
}): Promise<CaptionSegmentRow> {
  const rows = await query<Record<string, unknown>>(
    `INSERT INTO "CaptionSegment" ("id","sessionId","userId","text","speaker","seq","status","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     RETURNING *`,
    [crypto.randomUUID(), sessionId, userId, data.text, data.speaker, data.seq, data.status],
  );
  return rowToSegment(rows[0]);
}
