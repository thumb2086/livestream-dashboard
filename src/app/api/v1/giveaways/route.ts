import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const giveaways = await prisma.giveaway.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { entrants: { orderBy: { createdAt: "asc" }, take: 200 } },
    });
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
      await prisma.giveaway.create({ data: { userId: user.id, title, keyword } });
    } else if (body._meta === "toggle") {
      if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await prisma.giveaway.updateMany({ where: { id: body.id, userId: user.id }, data: { enabled: body.enabled } });
    } else if (body._meta === "delete") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      await prisma.giveaway.deleteMany({ where: { id: body.id, userId: user.id } });
    } else if (body._meta === "join") {
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 40) : "";
      if (typeof body.id !== "string" || !name) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const g = await prisma.giveaway.findFirst({ where: { id: body.id, userId: user.id } });
      if (!g || !g.enabled) return NextResponse.json({ error: "Giveaway not open" }, { status: 400 });
      await prisma.giveawayEntrant.upsert({
        where: { giveawayId_name: { giveawayId: body.id, name } },
        update: {},
        create: { giveawayId: body.id, name },
      });
    } else if (body._meta === "draw") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const entrants = await prisma.giveawayEntrant.findMany({ where: { giveawayId: body.id } });
      const owned = await prisma.giveaway.findFirst({ where: { id: body.id, userId: user.id } });
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (entrants.length === 0) return NextResponse.json({ error: "No entrants" }, { status: 400 });
      const winner = entrants[Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296 * entrants.length)].name;
      await prisma.giveaway.updateMany({ where: { id: body.id, userId: user.id }, data: { winner } });
    } else if (body._meta === "clear") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      const owned = await prisma.giveaway.findFirst({ where: { id: body.id, userId: user.id } });
      if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });
      await prisma.giveawayEntrant.deleteMany({ where: { giveawayId: body.id } });
      await prisma.giveaway.updateMany({ where: { id: body.id, userId: user.id }, data: { winner: "" } });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const giveaways = await prisma.giveaway.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      include: { entrants: { orderBy: { createdAt: "asc" }, take: 200 } },
    });
    return NextResponse.json({ giveaways });
  } catch (e) {
    console.error("POST /api/v1/giveaways error:", e);
    return NextResponse.json({ error: "Failed to update giveaway" }, { status: 500 });
  }
}
