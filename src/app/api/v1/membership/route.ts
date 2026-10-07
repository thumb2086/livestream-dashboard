import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// 原本 8 處全是 `(prisma as any)`，讓掃描器一度判定「零 Prisma」（同一課題）。
import {
  getSubscription, listUsageEvents, listInvoices, countOverlays, getAccount,
  upsertSubscription, createInvoice,
} from "@/lib/membership-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { PLANS, QUOTAS, effectivePlan } from "@/lib/plans";
import { invalidateQuota } from "@/lib/usage";
import { getZixiUserId, chargeZixi, confirmZixiCharge } from "@/lib/zixi-payments";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Re-exported for `scripts/test-plan-entitlement.ts`, which imported it from here
 * before the logic moved into src/lib/plans.ts (a lib must not import a route).
 * Single source of truth is still one place.
 */
export { effectivePlan };

async function load(userId: string) {
  const [subscription, usage, invoices, account, overlays] = await Promise.all([
    getSubscription(userId),
    listUsageEvents(userId, 200),
    listInvoices(userId, 100),
    getAccount(userId),
    countOverlays(userId),
  ]);

  const planKey = effectivePlan(subscription);
  const quota = QUOTAS[planKey] ?? QUOTAS.free;

  const periodStart = new Date();
  periodStart.setDate(1);
  periodStart.setHours(0, 0, 0, 0);

  const used: Record<string, number> = {};
  for (const u of usage) {
    if (new Date(u.createdAt) < periodStart) continue;
    used[u.metric] = (used[u.metric] ?? 0) + (u.quantity ?? 0);
  }

  return {
    subscription: subscription ?? { planKey: "free", billingMode: "monthly", status: "active" },
    // What the limits above were computed from, which differs from the stored
    // request while a plan is unpaid.
    effectivePlan: planKey,
    pendingUpgrade: planKey === "free" && subscription?.planKey && subscription.planKey !== "free",
    usage,
    invoices,
    // Read-only identity for the account menu. Never a writable field: the
    // email in particular has to stay owner-controlled.
    account: {
      name: account?.name ?? "",
      username: account?.username ?? "",
      email: account?.email ?? "",
      avatar: account?.avatar ?? "",
    },
    quotas: quota.map((q) => ({
      ...q,
      // Concurrency metrics are measured, not accumulated. See the oBSSource
      // count above; `ai_credits` and `caption_minutes` stay summed from
      // usageEvent because those are genuinely consumed over the period.
      used: q.metric === "overlay" ? overlays : used[q.metric] ?? 0,
    })),
    overlayCount: overlays,
    periodStart: periodStart.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("GET /api/v1/membership error:", e);
    return NextResponse.json({ error: "Failed to fetch membership" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "changePlan") {
      const planKey = str(body.planKey, 20);
      const plan = PLANS.find((p) => p.key === planKey);
      if (!plan) return NextResponse.json({ error: "unknown plan" }, { status: 400 });
      const billingMode = body.billingMode === "yearly" ? "yearly" : "monthly";

      // 2026-10-07：正式接上 ZXC 扣款。
      // 以前是「先設 pending + 建 invoice」而沒有任何收款，
      // 使用者按升級就變成 pending、錢從不進來。
      const amount = billingMode === "yearly" ? plan.yearly : plan.monthly;

      if (planKey === "free") {
        await upsertSubscription(user.id, {
          planKey: "free",
          billingMode: "monthly",
          status: "active",
          currentPeriodEnd: null,
        });
        invalidateQuota(user.id);
      } else {
        if (!user.zixiAccessToken) {
          return NextResponse.json(
            { error: "請先連結 ZIXI 帳號，才能用子熙幣購買方案" },
            { status: 400 }
          );
        }
        const zixiUserId = await getZixiUserId(user.zixiAccessToken);
        if (!zixiUserId) {
          return NextResponse.json(
            { error: "ZIXI 授權已失效，請重新連結 ZIXI 帳號" },
            { status: 401 }
          );
        }

        const n = Date.now().toString(36).toUpperCase();
        const idempotencyKey = `SF-${new Date().getFullYear()}-${n}`;
        const charge = await chargeZixi({
          zixiUserId,
          amount,
          idempotencyKey,
          meta: { planKey, billingMode, userId: user.id },
        });
        if (!charge.ok) {
          return NextResponse.json(
            { error: charge.error || "ZXC 扣款失敗" },
            { status: 402 }
          );
        }

        // 扣款成功且方案已準備好 → 才開通。confirm 失敗不阻止開通，
        // 因 zixi-earth 的 reconcile 會補上 settled 狀態。
        await confirmZixiCharge(idempotencyKey, `livestream-dashboard ${planKey}`).catch(() => {});

        const periodEnd = new Date();
        if (billingMode === "yearly") periodEnd.setFullYear(periodEnd.getFullYear() + 1);
        else periodEnd.setMonth(periodEnd.getMonth() + 1);

        await upsertSubscription(user.id, {
          planKey,
          billingMode,
          status: "active",
          currentPeriodEnd: periodEnd.toISOString(),
        });
        invalidateQuota(user.id);

        await createInvoice({
          userId: user.id,
          number: idempotencyKey,
          amount,
          tax: Math.round(amount * 0.05),
          status: "paid",
          period: new Date().toISOString().slice(0, 7),
        });
      }
    } else if (body._meta === "cancel") {
      await upsertSubscription(user.id, {
        planKey: "free",
        billingMode: "monthly",
        status: "active",
        currentPeriodEnd: null,
      });
      invalidateQuota(user.id);
    } else if (body._meta === "payInvoice") {
      // Deliberately not implemented. Marking an invoice paid on request meant
      // anyone could POST their own id and receive a paid plan; only a verified
      // gateway callback (see /api/v1/payments/webhook) may settle an invoice.
      return NextResponse.json(
        {
          error: "Invoices are settled by the payment gateway, not by the client",
          hint: "configure a gateway in payment settings, then pay through the checkout link",
        },
        { status: 501 }
      );
    } else if (body._meta === "recordUsage") {
      // Removed. This let a client declare its own consumption, which is how
      // `used` stayed at 0 while the UI implied a real meter. Writes now only
      // happen inside src/lib/usage.ts, called by code that just did the work
      // (caption transcription, replay advance, overlay creation).
      return NextResponse.json(
        { error: "recordUsage is server-internal; usage is metered automatically" },
        { status: 410 }
      );
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("POST /api/v1/membership error:", e);
    return NextResponse.json({ error: "Failed to update membership" }, { status: 500 });
  }
}