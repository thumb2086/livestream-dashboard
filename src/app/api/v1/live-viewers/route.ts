import { NextResponse } from "next/server";
import { query } from "@/lib/db-http";
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

    const conns = await query<{
      platform: string;
      connected: boolean;
      channelName: string | null;
      liveViewers: number | null;
      liveUpdatedAt: string | null;
      tokenExpiresAt: string | null;
    }>(
      `SELECT "platform", "connected", "channelName", "liveViewers", "liveUpdatedAt", "tokenExpiresAt"
         FROM "PlatformConnection"
        WHERE "userId" = $1`,
      [user.id],
    );

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
        tokenExpired: c.tokenExpiresAt !== null && new Date(c.tokenExpiresAt).getTime() <= Date.now(),
      })),
    });
  } catch (e) {
    console.error("GET /api/v1/live-viewers error:", e);
    return NextResponse.json({ error: "Failed to fetch live viewers" }, { status: 500 });
  }
}
