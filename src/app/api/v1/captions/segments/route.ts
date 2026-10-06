import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import {
  findCaptionSource, listSegmentsSince, findActiveSession,
  createCaptionSession, getLastSegment, createSegment,
} from "@/lib/caption-segments-http";
import { broadcast } from "@/lib/caption-sse";
import { getSubtitleSettings } from "@/lib/subtitle-config";

async function resolveUser(req: Request): Promise<{ userId: string } | null> {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (token) {
    const src = await findCaptionSource(token);
    if (src) return { userId: src.userId };
  }
  const { getOrCreateUser, getSessionId } = await import("@/lib/getUser");
  const u = await getOrCreateUser(getSessionId(req));
  return u ? { userId: u.id } : null;
}

export async function GET(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const config = await getSubtitleSettings(user.userId);
  if (!config.enabled) return NextResponse.json({ segments: [] });

  const { searchParams } = new URL(req.url);
  const since = searchParams.get("since");
  const sinceDate = since ? new Date(since) : new Date(Date.now() - 30000);

  const segments = await listSegmentsSince(user.userId, sinceDate, 30);

  return NextResponse.json({ segments: segments.map(s => ({
    id: s.id, text: s.text, speaker: s.speaker, seq: s.seq,
    status: s.status, createdAt: s.createdAt,
  })) });
}

export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.text?.trim()) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  // Get or create a session
  let session = await findActiveSession(user.userId);
  if (!session) {
    session = await createCaptionSession(user.userId, "語音辨識");
  }

  // Count existing segments for seq
  const lastSeg = await getLastSegment(session.id);

  const segment = await createSegment(session.id, user.userId, {
    text: body.text.trim(),
    speaker: body.speaker || "",
    seq: (lastSeg?.seq ?? 0) + 1,
    status: body.status || "final",
  });

  // Broadcast to SSE clients
  broadcast(user.userId, "segment", {
    id: segment.id,
    text: segment.text,
    speaker: segment.speaker,
    seq: segment.seq,
    status: segment.status,
    createdAt: segment.createdAt,
  });

  return NextResponse.json({ ok: true, id: segment.id });
}
