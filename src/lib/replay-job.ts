import { downloadAudio, transcribeRange, scoreSegment } from "./replay-analysis";
import { prisma } from "./prisma";

/** How many seconds of audio one `advance` call transcribes. */
const SECONDS_PER_STEP = 60;
/** Guard against a VOD long enough to run forever. */
const MAX_DURATION_SEC = 3 * 60 * 60;

type Job = {
  id: string;
  replayUrl: string;
  language: string;
  progress: number;
  summary: string;
};

export type AdvanceResult = {
  progress: number;
  status: "running" | "completed" | "failed";
  summary: string;
};

// ── decoded-audio cache ──────────────────────────────────────────────────────

type CacheEntry = { pcm: Buffer; durationSec: number; fetchedAt: number };
const audioCache = new Map<string, CacheEntry>();
/** Keep at most two decoded recordings resident so a long VOD cannot exhaust RAM. */
const MAX_CACHED_JOBS = 2;
const CACHE_TTL_MS = 60 * 60 * 1000;

function remember(jobId: string, entry: CacheEntry) {
  if (audioCache.size >= MAX_CACHED_JOBS) {
    const oldest = [...audioCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
    if (oldest) audioCache.delete(oldest[0]);
  }
  audioCache.set(jobId, entry);
}

async function ensureAudio(job: Job): Promise<CacheEntry> {
  const hit = audioCache.get(job.id);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit;

  const { pcm, durationSec } = await downloadAudio(job.replayUrl);
  const entry = { pcm, durationSec, fetchedAt: Date.now() };
  remember(job.id, entry);
  return entry;
}

export function clearAudioCache() {
  audioCache.clear();
}

// ── the pipeline ─────────────────────────────────────────────────────────────

/**
 * One bounded step of real replay analysis.
 *
 * Each call does a fixed amount of work and persists the result, so a long VOD
 * can be processed across several requests without holding an HTTP handler open.
 */
export async function advanceReplay(job: Job): Promise<AdvanceResult> {
  const segments: any[] = await (prisma as any).replaySegment.findMany({
    where: { jobId: job.id },
    orderBy: { startSec: "asc" },
  });

  // Step 1: fetch and decode, so we learn the real duration before transcribing.
  const audio = await ensureAudio(job);
  const durationSec = audio.durationSec;
  if (durationSec > MAX_DURATION_SEC) {
    throw new Error(
      `影片長度 ${Math.round(durationSec / 60)} 分鐘，超過 ${MAX_DURATION_SEC / 60} 分鐘上限`
    );
  }

  const processedSec = segments.reduce((max, s) => Math.max(max, s.endSec || 0), 0);

  if (segments.length === 0) {
    return {
      progress: 5,
      status: "running",
      summary: `已下載並解析音訊，長度約 ${Math.round(durationSec)} 秒`,
    };
  }

  // Everything transcribed: summarise what we actually produced.
  if (processedSec >= durationSec) {
    const best = [...segments].sort((a, b) => b.score - a.score)[0];
    const chars = segments.reduce((n, s) => n + (s.transcript || "").length, 0);
    return {
      progress: 100,
      status: "completed",
      summary:
        `分析完成：${segments.length} 段、共 ${chars} 字` +
        (best
          ? `；最高分片段 ${Math.floor(best.startSec / 60)}:${String(best.startSec % 60).padStart(2, "0")}（${best.score} 分）`
          : ""),
    };
  }

  // Step 2: transcribe and score the next slice of real audio.
  const startSec = processedSec;
  const endSec = Math.min(durationSec, startSec + SECONDS_PER_STEP);
  const text = await transcribeRange(audio.pcm, startSec, endSec - startSec, job.language);

  const predicted = Math.ceil(durationSec / SECONDS_PER_STEP);
  const index = segments.length;
  const { hook, peak, score } = scoreSegment(text, index, predicted);

  await (prisma as any).replaySegment.create({
    data: {
      jobId: job.id,
      startSec: Math.floor(startSec),
      endSec: Math.floor(endSec),
      transcript: text,
      score,
      hook,
      peak,
    },
  });

  const done = endSec >= durationSec;
  return {
    progress: Math.min(100, Math.round((endSec / durationSec) * 100)),
    status: done ? "completed" : "running",
    summary: done
      ? `分析完成：${index + 1} 段`
      : `已分析到 ${Math.floor(endSec)} / ${Math.round(durationSec)} 秒`,
  };
}
