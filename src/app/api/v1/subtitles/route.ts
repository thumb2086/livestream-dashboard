import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import { ensureSubtitleConfig, upsertSubtitleConfig } from "@/lib/subtitle-config";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const ALLOWED = new Set(["enabled", "font", "fontSize", "textColor", "bgColor", "position"]);

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    // Create the row on first load so the settings below are a real record and
    // the caption feed can see an explicit enabled flag rather than guessing.
    const settings = await ensureSubtitleConfig(user.id);
    return NextResponse.json(settings);
  } catch (e) {
    console.error("GET /api/v1/subtitles error:", e);
    return NextResponse.json({ error: "Failed to fetch subtitle settings" }, { status: 500 });
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
    const updated = await upsertSubtitleConfig(user.id, filtered);
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PUT /api/v1/subtitles error:", e);
    return NextResponse.json({ error: "Failed to update subtitle settings" }, { status: 500 });
  }
}
