// membership-http.ts — 會員方案與用量的 Neon HTTP 存取
//
// 覆蓋 /api/v1/membership（8 處 Prisma，全部 `(prisma as any)`）。
//
// 涉及的表：Subscription, UsageEvent, Invoice, User, OBSSource
//
// ⚠️ 所有 Prisma 的 `(prisma as any).subscription` 等型別斷言，
//    導致掃描器一度判定「零 Prisma」。改成明確的型別後，
//    之後掃描器再抓到 `(prisma as any)` 就是沒搬完的。
import { query, queryOne } from "./db-http";

export interface SubscriptionRow {
  id: string;
  userId: string;
  planKey: string;
  billingMode: string;
  status: string;
  currentPeriodEnd: string | null;
  createdAt: string;
}

export interface UsageEventRow {
  id: string;
  userId: string;
  metric: string;
  quantity: number;
  note: string;
  createdAt: string;
}

export interface InvoiceRow {
  id: string;
  userId: string;
  number: string;
  amount: number;
  tax: number;
  status: string;
  period: string;
  issuedAt: string;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToSub(r: Record<string, unknown>): SubscriptionRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    planKey: String(r.planKey ?? 'free'),
    billingMode: String(r.billingMode ?? 'monthly'),
    status: String(r.status ?? 'active'),
    currentPeriodEnd: r.currentPeriodEnd ? String(r.currentPeriodEnd) : null,
    createdAt: String(r.createdAt ?? ''),
  };
}

function rowToUsage(r: Record<string, unknown>): UsageEventRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    metric: String(r.metric ?? ''),
    quantity: num(r.quantity),
    note: String(r.note ?? ''),
    createdAt: String(r.createdAt ?? ''),
  };
}

function rowToInvoice(r: Record<string, unknown>): InvoiceRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    number: String(r.number ?? ''),
    amount: num(r.amount),
    tax: num(r.tax),
    status: String(r.status ?? 'paid'),
    period: String(r.period ?? ''),
    issuedAt: String(r.issuedAt ?? ''),
  };
}

export async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  const r = await queryOne<Record<string, unknown>>(
    'SELECT * FROM "Subscription" WHERE "userId" = $1 LIMIT 1', [userId]);
  return r ? rowToSub(r) : null;
}

export async function listUsageEvents(userId: string, take = 200): Promise<UsageEventRow[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM "UsageEvent" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2',
    [userId, take]);
  return rows.map(rowToUsage);
}

export async function listInvoices(userId: string, take = 100): Promise<InvoiceRow[]> {
  const rows = await query<Record<string, unknown>>(
    'SELECT * FROM "Invoice" WHERE "userId" = $1 ORDER BY "issuedAt" DESC LIMIT $2',
    [userId, take]);
  return rows.map(rowToInvoice);
}

export async function countOverlays(userId: string): Promise<number> {
  const r = await queryOne<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM "OBSSource" WHERE "userId" = $1', [userId]);
  return r ? num(r.count) : 0;
}

export async function getAccount(userId: string): Promise<{ name: string; username: string; email: string; avatar: string } | null> {
  const r = await queryOne<{ name: string; username: string; email: string; avatar: string }>(
    'SELECT "name", "username", "email", "avatar" FROM "User" WHERE "id" = $1 LIMIT 1', [userId]);
  return r;
}

export async function upsertSubscription(
  userId: string,
  data: {
    planKey: string; billingMode: string; status: string; currentPeriodEnd: string | null;
  },
): Promise<void> {
  await query(
    `INSERT INTO "Subscription"
       ("id","userId","planKey","billingMode","status","currentPeriodEnd","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT ("userId") DO UPDATE SET
       "planKey" = EXCLUDED."planKey",
       "billingMode" = EXCLUDED."billingMode",
       "status" = EXCLUDED."status",
       "currentPeriodEnd" = EXCLUDED."currentPeriodEnd"`,
    [crypto.randomUUID(), userId, data.planKey, data.billingMode, data.status, data.currentPeriodEnd],
  );
}

export async function createInvoice(data: {
  userId: string; number: string; amount: number; tax: number; status: string; period: string;
}): Promise<void> {
  await query(
    `INSERT INTO "Invoice" ("id","userId","number","amount","tax","status","period","issuedAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [crypto.randomUUID(), data.userId, data.number, data.amount, data.tax, data.status, data.period],
  );
}
