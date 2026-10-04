import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { getLiveViewers, invalidateViewerCache } from "@/lib/platform-live";

export const dynamic = "force-dynamic";

/**
 * Live audience for the signed-in creator, fetched on demand so the settings
 * page can show a real number instead of whatever was last cached by the
 * overlay's poll.
 */
export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    // Overlay polls share a short cache; this endpoint is an explicit read so
    // it bypasses it and reports what the platform says right now.
    invalidateViewerCache(user.id);
    const viewers = await getLiveViewers(user.id);

    const conns = await prisma.platformConnection.findMany({
      where: { userId: user.id },
      select: {
        platform: true,
        connected: true,
        channelName: true,
        liveViewers: true,
        liveUpdatedAt: true,
        tokenExpiresAt: true,
      },
    });

    return NextResponse.json({
      viewers,
      known: viewers !== null,
      connections: conns.map((c) => ({
        platform: c.platform,
        connected: c.connected,
        channelName: c.channelName,
        liveViewers: c.liveViewers,
        liveUpdatedAt: c.liveUpdatedAt,
        // Surface an expired token instead of letting every platform call fail quietly.
        tokenExpired: c.tokenExpiresAt !== null && c.tokenExpiresAt.getTime() <= Date.now(),
      })),
    });
  } catch (e) {
    console.error("GET /api/v1/live-viewers error:", e);
    return NextResponse.json({ error: "Failed to fetch live viewers" }, { status: 500 });
  }
}
