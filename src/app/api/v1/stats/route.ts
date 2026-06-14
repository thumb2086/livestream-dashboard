import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const sessions = await prisma.streamSession.findMany({
      where: { userId: user.id }, orderBy: { date: "desc" },
    });
    return NextResponse.json({
      totalViews: user.totalViews, followers: user.followers,
      totalDonations: user.donationTotal, totalMessages: user.totalMessages,
      sessions,
    });
  } catch (e) {
    console.error("GET /api/v1/stats error:", e);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}

async function refresh(userId: string) {
  const user = (await prisma.user.findUnique({ where: { id: userId } }))!;
  const sessions = await prisma.streamSession.findMany({ where: { userId }, orderBy: { date: "desc" } });
  return NextResponse.json({
    totalViews: user.totalViews, followers: user.followers,
    totalDonations: user.donationTotal, totalMessages: user.totalMessages,
    sessions,
  });
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "add") {
      if (!body.title || typeof body.title !== "string" || !body.title.trim()) {
        return NextResponse.json({ error: "Missing title" }, { status: 400 });
      }
      const session = await prisma.streamSession.create({
        data: {
          userId: user.id, title: body.title.trim(),
          date: new Date().toISOString().slice(0, 10),
          views: Math.max(0, Math.floor(Number(body.views)) || 0),
          avgTime: `${Math.floor(Math.random() * 40) + 15}m`,
          msgs: Math.max(0, Math.floor(Number(body.msgs)) || 0),
          donations: Math.max(0, Math.floor(Number(body.donations)) || 0),
        },
      });
      await prisma.user.update({
        where: { id: user.id },
        data: {
          totalViews: { increment: session.views },
          totalMessages: { increment: session.msgs },
          donationTotal: { increment: session.donations },
        },
      });
      return refresh(user.id);
    }

    if (body._meta === "delete") {
      if (!body.id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
      const session = await prisma.streamSession.findUnique({ where: { id: body.id } });
      if (session && session.userId === user.id) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            totalViews: { decrement: session.views },
            totalMessages: { decrement: session.msgs },
            donationTotal: { decrement: session.donations },
          },
        });
        await prisma.streamSession.delete({ where: { id: body.id } });
      }
      return refresh(user.id);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/v1/stats error:", e);
    return NextResponse.json({ error: "Failed to process stats" }, { status: 500 });
  }
}
