/** Plan catalogue shared by the membership API and the dashboard pages. */

/**
 * Plans are priced in ZXC (子熙幣), not fiat.
 *
 * The tier *shape* is unchanged from the old NT$ pricing -- 1 : 2 : 5 was
 * 199 : 390 : 990 -- only the currency and the numbers moved. The scale is
 * anchored on the Zixi ecosystem's own numbers rather than on any fiat rate,
 * because no ZXC <-> TWD rate exists anywhere in this repo or in zixi-earth:
 *   - new accounts are granted 15,000 ZXC (zixi-earth/src/auth.js)
 *   - chest prizes run 1 -> 50,000 ZXC
 * so 1,000 is ~1/15 of a signup grant and 5,000 is ~1/3 of one. Generous
 * enough to be approachable, small enough that the free grant does not make
 * every paid tier pointless.
 *
 * Note the consequence: revenue is now denominated in a token, so a fall in ZXC
 * cuts revenue proportionally. Yearly stays at 10x monthly (two months free),
 * same as before -- the discount was not widened.
 */
export const PLAN_CURRENCY = "ZXC";

export type Plan = {
  key: string;
  name: string;
  monthly: number;
  yearly: number;
  retention: string;
  features: string[];
};

/**
 * Single formatter for every plan price.
 *
 * The NT$ literal used to be pasted into three different pages, so changing the
 * currency meant finding every one of them. Keep prices going through this.
 */
export function formatPrice(amount: number): string {
  if (amount === 0) return "免費";
  return `${amount.toLocaleString()} ${PLAN_CURRENCY}`;
}

export const PLANS: Plan[] = [
  {
    key: "free",
    name: "Free",
    monthly: 0,
    yearly: 0,
    retention: "7 天",
    features: ["3 個疊加層", "7 天事件紀錄", "社群支援"],
  },
  {
    key: "pro",
    name: "Pro",
    monthly: 1000,
    yearly: 10000,
    retention: "90 天",
    features: ["10 個疊加層", "90 天事件紀錄", "斗內影片", "Email 支援"],
  },
  {
    key: "creator",
    name: "Creator",
    monthly: 2000,
    yearly: 20000,
    retention: "1 年",
    features: ["無限疊加層", "1 年事件紀錄", "回放分析", "優先支援"],
  },
  {
    key: "studio",
    name: "Studio",
    monthly: 5000,
    yearly: 50000,
    retention: "3 年",
    features: ["無限疊加層", "3 年事件紀錄", "多頻道", "專人支援"],
  },
];

export type Quota = { metric: string; label: string; limit: number; unit: string };

export const QUOTAS: Record<string, Quota[]> = {
  free: [
    { metric: "overlay", label: "疊加層數量", limit: 3, unit: "個" },
    { metric: "caption_minutes", label: "字幕分鐘數", limit: 120, unit: "分鐘" },
    { metric: "ai_credits", label: "AI 點數", limit: 50, unit: "點" },
  ],
  pro: [
    { metric: "overlay", label: "疊加層數量", limit: 10, unit: "個" },
    { metric: "caption_minutes", label: "字幕分鐘數", limit: 1500, unit: "分鐘" },
    { metric: "ai_credits", label: "AI 點數", limit: 500, unit: "點" },
  ],
  creator: [
    { metric: "overlay", label: "疊加層數量", limit: 50, unit: "個" },
    { metric: "caption_minutes", label: "字幕分鐘數", limit: 6000, unit: "分鐘" },
    { metric: "ai_credits", label: "AI 點數", limit: 3000, unit: "點" },
  ],
  studio: [
    { metric: "overlay", label: "疊加層數量", limit: 999, unit: "個" },
    { metric: "caption_minutes", label: "字幕分鐘數", limit: 30000, unit: "分鐘" },
    { metric: "ai_credits", label: "AI 點數", limit: 30000, unit: "點" },
  ],
};

export const planByKey = (key: string) => PLANS.find((p) => p.key === key) ?? PLANS[0];

/**
 * The plan whose limits may actually be applied.
 *
 * A stored planKey is a *request*, not a grant. Until a payment is settled the
 * subscription is `pending`, and an unpaid creator must stay on free limits --
 * otherwise "choose the Studio plan" is itself a free upgrade, which is how the
 * entitlement leak happened in the first place.
 *
 * Lives here rather than in the route handler because both the API and
 * src/lib/usage.ts need it, and a lib must not import a route.
 */
export function effectivePlan(subscription: { planKey?: string; status?: string } | null | undefined): string {
  const key = subscription?.planKey ?? "free";
  if (key === "free") return "free";
  const status = subscription?.status;
  const paid = status === "active" || status === "trialing";
  return paid && QUOTAS[key] ? key : "free";
}