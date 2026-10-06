import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import { listAllPlatforms, saveChannelInfo } from "@/lib/platform-live-http";
import { updateUserProfile } from "@/lib/account-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    let twitchFol = 0, ytSubs = 0;
    const conns = await listAllPlatforms(user.id);
    const connectedConns = conns.filter((c) => c.connected);

    /**
     * Per-source outcome. A platform that is not connected, has no token, or
     * rejected the call is reported as `known: false` — its 0 must not be shown
     * as "0 followers", which is a different claim.
     */
    const sources: { platform: string; connected: boolean; known: boolean; count: number; channelName: string | null; detail: string | null }[] = [];

    for (const conn of connectedConns) {
      const base = { platform: conn.platform, connected: true, channelName: conn.channelName, count: 0, detail: null as string | null };
      if (!conn.accessToken) {
        sources.push({ ...base, known: false, detail: "尚未取得存取權杖" });
        continue;
      }
      try {
        if (conn.platform === "youtube") {
          let token = conn.accessToken;
          // Refresh if expired
          if (conn.refreshToken && conn.tokenExpiresAt && new Date(conn.tokenExpiresAt) < new Date()) {
            const r = await fetch("https://oauth2.googleapis.com/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID || "", client_secret: process.env.YOUTUBE_CLIENT_SECRET || "", refresh_token: conn.refreshToken, grant_type: "refresh_token" }),
            });
            if (r.ok) {
              const td: any = await r.json();
              token = td.access_token;
              await saveChannelInfo(conn.id, {
                accessToken: token,
                tokenExpiresAt: new Date(Date.now() + (td.expires_in || 3600) * 1000).toISOString(),
              });
            }
          }
          const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) { const d: any = await res.json(); ytSubs = parseInt(d.items?.[0]?.statistics?.subscriberCount || "0"); sources.push({ ...base, known: true, count: ytSubs }); }
          else { const errText = await res.text(); console.error(`YouTube API error (${res.status}):`, errText); sources.push({ ...base, known: false, detail: `HTTP ${res.status}` }); }
        } else if (conn.platform === "twitch") {
          const res = await fetch("https://api.twitch.tv/helix/users", {
            headers: { Authorization: `Bearer ${conn.accessToken}`, "Client-Id": process.env.TWITCH_CLIENT_ID || "" },
          });
          if (res.ok) { const d: any = await res.json(); const uid = d.data?.[0]?.id; if (uid) {
            const f = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${uid}`, {
              headers: { Authorization: `Bearer ${conn.accessToken}`, "Client-Id": process.env.TWITCH_CLIENT_ID || "" },
            });
            if (f.ok) { const fd: any = await f.json(); twitchFol = fd.total ?? null; twitchFol = fd.total || 0; sources.push({ ...base, known: true, count: twitchFol }); }
            else {
              // Usually the token lacks moderator:read:followers.
              const t = await f.text().catch(() => "");
              console.error(`Twitch followers error (${f.status}):`, t.slice(0, 200));
              sources.push({ ...base, known: false, detail: f.status === 401 ? "權杖缺少 moderator:read:followers 權限" : `HTTP ${f.status}` });
            }
          } else { sources.push({ ...base, known: false, detail: "找不到頻道" }); } }
          else { sources.push({ ...base, known: false, detail: `HTTP ${res.status}` }); }
        } else {
          sources.push({ ...base, known: false, detail: "尚未支援的平台" });
        }
      } catch (e) { console.error(`Failed to fetch ${conn.platform} subscribers:`, e); sources.push({ ...base, known: false, detail: "請求失敗" }); }
    }

    // Platforms the creator has not connected at all.
    for (const p of ["twitch", "youtube"]) {
      if (!connectedConns.some((c) => c.platform === p)) {
        sources.push({ platform: p, connected: false, known: false, count: 0, channelName: null, detail: "尚未串接" });
      }
    }

    const total = twitchFol + ytSubs;
    if (total > 0 && total !== user.followers) {
      await updateUserProfile(user.id, { followers: total });
    }

    return NextResponse.json({ followers: total, twitch: twitchFol, youtube: ytSubs, sources });
  } catch (e) {
    console.error("GET /api/v1/stats error:", e);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
