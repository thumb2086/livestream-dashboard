import { prisma } from "@/lib/prisma";
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

const MAX_QTY = 100_000;

/** Billing period starts on the 1st, matching what the API reports as periodStart. */
function periodStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Total already consumed for a metric in the current period. */
export async function usedThisPeriod(userId: string, metric: string): Promise<number> {
  const row = await (prisma as any).usageEvent.aggregate({
    where: { userId, metric, createdAt: { gte: periodStart() } },
    _sum: { quantity: true },
  });
  return row?._sum?.quantity ?? 0;
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
  const qty = Math.max(0, Math.min(MAX_QTY, Math.round(quantity)));
  if (!qty) return;
  try {
    await (prisma as any).usageEvent.create({
      data: {
        userId,
        metric: metric.slice(0, 40),
        quantity: qty,
        note: String(note).slice(0, 120),
      },
    });
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
 * Whether `want` more of `metric` fits in the granted plan's limit.
 *
 * A metric absent from the plan's quota list is treated as unmetered rather
 * than blocked -- the alternative is a missing quota definition silently
 * bricking a feature.
 */
export async function checkQuota(userId: string, metric: string, want: number): Promise<QuotaCheck> {
  const sub = await (prisma as any).subscription.findUnique({ where: { userId } });
  const plan = effectivePlan(sub);
  const q = (QUOTAS[plan] ?? QUOTAS.free).find((x) => x.metric === metric);
  if (!q) return { allowed: true, limit: Number.MAX_SAFE_INTEGER, used: 0, unmetered: true };

  const used = await usedThisPeriod(userId, metric);
  return { allowed: used + Math.max(0, want) <= q.limit, limit: q.limit, used };
}

/** Human-readable reason for a 429, so the UI does not have to invent one. */
export function quotaMessage(metric: string, check: QuotaCheck, unit = ""): string {
  const label = (QUOTAS.free.find((x) => x.metric === metric)?.label ?? metric);
  return `已達目前方案的「${label}」額度（${check.used}/${check.limit}${unit}）。請升級方案，或等下個計費週期重置。`;
}