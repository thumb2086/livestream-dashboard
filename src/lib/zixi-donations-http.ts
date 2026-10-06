// zixi-donations-http.ts — ZIXI 斗內的 Neon HTTP 存取
//
// 覆蓋 /api/v1/zixi-donations（4 處 Prisma）。
import { query, queryOne } from "./db-http";

export interface ZixiDonationRow {
  id: string;
  userId: string;
  donorAddress: string;
  donorName: string;
  amount: number;
  token: string;
  txHash: string | null;
  message: string;
  status: string;
  createdAt: string;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function rowToDonation(r: Record<string, unknown>): ZixiDonationRow {
  return {
    id: String(r.id),
    userId: String(r.userId),
    donorAddress: String(r.donorAddress ?? ''),
    donorName: String(r.donorName ?? ''),
    amount: num(r.amount),
    token: String(r.token ?? 'ZXC'),
    txHash: r.txHash ? String(r.txHash) : null,
    message: String(r.message ?? ''),
    status: String(r.status ?? 'pending'),
    createdAt: String(r.createdAt ?? ''),
  };
}

const D_COLS = `"id", "userId", "donorAddress", "donorName", "amount", "token", "txHash", "message", "status", "createdAt"`;

export async function findUserByUsername(username: string): Promise<{ id: string; zixiWallet: string | null; username?: string } | null> {
  const r = await queryOne<{ id: string; zixiWallet: string | null; username: string }>(
    'SELECT "id", "zixiWallet", "username" FROM "User" WHERE "username" = $1 LIMIT 1',
    [username],
  );
  return r;
}

export async function createZixiDonation(data: {
  userId: string; donorAddress: string; donorName: string; amount: number;
  token: string; message: string; status: string; txHash?: string | null;
}): Promise<{ id: string } | null> {
  const rows = await query<{ id: string }>(
    `INSERT INTO "ZixiDonation" ("id","userId","donorAddress","donorName","amount","token","message","status","txHash","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW()) RETURNING "id"`,
    [crypto.randomUUID(), data.userId, data.donorAddress, data.donorName, data.amount, data.token, data.message, data.status, data.txHash ?? null],
  );
  return rows[0] ?? null;
}

export async function findOBSSource(token: string, sourceKey: string): Promise<{ userId: string } | null> {
  const r = await queryOne<{ userId: string }>(
    'SELECT "userId" FROM "OBSSource" WHERE "token" = $1 AND "sourceKey" = $2 LIMIT 1',
    [token, sourceKey],
  );
  return r;
}

export async function getLastZixiDonationWithHash(userId: string): Promise<ZixiDonationRow | null> {
  const r = await queryOne<Record<string, unknown>>(
    `SELECT ${D_COLS} FROM "ZixiDonation" WHERE "userId" = $1 AND "txHash" IS NOT NULL ORDER BY "createdAt" DESC LIMIT 1`,
    [userId],
  );
  return r ? rowToDonation(r) : null;
}

export async function listZixiDonations(userId: string, opts: {
  status?: string | null;
  since?: string | null;
  after?: string | null;
  take?: number;
}): Promise<ZixiDonationRow[]> {
  const conditions: string[] = ['"userId" = $1'];
  const params: unknown[] = [userId];
  if (opts.status) {
    params.push(opts.status);
    conditions.push(`"status" = $${params.length}`);
  }
  if (opts.since) {
    params.push(opts.since);
    conditions.push(`"id" > $${params.length}`);
  }
  if (opts.after) {
    params.push(opts.after);
    conditions.push(`"createdAt" > $${params.length}`);
  }
  const take = opts.take ?? 50;
  params.push(take);
  const rows = await query<Record<string, unknown>>(
    `SELECT ${D_COLS} FROM "ZixiDonation" WHERE ${conditions.join(' AND ')} ORDER BY "createdAt" DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(rowToDonation);
}
