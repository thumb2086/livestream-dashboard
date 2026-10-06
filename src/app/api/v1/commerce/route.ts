import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// 原本 7 處全是 `(prisma as any)`。
import {
  listProducts, listOrders, createProduct, updateProduct,
  deleteProduct, setOrderStatus, deleteOrder,
} from "@/lib/commerce-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

async function load(userId: string) {
  const [products, orders] = await Promise.all([
    listProducts(userId),
    listOrders(userId, 200),
  ]);
  return { products, orders };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("GET /api/v1/commerce error:", e);
    return NextResponse.json({ error: "Failed to fetch store" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "addProduct" || body._meta === "updateProduct") {
      const name = str(body.name, 80);
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      const price = Math.max(0, Math.min(10_000_000, Number(body.price) || 0));
      const data = {
        name,
        description: str(body.description, 300),
        price,
        currency: str(body.currency, 8) || "TWD",
        stock: Number(body.stock),
        imageUrl: str(body.imageUrl, 500),
        active: body.active !== false,
        sortOrder: Number(body.sortOrder) || 0,
      };
      if (body._meta === "addProduct") {
        await createProduct(user.id, data);
      } else {
        await updateProduct(str(body.id, 40), user.id, data);
      }
    } else if (body._meta === "deleteProduct") {
      await deleteProduct(str(body.id, 40), user.id);
    } else if (body._meta === "setOrderStatus") {
      const status = str(body.status, 20);
      if (!["pending", "paid", "shipped", "cancelled"].includes(status)) {
        return NextResponse.json({ error: "invalid status" }, { status: 400 });
      }
      await setOrderStatus(str(body.id, 40), user.id, status);
    } else if (body._meta === "deleteOrder") {
      await deleteOrder(str(body.id, 40), user.id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("POST /api/v1/commerce error:", e);
    return NextResponse.json({ error: "Failed to update store" }, { status: 500 });
  }
}