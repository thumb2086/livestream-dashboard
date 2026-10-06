import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// 原本 11 處全部是 (prisma as any) —— 而那個 cast 讓我的掃描器
// 一度把這個檔案判成「零 Prisma」。這是今晚第三次同型。
//
// ⚠️ 所有權注意：這條路由是「**一次檢查涵蓋全部動作**」，
//    不是每個分支各自帶 userId。所以下面各分支的 where 只有 id 是正確的。
//    見 lib/donation-videos-http.ts 檔頭。
import {
  listVideos, userIdByUsername, createVideo, ownedVideo,
  approveVideo, rejectVideo, markPlayed, deleteVideo,
  videoSettings,
} from "@/lib/donation-videos-http";
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

    const ownerId = await userIdByUsername(username);
    if (!ownerId) return NextResponse.json({ error: "creator not found" }, { status: 404 });

    const cfg = await videoSettings(ownerId, "donation-video");
    if (cfg.enabled === false) {
      return NextResponse.json({ error: "video requests are disabled" }, { status: 403 });
    }

    const startSec = Math.max(0, Number(body.startSec) || 0);
    const maxClip = Number(cfg.maxClipSeconds) || 60;
    const endSec = Math.min(startSec + maxClip, startSec + 3600);

    const row = await createVideo(ownerId, {
      donorName, amount, videoUrl, startSec, endSec, message,
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
    const videos = await listVideos(user.id, status && STATUSES.has(status) ? status : null);
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
    // ⚠️ 這一次檢查涵蓋下面**全部**動作（approve/reject/played/delete）。
    //    所以各分支的 where 只有 id 是正確的，不代表漏了檢查。
    const owned = await ownedVideo(id, user.id);
    if (!owned) return NextResponse.json({ error: "not found" }, { status: 404 });

    if (body._meta === "approve") {
      await approveVideo(id);
    } else if (body._meta === "reject") {
      await rejectVideo(id, String(body.rejectNote || "").slice(0, 300));
    } else if (body._meta === "played") {
      await markPlayed(id);
    } else if (body._meta === "delete") {
      await deleteVideo(id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const videos = await listVideos(user.id);
    return NextResponse.json({ videos });
  } catch (e) {
    console.error("PUT /api/v1/donation-videos error:", e);
    return NextResponse.json({ error: "Failed to update video request" }, { status: 500 });
  }
}