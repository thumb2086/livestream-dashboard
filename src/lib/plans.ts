/** Plan catalogue shared by the membership API and the dashboard pages. */

export type Plan = {
  key: string;
  name: string;
  monthly: number;
  yearly: number;
  retention: string;
  features: string[];
};

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
    monthly: 199,
    yearly: 1990,
    retention: "90 天",
    features: ["10 個疊加層", "90 天事件紀錄", "斗內影片", "Email 支援"],
  },
  {
    key: "creator",
    name: "Creator",
    monthly: 390,
    yearly: 3900,
    retention: "1 年",
    features: ["無限疊加層", "1 年事件紀錄", "回放分析", "優先支援"],
  },
  {
    key: "studio",
    name: "Studio",
    monthly: 990,
    yearly: 9900,
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