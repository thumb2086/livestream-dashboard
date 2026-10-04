import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { broadcast } from "@/lib/caption-sse";
import { getSubtitleSettings } from "@/lib/subtitle-config";

async function resolveUser(req: Request): Promise<{ userId: string } | null> {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (token) {
    const src = await prisma.oBSSource.findFirst({ where: { token, sourceKey: "captions" } });
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

  const segments = await prisma.captionSegment.findMany({
    where: { userId: user.userId, createdAt: { gt: sinceDate } },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  return NextResponse.json({ segments: segments.map(s => ({
    id: s.id, text: s.text, speaker: s.speaker, seq: s.seq,
    status: s.status, createdAt: s.createdAt.toISOString(),
  })) });
}

export async function POST(req: Request) {
  const user = await resolveUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.text?.trim()) return NextResponse.json({ error: "Missing text" }, { status: 400 });

  // Get or create a session
  let session = await prisma.captionSession.findFirst({
    where: { userId: user.userId, status: "active" },
    orderBy: { createdAt: "desc" },
  });
  if (!session) {
    session = await prisma.captionSession.create({
      data: { userId: user.userId, label: "語音辨識" },
    });
  }

  // Count existing segments for seq
  const lastSeg = await prisma.captionSegment.findFirst({
    where: { sessionId: session.id },
    orderBy: { seq: "desc" },
  });

  const segment = await prisma.captionSegment.create({
    data: {
      sessionId: session.id,
      userId: user.userId,
      text: body.text.trim(),
      speaker: body.speaker || "",
      seq: (lastSeg?.seq ?? 0) + 1,
      status: body.status || "final",
    },
  });

  // Broadcast to SSE clients
  broadcast(user.userId, "segment", {
    id: segment.id,
    text: segment.text,
    speaker: segment.speaker,
    seq: segment.seq,
    status: segment.status,
    createdAt: segment.createdAt.toISOString(),
  });

  return NextResponse.json({ ok: true, id: segment.id });
}
