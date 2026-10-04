import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

type Ctx = { params: Promise<Record<string, string>> };

const STATUSES = new Set(["pending_review", "approved", "rejected", "played"]);

/** Public submit: anyone can post a video request to a creator's queue. */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
    const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl.trim() : "";
    const donorName = typeof body.donorName === "string" ? body.donorName.trim().slice(0, 60) : "";
    const message = typeof body.message === "string" ? body.message.trim().slice(0, 300) : "";
    const amount = Number(body.amount) || 0;

    if (!username || !videoUrl) {
      return NextResponse.json({ error: "username and videoUrl are required" }, { status: 400 });
    }
    // Only accept http(s) URLs — blocks javascript:/data: injection into the <video src>.
    if (!/^https?:\/\/.+/i.test(videoUrl)) {
      return NextResponse.json({ error: "videoUrl must be an http(s) URL" }, { status: 400 });
    }
    if (!donorName) {
      return NextResponse.json({ error: "donorName is required" }, { status: 400 });
    }

    const owner = await (prisma as any).user.findUnique({ where: { username } });
    if (!owner) return NextResponse.json({ error: "creator not found" }, { status: 404 });

    const cfg =
      (await (prisma as any).featureSettings.findUnique({
        where: { userId_featureKey: { userId: owner.id, featureKey: "donation-video" } },
      }))?.settings ?? {};
    if (cfg.enabled === false) {
      return NextResponse.json({ error: "video requests are disabled" }, { status: 403 });
    }

    const startSec = Math.max(0, Number(body.startSec) || 0);
    const maxClip = Number(cfg.maxClipSeconds) || 60;
    const endSec = Math.min(startSec + maxClip, startSec + 3600);

    const row = await (prisma as any).donationVideo.create({
      data: {
        userId: owner.id,
        donorName,
        amount,
        videoUrl,
        startSec,
        endSec,
        message,
        status: "pending_review",
      },
    });
    return NextResponse.json({ ok: true, id: row.id }, { status: 201 });
  } catch (e) {
    console.error("POST /api/v1/donation-videos error:", e);
    return NextResponse.json({ error: "Failed to submit video request" }, { status: 500 });
  }
}

/** Creator-side listing + moderation actions. */
export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const status = new URL(req.url).searchParams.get("status");
    const where: any = { userId: user.id };
    if (status && STATUSES.has(status)) where.status = status;
    const videos = await (prisma as any).donationVideo.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ videos });
  } catch (e) {
    console.error("GET /api/v1/donation-videos error:", e);
    return NextResponse.json({ error: "Failed to fetch video requests" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // owner-scoped so one creator can never moderate another's queue
    const owned = await (prisma as any).donationVideo.findFirst({ where: { id, userId: user.id } });
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (body._meta === "approve") {
      await (prisma as any).donationVideo.update({
        where: { id },
        data: { status: "approved", reviewedAt: new Date(), rejectNote: "" },
      });
    } else if (body._meta === "reject") {
      await (prisma as any).donationVideo.update({
        where: { id },
        data: {
          status: "rejected",
          reviewedAt: new Date(),
          rejectNote: String(body.rejectNote || "").slice(0, 300),
        },
      });
    } else if (body._meta === "played") {
      await (prisma as any).donationVideo.update({ where: { id }, data: { status: "played" } });
    } else if (body._meta === "delete") {
      await (prisma as any).donationVideo.delete({ where: { id } });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const videos = await (prisma as any).donationVideo.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ videos });
  } catch (e) {
    console.error("PUT /api/v1/donation-videos error:", e);
    return NextResponse.json({ error: "Failed to update video request" }, { status: 500 });
  }
}