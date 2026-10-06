// donation-records-http.ts — 斗內記錄的 Neon HTTP 存取
//
// 覆蓋 /api/v1/donation-records（2 處 Prisma）。
import { query } from "./db-http";

export interface DonationRecordRow {
  id: string;
  userId: string;
  source: string;
  donorName: string;
  amount: number;
  currency: string;
  message: string;
  status: string;
  tradeNo: string;
  createdAt: string;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export async function listDonationRecords(userId: string, sinceDate: Date | null, limit: number): Promise<DonationRecordRow[]> {
  const rows = await query<Record<string, unknown>>(
    sinceDate
      ? 'SELECT * FROM "DonationRecord" WHERE "userId" = $1 AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT $3'
      : 'SELECT * FROM "DonationRecord" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2',
    sinceDate ? [userId, sinceDate.toISOString(), limit] : [userId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id), userId: String(r.userId), source: String(r.source ?? ''),
    donorName: String(r.donorName ?? ''), amount: num(r.amount),
    currency: String(r.currency ?? ''), message: String(r.message ?? ''),
    status: String(r.status ?? ''), tradeNo: String(r.tradeNo ?? ''),
    createdAt: String(r.createdAt ?? ''),
  }));
}

export async function listZixiDonationsForRecords(userId: string, sinceDate: Date | null, limit: number): Promise<Array<{
  id: string; donorName: string; donorAddress: string; amount: number; token: string;
  message: string; status: string; txHash: string | null; createdAt: string;
}>> {
  const rows = await query<Record<string, unknown>>(
    sinceDate
      ? 'SELECT "id", "donorName", "donorAddress", "amount", "token", "message", "status", "txHash", "createdAt" FROM "ZixiDonation" WHERE "userId" = $1 AND "createdAt" >= $2 ORDER BY "createdAt" DESC LIMIT $3'
      : 'SELECT "id", "donorName", "donorAddress", "amount", "token", "message", "status", "txHash", "createdAt" FROM "ZixiDonation" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2',
    sinceDate ? [userId, sinceDate.toISOString(), limit] : [userId, limit],
  );
  return rows.map((r) => ({
    id: String(r.id), donorName: String(r.donorName ?? ''),
    donorAddress: String(r.donorAddress ?? ''), amount: num(r.amount),
    token: String(r.token ?? ''), message: String(r.message ?? ''),
    status: String(r.status ?? ''), txHash: r.txHash ? String(r.txHash) : null,
    createdAt: String(r.createdAt ?? ''),
  }));
}
