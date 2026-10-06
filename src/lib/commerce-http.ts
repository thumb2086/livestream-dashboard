// commerce-http.ts — 商城/商品的 Neon HTTP 存取
//
// 覆蓋 /api/v1/commerce（7 處 Prisma，全部 `(prisma as any)`）。
import { query, queryOne } from "./db-http";

export interface ProductRow {
  id: string;
  userId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stock: number;
  imageUrl: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface OrderRow {
  id: string;
  userId: string;
  productId: string | null;
  buyerName: string;
  quantity: number;
  amount: number;
  status: string;
  createdAt: string;
}

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const PRODUCT_COLS = `"id", "userId", "name", "description", "price", "currency", "stock", "imageUrl", "active", "sortOrder", "createdAt"`;
const ORDER_COLS = `"id", "userId", "productId", "buyerName", "quantity", "amount", "status", "createdAt"`;

function rowToProduct(r: Record<string, unknown>): ProductRow {
  return {
    id: String(r.id), userId: String(r.userId), name: String(r.name ?? ''),
    description: String(r.description ?? ''), price: num(r.price),
    currency: String(r.currency ?? 'TWD'), stock: num(r.stock),
    imageUrl: String(r.imageUrl ?? ''), active: Boolean(r.active),
    sortOrder: num(r.sortOrder), createdAt: String(r.createdAt ?? ''),
  };
}

function rowToOrder(r: Record<string, unknown>): OrderRow {
  return {
    id: String(r.id), userId: String(r.userId),
    productId: r.productId ? String(r.productId) : null,
    buyerName: String(r.buyerName ?? ''), quantity: num(r.quantity),
    amount: num(r.amount), status: String(r.status ?? 'pending'),
    createdAt: String(r.createdAt ?? ''),
  };
}

export async function listProducts(userId: string): Promise<ProductRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${PRODUCT_COLS} FROM "Product" WHERE "userId" = $1 ORDER BY "sortOrder" ASC, "createdAt" DESC`,
    [userId],
  );
  return rows.map(rowToProduct);
}

export async function listOrders(userId: string, take = 200): Promise<OrderRow[]> {
  const rows = await query<Record<string, unknown>>(
    `SELECT ${ORDER_COLS} FROM "Order" WHERE "userId" = $1 ORDER BY "createdAt" DESC LIMIT $2`,
    [userId, take],
  );
  return rows.map(rowToOrder);
}

export async function createProduct(userId: string, data: {
  name: string; description: string; price: number; currency: string;
  stock: number; imageUrl: string; active: boolean; sortOrder: number;
}): Promise<void> {
  await query(
    `INSERT INTO "Product" ("id","userId","name","description","price","currency","stock","imageUrl","active","sortOrder","createdAt")
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
    [crypto.randomUUID(), userId, data.name, data.description, data.price,
     data.currency, data.stock, data.imageUrl, data.active, data.sortOrder],
  );
}

export async function updateProduct(id: string, userId: string, data: {
  name: string; description: string; price: number; currency: string;
  stock: number; imageUrl: string; active: boolean; sortOrder: number;
}): Promise<boolean> {
  const r = await query<{ id: string }>(
    `UPDATE "Product" SET "name"=$3, "description"=$4, "price"=$5, "currency"=$6, "stock"=$7, "imageUrl"=$8, "active"=$9, "sortOrder"=$10
     WHERE "id" = $1 AND "userId" = $2 RETURNING "id"`,
    [id, userId, data.name, data.description, data.price, data.currency,
     data.stock, data.imageUrl, data.active, data.sortOrder],
  );
  return r.length > 0;
}

export async function deleteProduct(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "Product" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}

export async function setOrderStatus(id: string, userId: string, status: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'UPDATE "Order" SET "status" = $3 WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId, status],
  );
  return r.length > 0;
}

export async function deleteOrder(id: string, userId: string): Promise<boolean> {
  const r = await query<{ id: string }>(
    'DELETE FROM "Order" WHERE "id" = $1 AND "userId" = $2 RETURNING "id"',
    [id, userId],
  );
  return r.length > 0;
}
