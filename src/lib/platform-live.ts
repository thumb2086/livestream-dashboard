/**
 * Live audience figures and access-token upkeep for the connected platforms.
 *
 * Two jobs that the rest of the app depends on:
 *
 *  1. `getLiveViewers` — the real concurrent viewer count. Previously the
 *     overlay fell back to `user.totalViews` (a lifetime counter), which is not
 *     a live audience number at all.
 *  2. `ensureFreshToken` — the schema has always stored refreshToken and
 *     tokenExpiresAt, but nothing ever refreshed them, so an expired token made
 *     every platform call fail silently.
 */

const TWITCH_ID = "https://id.twitch.tv/oauth2/token";
const TWITCH_API = "https://api.twitch.tv/helix";

/** How long a fetched viewer count stays good before refetching. */
const VIEWER_TTL_MS = 20_000;

type CacheEntry = { viewers: number | null; at: number };
const viewerCache = new Map<string, CacheEntry>();

export type PlatformConn = {
  id: string;
  platform: string;
  connected: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  channelId: string | null;
  channelName: string | null;
  liveViewers: number | null;
  liveUpdatedAt: Date | null;
};

function viewerCacheGet(userId: string): CacheEntry | null {
  const hit = viewerCache.get(userId);
  if (hit && Date.now() - hit.at < VIEWER_TTL_MS) return hit;
  return null;
}

/**
 * Returns the summed live audience across connected platforms, or null when no
 * platform could report one (so callers can tell "offline" from "unknown").
 */
export async function getLiveViewers(userId: string): Promise<number | null> {
  const prisma = (await import("./prisma")).prisma;
  const cached = viewerCacheGet(userId);
  if (cached) return cached.viewers;

  const conns = (await prisma.platformConnection.findMany({
    where: { userId, connected: true },
  })) as unknown as PlatformConn[];

  if (conns.length === 0) {
    viewerCache.set(userId, { viewers: null, at: Date.now() });
    return null;
  }

  let total: number | null = null;

  for (const conn of conns) {
    if (!conn.accessToken) continue;
    const token = await ensureFreshToken(conn);
    if (!token) continue;

    let value: number | null = null;
    try {
      if (conn.platform === "twitch") {
        // Helix reports an empty array when the channel is offline, which is a
        // verified zero rather than a missing measurement.
        const q = conn.channelId
          ? `?user_id=${encodeURIComponent(conn.channelId)}`
          : conn.channelName
            ? `?user_login=${encodeURIComponent(conn.channelName.toLowerCase().replace(/[^a-z0-9_]/g, ""))}`
            : "";
        if (!q) continue;
        const res = await fetch(`${TWITCH_API}/streams${q}`, {
          headers: { Authorization: `Bearer ${token}`, "Client-Id": process.env.TWITCH_CLIENT_ID ?? "" },
        });
        if (res.ok) {
          const data: any = await res.json();
          const stream = data?.data?.[0];
          value = stream ? Number(stream.viewer_count) || 0 : 0;
        }
      } else if (conn.platform === "youtube") {
        // YouTube exposes no public concurrent-viewer API. Reporting the
        // lifetime view count here would be a different number wearing the same
        // label, so report nothing rather than mislead.
        value = null;
      }
    } catch {
      value = null;
    }

    if (value !== null) total = (total ?? 0) + value;
    if (value !== null || conn.liveViewers !== null) {
      await prisma.platformConnection
        .update({
          where: { id: conn.id },
          data: { liveViewers: value, liveUpdatedAt: new Date() },
        })
        .catch(() => {});
    }
  }

  viewerCache.set(userId, { viewers: total, at: Date.now() });
  return total;
}

/**
 * Exchanges the refresh token when the access token is expired (or close to it)
 * and persists the result. Returns a usable access token, or null if none.
 */
export async function ensureFreshToken(conn: PlatformConn): Promise<string | null> {
  if (!conn.accessToken) return null;

  const expiresSoon =
    conn.tokenExpiresAt instanceof Date && conn.tokenExpiresAt.getTime() - Date.now() < 60_000;
  if (!expiresSoon || !conn.refreshToken) return conn.accessToken;

  const prisma = (await import("./prisma")).prisma;
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return conn.accessToken;

  try {
    const res = await fetch(TWITCH_ID, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: conn.refreshToken,
      }),
    });
    if (!res.ok) return conn.accessToken;
    const data: any = await res.json();
    if (!data.access_token) return conn.accessToken;

    const expiresIn = Number(data.expires_in) || 0;
    await prisma.platformConnection
      .update({
        where: { id: conn.id },
        data: {
          accessToken: data.access_token,
          // Twitch only rotates the refresh token when the old one is still valid.
          ...(data.refresh_token ? { refreshToken: data.refresh_token } : {}),
          tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
        },
      })
      .catch(() => {});
    return data.access_token as string;
  } catch {
    return conn.accessToken;
  }
}

/** Test hook: forget cached counts so the next call hits the platform. */
export function invalidateViewerCache(userId?: string) {
  if (userId) viewerCache.delete(userId);
  else viewerCache.clear();
}
