import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const ALLOWED = new Set(["enabled", "theme", "maxMessages", "fontSize"]);

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const settings = await prisma.chatSettings.findUnique({ where: { userId: user.id } });
    return NextResponse.json(settings);
  } catch (e) {
    console.error("GET /api/v1/chat error:", e);
    return NextResponse.json({ error: "Failed to fetch chat settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED.has(key)) filtered[key] = body[key];
    }
    const updated = await prisma.chatSettings.upsert({
      where: { userId: user.id },
      update: filtered,
      create: { userId: user.id, ...filtered },
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PUT /api/v1/chat error:", e);
    return NextResponse.json({ error: "Failed to update chat settings" }, { status: 500 });
  }
}
