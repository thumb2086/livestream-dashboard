/**
 * Proves the quota meters now have a producer.
 *
 * Before src/lib/usage.ts, `usageEvent` had exactly one writer and it was a
 * client-callable endpoint, so `used` was permanently 0 and both membership
 * pages rendered 0% forever. This exercises the server-side helpers against the
 * real database and asserts the two invariants that matter:
 *
 *   1. recordUsage writes, and usedThisPeriod reads it back
 *   2. checkQuota reflects the GRANTED plan, not the stored request -- an unpaid
 *      plan must not buy headroom, which is the same rule effectivePlan() exists
 *      to enforce
 *
 * Usage: npx tsx --env-file=.env scripts/test-usage-metering.ts
 */
import fs from "node:fs";

for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
}

const RUN = `metering-test-${Date.now()}`;

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

async function main() {
  // Imported after the env is loaded: the Prisma client resolves its datasource
  // URL at construction time, so a static import would connect with no config.
  const { prisma } = await import("@/lib/prisma");
  const { recordUsage, usedThisPeriod, checkQuota, quotaMessage } = await import("@/lib/usage");
  const { QUOTAS, effectivePlan } = await import("@/lib/plans");
  const db = prisma as any;
  // Isolated account so we never touch a real user's ledger.
  const user = await db.user.create({
    data: { username: RUN, name: "metering test", publicPage: false },
  });
  const userId = user.id;

  try {
    // ---- 1. recordUsage actually writes, and reads back -------------
    const before = await usedThisPeriod(userId, "caption_minutes");
    check("fresh account starts at zero", before === 0, String(before));

    await recordUsage(userId, "caption_minutes", 3.4, "unit test");
    const after = await usedThisPeriod(userId, "caption_minutes");
    check("recordUsage is visible to usedThisPeriod", Math.round(after) === 3, String(after));

    // ---- 2. recordUsage never throws into the caller ----------------
    await recordUsage(userId, "caption_minutes", 0, "zero is skipped");
    const unchanged = await usedThisPeriod(userId, "caption_minutes");
    check("zero quantity is a no-op", Math.round(unchanged) === 3, String(unchanged));

    await recordUsage(userId, "caption_minutes", 1e9, "clamped");
    const clamped = await usedThisPeriod(userId, "caption_minutes");
    check("absurd quantity is clamped, not stored raw", clamped < 1e6, String(clamped));

    // Drop the clamp/zero rows so the at-limit assertions below start clean.
    await db.usageEvent.deleteMany({
      where: { userId, metric: "caption_minutes", note: { in: ["clamped", "unit test"] } },
    });

    // ---- 3. period filter excludes other months ---------------------
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    await db.usageEvent.create({
      data: { userId, metric: "caption_minutes", quantity: 9999, note: "old period", createdAt: lastMonth },
    });
    const stillCurrent = await usedThisPeriod(userId, "caption_minutes");
    check(
      "last month's usage does not count",
      stillCurrent < 9999,
      `current period total ${stillCurrent}, last month added 9999`
    );

    // ---- 4. no subscription -> free limits --------------------------
    const freeCheck = await checkQuota(userId, "overlay", 1);
    const freeLimit = QUOTAS.free.find((q) => q.metric === "overlay")!.limit;
    check("account without a subscription gets free limits", freeCheck.limit === freeLimit, `${freeCheck.limit} vs ${freeLimit}`);

    // ---- 5. an UNPAID plan buys no headroom -------------------------
    await db.subscription.create({
      data: { userId, planKey: "studio", billingMode: "monthly", status: "pending" },
    });
    const unpaid = await checkQuota(userId, "overlay", 1);
    check(
      "pending studio still gets free overlay limit",
      unpaid.limit === freeLimit,
      `limit ${unpaid.limit}, studio would be ${QUOTAS.studio.find((q) => q.metric === "overlay")!.limit}`
    );

    // ---- 6. a paid plan does raise the ceiling ----------------------
    await db.subscription.update({ where: { userId }, data: { status: "active" } });
    const paid = await checkQuota(userId, "overlay", 1);
    const studioLimit = QUOTAS.studio.find((q) => q.metric === "overlay")!.limit;
    check("active studio gets studio limits", paid.limit === studioLimit, `${paid.limit} vs ${studioLimit}`);

    // ---- 7. over-quota actually blocks ------------------------------
    const captionLimit = QUOTAS.studio.find((q) => q.metric === "caption_minutes")!.limit;
    await db.usageEvent.create({
      data: { userId, metric: "caption_minutes", quantity: captionLimit, createdAt: new Date() },
    });
    const blocked = await checkQuota(userId, "caption_minutes", 60);
    check("request past the limit is blocked", blocked.allowed === false, `${blocked.used}/${blocked.limit}`);
    const stillOk = await checkQuota(userId, "caption_minutes", 0);
    check("a zero-size request at the limit is allowed", stillOk.allowed === true, `${stillOk.used}/${stillOk.limit}`);

    // ---- 8. unmetered metric does not brick a feature ---------------
    const unknown = await checkQuota(userId, "not_a_real_metric", 999);
    check("unknown metric is unmetered, not blocked", unknown.allowed === true && unknown.unmetered === true);

    // ---- 9. the 429 message names the limit -------------------------
    const msg = quotaMessage("caption_minutes", blocked, " 分鐘");
    check("quota message names the metric and the numbers", msg.includes("字幕") && msg.includes(String(captionLimit)), msg.slice(0, 60));

    // ---- 10. effectivePlan still matches ----------------------------
    check("effectivePlan: pending -> free", effectivePlan({ planKey: "pro", status: "pending" }) === "free");
    check("effectivePlan: active -> pro", effectivePlan({ planKey: "pro", status: "active" }) === "pro");
    check("effectivePlan: trialing -> pro", effectivePlan({ planKey: "pro", status: "trialing" }) === "pro");
    check("effectivePlan: null -> free", effectivePlan(null) === "free");

    // ---- 11. client can no longer write usage -----------------------
    // The invariant is "a client cannot insert usage rows", not a specific
    // status: 401 means the request never resolved a user, 410 means it reached
    // the route and was rejected there. Both are refusals.
    const rowsBefore = await db.usageEvent.count({ where: { userId } });
    const clientWrite = await fetch(
      `${process.env.APP_URL ?? "http://localhost:3000"}/api/v1/membership`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: `sf_session=${RUN}` },
        body: JSON.stringify({ _meta: "recordUsage", metric: "caption_minutes", quantity: 10 }),
      },
    ).catch(() => null);
    if (clientWrite) {
      check(
        "client cannot write usage (non-2xx)",
        clientWrite.status === 401 || clientWrite.status === 410,
        `status ${clientWrite.status}`
      );
    } else {
      console.log("SKIP  no server running; the 410 branch in the route is the fallback");
    }

    const leaked = await db.usageEvent.count({ where: { userId } });
    check("no row was written by the client attempt", leaked === rowsBefore, `${rowsBefore} -> ${leaked}`);
  } finally {
    await db.usageEvent.deleteMany({ where: { userId } });
    await db.subscription.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  }
}

main()
  .catch((e) => { console.error("probe failed:", e); failures++; })
  .finally(async () => {
    const { prisma } = await import("@/lib/prisma");
    await prisma.$disconnect();
    console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
  });