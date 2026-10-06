// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// Prisma 7 的 query compiler 是 WASM，而 Workers 拒絕動態 WASM codegen。
//
// ⚠️ listGiveaways 順帶修掉一個 N+1：
//    原碼是 include: { entrants } —— Prisma 會對**每個**抽獎各查一次，
//    而 N 是使用者的抽獎數（會長大）。
//    現在是「一次撈全部參與者 + JS 分組」：2 次查詢，與抽獎數無關。
import { NextResponse } from "next/server";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import {
  listGiveaways, createGiveaway, setGiveawayEnabled, deleteGiveaway,
  getGiveaway, joinGiveaway, listEntrants, setWinner, clearEntrants,
} from "@/lib/giveaways-http";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const giveaways = await listGiveaways(user.id);
    return NextResponse.json({ giveaways });
  } catch (e) {
    console.error("GET /api/v1/giveaways error:", e);
    return NextResponse.json({ error: "Failed to fetch giveaways" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "add") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 80) : "";
      const keyword = typeof body.keyword === "string" ? body.keyword.trim().toLowerCase().slice(0, 30) : "";
      if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
      await createGiveaway(user.id, title, keyword);
    } else if (body._meta === "toggle") {
      if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await setGiveawayEnabled(body.id, user.id, body.enabled);
    } else if (body._meta === "delete") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      await deleteGiveaway(body.id, user.id);
    } else if (body._meta === "join") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
      if (typeof body.id !== "string" || !name) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const g = await getGiveaway(body.id, user.id);
      // ⚠️ 這裡檢查 enabled —— 停用的抽獎不能加入。
      //    而 `draw` 與 `clear` **不**檢查 enabled（那是刻意的：
      //    你要能抽獎/清空一個已停用的抽獎）。
      if (!g || !g.enabled) return NextResponse.json({ error: "Giveaway not open" }, { status: 400 });
      await joinGiveaway(body.id, name);
    } else if (body._meta === "draw") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      // ⚠️ 順序刻意調了：先檢查 owned，再讀 entrants。
      //    原碼相反（先讀 entrants 再檢查 owned）——
      //    那不會外洩（entrants 不回傳），但會對**不屬於自己的**
      //    giveawayId 做讀取。把 owned 放前面，語意不變而意圖清楚。
      const owned = await getGiveaway(body.id, user.id);
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
      const entrants = await listEntrants(body.id);
      if (entrants.length === 0) return NextResponse.json({ error: "No entrants" }, { status: 400 });
      // 抽獎隨機數必須在伺服器端產生 —— 前端抽的話就能重複抽。
      // 這與原碼相同（crypto.getRandomValues + 整數除法）。
      const r = crypto.getRandomValues(new Uint32Array(1))[0];
      const winner = entrants[Math.floor(r / 4294967296 * entrants.length)].name;
      await setWinner(body.id, user.id, winner);
    } else if (body._meta === "clear") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const owned = await getGiveaway(body.id, user.id);
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await clearEntrants(body.id);
      await setWinner(body.id, user.id, "");
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const giveaways = await listGiveaways(user.id);
    return NextResponse.json({ giveaways });
  } catch (e) {
    console.error("POST /api/v1/giveaways error:", e);
    return NextResponse.json({ error: "Failed to update giveaway" }, { status: 500 });
  }
}