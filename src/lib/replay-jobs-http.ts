// replay-jobs-http.ts — 回放分析工作的 Neon HTTP 存取
//
// 覆蓋 /api/v1/replay-jobs（8 處 Prisma，全部 `(prisma as any)`）。
//
// 涉及的表：ReplayJob, ReplaySegment
//
// ⚠️ 所有 `(prisma as any)` 都改成明確型別。
import { query, queryOne } from "./db-http";

export interface ReplayJobRow {
  id: string;
  userId: string;
  title: string;
  replayUrl: string;
  language: string;
  status: string;
  progress: number;
  summary: string;
  createdAt: string;
  completedAt: string | null;
  segments: ReplaySegmentRow[];
}

export interface ReplaySegmentRow {
  id: string;
  jobId: string;
  startSec: number;
  endSec: number;
  transcript: string;
  score: number;
  hook: number;
  peak: number;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const JOB_COLS = `"id", "userId", "title", "replayUrl", "language", "status", "progress", "summary", "createdAt", "completedAt"`;
const SEG_COLS = `"id", "jobId", "startSec", "endSec", "transcript", "score", "hook", "peak"`;

export async function listReplayJobs(userId: string, take = 50): Promise<ReplayJobRow[]> {
  const jobs = await query<Record<string, unknown>>(
    `SELECT ${JOB_COLS} FROM "ReplayJob" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [userId, take],
  );
  if (!jobs.length) return [];

  const segs = await query<Record<string, unknown>>(
    `SELECT ${SEG_COLS} FROM "ReplaySegment" WHERE "jobId" = ANY($1::text[]) ORDER BY "startSec" ASC`,
    [jobs.map((j) => String(j.id))],
  );

  const byJob = new Map<string, ReplaySegmentRow[]>();
  for (const s of segs) {
    const bucket = byJob.get(String(s.jobId));
    const row = rowToSeg(s);
    if (bucket) bucket.push(row);
    else byJob.set(String(s.jobId), [row]);
  }

  return jobs.map((j) => ({
    ...rowToJob(j),
    segments: byJob.get(String(j.id)) || [],
  }));
}

function rowToJob(r: Record<string, unknown>): ReplayJobRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    title: String(r.title ?? ''),
    replayUrl: String(r.replayUrl ?? ''),
    language: String(r.language ?? 'zh'),
    status: String(r.status ?? 'queued'),
    progress: num(r.progress),
    summary: String(r.summary ?? ''),
    createdAt: String(r.createdAt ?? ''),
    completedAt: r.completedAt ? String(r.completedAt) : null,
    segments: [],
  };
}

function rowToSeg(r: Record<string, unknown>): ReplaySegmentRow {
  return {
    id: String(r.id),
    jobId: String(r.jobId),
    startSec: num(r.startSec),
    endSec: num(r.endSec),
    transcript: String(r.transcript ?? ''),
    score: num(r.score),
    hook: num(r.hook),
    peak: num(r.peak),
  };
}

export async function countRunningJobs(userId: string): Promise<number> {
  const r = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM "ReplayJob" WHERE "userId" = $1 AND "status" IN (\'queued\', \'running\')',
    [userId],
  );
  return r ? num(r.count) : 0;
}

export async function createReplayJob(userId: string, data: {
  title: string; replayUrl: string; language: string;
}): Promise<void> {
  await query(
    `INSERT INTO "ReplayJob" ("id","userId","title","replayUrl","language","status","progress","createdAt")
     VALUES ($1,$2,$3,$4,$5,'queued',0,NOW())`,
    [crypto.randomUUID(), userId, data.title, data.replayUrl, data.language],
  );
}

export async function getReplayJob(userId: string, id: string): Promise<ReplayJobRow | null> {
  const r = await queryOne<Record<string, unknown>>(
    `SELECT ${JOB_COLS} FROM "ReplayJob" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
    [id, userId],
  );
  return r ? { ...rowToJob(r), segments: [] } : null;
}

export async function updateReplayJob(
  id: string,
  data: { progress: number; status: string; completedAt: string | null; summary: string },
): Promise<void> {
  await query(
    'UPDATE "ReplayJob" SET "progress" = $2, "status" = $3, "completedAt" = $4, "summary" = $5 WHERE "id" = $1',
    [id, data.progress, data.status, data.completedAt, data.summary],
  );
}

export async function failReplayJob(id: string, summary: string): Promise<void> {
  await query(
    'UPDATE "ReplayJob" SET "status" = \'failed\', "summary" = $2 WHERE "id" = $1',
    [id, summary],
  );
}

export async function deleteReplayJob(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "ReplayJob" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}

export async function setReplayJobStatus(id: string, userId: string, status: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "ReplayJob" SET "status" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, status],
  );
  return r.length > 0;
}
