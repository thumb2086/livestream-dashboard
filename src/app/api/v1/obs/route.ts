import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    let sources = await prisma.oBSSource.findMany({ where: { userId: user.id } });
    // Auto-create missing default sources for existing users
    const defaultSources = [
      { sourceKey: "chat", name: "聊天室疊加層" },
      { sourceKey: "donations", name: "斗內進度條" },
      { sourceKey: "subtitles", name: "字幕疊加層" },
      { sourceKey: "alerts", name: "斗內通知" },
      { sourceKey: "stats", name: "頻道統計疊加層" },
    ];
    const existingKeys = new Set(sources.map(s => s.sourceKey));
    const missing = defaultSources.filter(d => !existingKeys.has(d.sourceKey));
    for (const d of missing) {
      const token = Math.random().toString(36).substring(2,10) + Date.now().toString(36);
      const alwaysEnabled = ["chat", "subtitles", "alerts"];
      await prisma.oBSSource.create({ data: { userId: user.id, sourceKey: d.sourceKey, name: d.name, token, enabled: alwaysEnabled.includes(d.sourceKey) } });
    }
    if (missing.length > 0) sources = await prisma.oBSSource.findMany({ where: { userId: user.id } });
    return NextResponse.json({ sources });
  } catch (e) {
    console.error("GET /api/v1/obs error:", e);
    return NextResponse.json({ error: "Failed to fetch OBS sources" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "toggle") {
      if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await prisma.oBSSource.updateMany({
        where: { id: body.id, userId: user.id },
        data: { enabled: body.enabled },
      });
    } else if (body._meta === "regenerate") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      const token = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 6);
      await prisma.oBSSource.updateMany({
        where: { id: body.id, userId: user.id },
        data: { token },
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const sources = await prisma.oBSSource.findMany({ where: { userId: user.id } });
    return NextResponse.json({ sources });
  } catch (e) {
    console.error("POST /api/v1/obs error:", e);
    return NextResponse.json({ error: "Failed to update OBS sources" }, { status: 500 });
  }
}
