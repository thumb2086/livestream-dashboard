import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { overlayByKey } from "@/lib/overlays";
import { getLiveViewers } from "@/lib/platform-live";
import { fetchSheetParticipants } from "@/lib/google-sheets";

/**
 * JSON feed polled by the on-screen overlays.
 * Authenticated by the overlay token (query param), not the user session —
 * OBS cannot send cookies.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const def = overlayByKey(key);
    if (!def) return NextResponse.json({ error: "Unknown overlay" }, { status: 404 });

    const token = new URL(req.url).searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 401 });

    const source = await (prisma as any).oBSSource.findFirst({
      where: { token, sourceKey: key },
      include: { user: true },
    });
    if (!source || !source.enabled) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const user = source.user;
    const row = await (prisma as any).featureSettings.findUnique({
      where: { userId_featureKey: { userId: user.id, featureKey: key } },
    });
    const settings = (row?.settings ?? {}) as Record<string, unknown>;

    const payload = await buildPayload(key, settings, user);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    console.error("GET /api/v1/overlay-data/[key] error:", e);
    return NextResponse.json({ error: "Failed to build overlay payload" }, { status: 500 });
  }
}

type Payload = Record<string, unknown>;

async function buildPayload(
  key: string,
  s: Record<string, any>,
  user: any
): Promise<Payload> {
  switch (key) {
    case "live-viewers": {
      // The real concurrent audience from the connected platforms. Returns null
      // when nothing could report one, which the overlay renders differently
      // from a verified zero.
      const viewers = await getLiveViewers(user.id);
      return {
        enabled: s.enabled !== false,
        title: s.title ?? "同時觀看人數",
        label: s.labelText ?? "人氣",
        accent: s.accent ?? "#059669",
        viewers,
        known: viewers !== null,
        knownLabel: s.knownLabel ?? "--",
        position: s.position ?? "右上",
        size: s.size ?? "中",
        bgColor: s.bgColor ?? "rgba(13,17,26,0.82)",
        textColor: s.textColor ?? "#ffffff",
        thousands: s.thousands !== false,
      };
    }

    case "scoreboard": {
      // A creator can drive the scoreboard from a published Google Sheet; the
      // manual participant list stays as the fallback.
      let sourceParts: any[] = Array.isArray(s.participants) ? s.participants : [];
      let sheetError: string | null = null;
      let sheetUpdatedAt: string | null = null;

      if (s.sourceType === "google-sheets" && s.sheet?.spreadsheetUrl) {
        const result = await fetchSheetParticipants({
          spreadsheetUrl: String(s.sheet.spreadsheetUrl ?? ""),
          sheetName: String(s.sheet.sheetName ?? ""),
          namesRange: String(s.sheet.namesRange ?? ""),
          scoresRange: String(s.sheet.scoresRange ?? ""),
        });
        if ("error" in result) {
          // Keep showing the last known list rather than blanking the overlay.
          sheetError = result.error;
        } else {
          sourceParts = result.participants;
          sheetUpdatedAt = new Date().toISOString();
        }
      }

      const ranks: any[] = Array.isArray(s.ranks) ? s.ranks : [];
      const sorted = [...sourceParts]
        .map((p) => ({ id: String(p.id ?? ""), name: String(p.name ?? ""), score: Number(p.score) || 0 }))
        .sort((a, b) => b.score - a.score);
      return {
        enabled: s.enabled !== false,
        placement: s.placement ?? "top",
        fontFamily: s.fontFamily ?? "noto",
        sourceType: s.sourceType ?? "manual",
        sheetError,
        sheetUpdatedAt,
        participants: sorted.slice(0, 12).map((p, i) => ({
          ...p,
          rank: i + 1,
          tier: ranks[i]?.tier ?? "iron",
          accent: ranks[i]?.accent ?? "#64748b",
          text: ranks[i]?.text ?? "#ffffff",
          border: ranks[i]?.border ?? "#64748b",
          opacity: ranks[i]?.opacity ?? 82,
        })),
      };
    }

    case "follower-alert": {
      const events = await (prisma as any).eventLog
        ?.findMany?.({ where: { userId: user.id, kind: "follow" }, orderBy: { createdAt: "desc" }, take: 5 })
        .catch(() => null);
      return {
        enabled: s.enabled !== false,
        position: s.position ?? "右上",
        layout: s.layout ?? "卡片",
        duration: Number(s.duration) || 6,
        accent: s.accent ?? "#059669",
        textColor: s.textColor ?? "#ffffff",
        followText: s.followText ?? "加入了追隨行列",
        subText: s.subText ?? "訂閱了頻道 {tier} {months} 個月",
        sound: s.sound ?? "提示音",
        volume: Number(s.volume) || 60,
        showAvatar: s.showAvatar !== false,
        showMessage: s.showMessage !== false,
        events: events ?? [],
      };
    }

    case "donation-ticker": {
      const zixi = await (prisma as any).zixiDonation.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: Math.max(1, Number(s.maxItems) || 5),
      });
      return {
        enabled: s.enabled !== false,
        position: s.position ?? "底部",
        speed: s.speed ?? "中",
        direction: s.direction ?? "由右至左",
        fontSize: s.fontSize ?? "中",
        showAmount: s.showAmount !== false,
        showMessage: s.showMessage !== false,
        showAvatar: s.showAvatar !== false,
        background: s.background ?? "rgba(13,17,26,0.85)",
        textColor: s.textColor ?? "#ffffff",
        accent: s.accent ?? "#059669",
        separator: s.separator ?? "💛",
        items: zixi.map((d: any) => ({
          name: d.donorName || String(d.donorAddress ?? "").slice(0, 6) || "匿名",
          amount: d.amount,
          currency: d.token || "ZXC",
          message: d.message ?? "",
        })),
      };
    }

    case "donation-cards": {
      const cards: any[] = Array.isArray(s.cards) ? s.cards : [];
      return {
        enabled: s.enabled !== false,
        layout: s.layout ?? "3x2",
        showOnOverlay: s.showOnOverlay !== false,
        revealSeconds: Number(s.revealSeconds) || 8,
        cards: cards.filter((c) => c.enabled !== false),
      };
    }

    case "donation-video": {
      const videos = await (prisma as any).donationVideo.findMany({
        where: { userId: user.id, status: "approved" },
        orderBy: { createdAt: "asc" },
        take: Math.max(1, Number(s.maxQueue) || 10),
      });
      return {
        enabled: s.enabled !== false,
        autoPlayNext: s.autoPlayNext !== false,
        showDonorMessage: s.showDonorMessage !== false,
        showQueueList: s.showQueueList !== false,
        playerWidth: Number(s.playerWidth) || 720,
        accent: s.accent ?? "#059669",
        queue: videos.map((v: any) => ({
          id: v.id,
          donorName: v.donorName || "匿名",
          amount: v.amount,
          videoUrl: v.videoUrl,
          startSec: v.startSec,
          endSec: v.endSec,
          message: v.message,
        })),
      };
    }

    default:
      return { enabled: s.enabled !== false, settings: s };
  }
}

