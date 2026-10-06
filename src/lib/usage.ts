import { query, queryOne } from "@/lib/db-http";
import { QUOTAS, effectivePlan } from "@/lib/plans";

/**
 * Server-side usage metering.
 *
 * Every `usageEvent` row must be written from here, by code that just did the
 * work. It used to be reachable from the client via `_meta=recordUsage`, which
 * meant the only writer was a "add a test row" button on the billing page --
 * so `used` was permanently 0 and the quota bars on the membership pages read
 * 0% forever. A client must never be able to declare its own consumption.
 *
 * Quantities are clamped so a single call cannot poison a period beyond repair,
 * and note is truncated because it carries source details.
 */

/** Guard against a single call poisoning a period beyond repair. */
const MAX_QTY = 100_000;
/** Enough precision to sum without float drift; 0.0001 unit is far below noise. */
const PRECISION = 4;

/** Billing period starts on the 1st, matching what the API reports as periodStart. */
function periodStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Total already consumed for a metric in the current period. */
export async function usedThisPeriod(userId: string, metric: string): Promise<number> {
  const row = await queryOne<{ quantity: string }>(
    `SELECT COALESCE(SUM("quantity"), 0)::text AS quantity
       FROM "UsageEvent"
      WHERE "userId" = $1 AND "metric" = $2 AND "createdAt" >= $3`,
    [userId, metric, periodStart().toISOString()],
  );
  return row ? Number(row.quantity) || 0 : 0;
}

/**
 * Record work that actually happened. Never throws into the caller's critical
 * path: failing to meter should not fail the user's transcription, and a
 * dropped meter row is recoverable whereas a broken request is not.
 */
export async function recordUsage(
  userId: string,
  metric: string,
  quantity: number,
  note = ""
): Promise<void> {
  // Not rounded to whole units. A caption window is ~1 second = 1/60 minute;
  // Math.round(0.0167) is 0, which silently discarded every short window and
  // left `used` permanently at zero -- the exact failure this module exists to
  // fix. `quantity` is a Float for the same reason.
  const qty = Math.max(0, Math.min(MAX_QTY, Number(quantity.toFixed(PRECISION))));
  if (!qty) return;
  try {
    await query(
      `INSERT INTO "UsageEvent" ("id","userId","metric","quantity","note","createdAt")
       VALUES ($1,$2,$3,$4,$5,NOW())`,
      [crypto.randomUUID(), userId, metric.slice(0, 40), qty, String(note).slice(0, 120)],
    );
    // Keep the memoised total consistent with what we just wrote, otherwise the
    // next admission check would under-count our own consumption for the TTL.
    // Only bump an existing entry: seeding a fresh one with just this delta
    // would silently assume the period total is zero.
    const hit = CACHE.get(cacheKey(userId, metric.slice(0, 40)));
    if (hit) hit.used += qty;
  } catch (e) {
    console.error("[usage] failed to record", metric, qty, e);
  }
}

export type QuotaCheck = {
  allowed: boolean;
  limit: number;
  used: number;
  /** Set when the metric is not metered on the current plan at all. */
  unmetered?: boolean;
};

/**
 * Memoised *usage totals* only -- never the plan ceiling.
 *
 * An earlier version cached the whole QuotaCheck and that was wrong: with a
 * `userId:metric` key, a subscription flipping pending -> active kept serving
 * the free ceiling until the TTL expired, i.e. a cached entitlement. Payment
 * settles outside this module, so the subscription is always read fresh.
 *
 * The aggregate is the part worth caching: the caption path calls this once per
 * second of audio. Measured effect of caching it: wall time for a transcription
 * dropped from ~2500ms to ~1050ms against a ~300ms upstream call.
 *
 * Held on globalThis because this module can be instantiated more than once in
 * dev, the same reason the SSE hub needs it.
 */
const CACHE_TTL_MS = 10_000;
type UsageCache = Map<string, { at: number; used: number }>;
const CACHE: UsageCache = (globalThis as any).__usageTotals ??= new Map();

/** Include the period so a month rollover cannot serve a stale total. */
function cacheKey(userId: string, metric: string): string {
  return `${userId}:${metric}:${periodStart().getTime()}`;
}

/**
 * Usage for the period, memoised briefly and bumped locally by recordUsage so
 * our own writes are reflected without re-querying.
 */
async function cachedUsed(userId: string, metric: string): Promise<number> {
  const key = cacheKey(userId, metric);
  const hit = CACHE.get(key);
  const now = Date.now();
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.used;

  const used = await usedThisPeriod(userId, metric);
  CACHE.set(key, { at: now, used });
  return used;
}

/**
 * Whether `want` more of `metric` fits in the granted plan's limit.
 *
 * The subscription is read on every call on purpose -- that read is what makes
 * this an entitlement check rather than a cached guess.
 *
 * A metric absent from the plan's quota list is treated as unmetered rather
 * than blocked: the alternative is a missing quota definition silently bricking
 * a feature.
 */
export async function checkQuota(userId: string, metric: string, want: number): Promise<QuotaCheck> {
  const sub = await queryOne<{ planKey?: string; billingMode?: string; status?: string; currentPeriodEnd?: string | null }>(
    'SELECT "planKey", "billingMode", "status", "currentPeriodEnd" FROM "Subscription" WHERE "userId" = $1 LIMIT 1',
    [userId],
  );
  const plan = effectivePlan(sub);
  const q = (QUOTAS[plan] ?? QUOTAS.free).find((x) => x.metric === metric);
  if (!q) return { allowed: true, limit: Number.MAX_SAFE_INTEGER, used: 0, unmetered: true };

  const used = await cachedUsed(userId, metric);
  return { allowed: used + Math.max(0, want) <= q.limit, limit: q.limit, used };
}

/** Call after a plan change so the next admission check sees the new ceiling. */
export function invalidateQuota(userId?: string): void {
  if (!userId) { CACHE.clear(); return; }
  for (const k of [...CACHE.keys()]) if (k.startsWith(`${userId}:`)) CACHE.delete(k);
}

/** Human-readable reason for a 429, so the UI does not have to invent one. */
export function quotaMessage(metric: string, check: QuotaCheck, unit = ""): string {
  const label = (QUOTAS.free.find((x) => x.metric === metric)?.label ?? metric);
  return `已達目前方案的「${label}」額度（${check.used}/${check.limit}${unit}）。請升級方案，或等下個計費週期重置。`;
}