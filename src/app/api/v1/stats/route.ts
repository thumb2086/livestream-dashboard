import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    let twitchFol = 0, ytSubs = 0;
    const conns = await prisma.platformConnection.findMany({ where: { userId: user.id, connected: true } });

    for (const conn of conns) {
      if (!conn.accessToken) continue;
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
            if (r.ok) { const td: any = await r.json(); token = td.access_token; await prisma.platformConnection.update({ where: { id: conn.id }, data: { accessToken: token, tokenExpiresAt: new Date(Date.now() + (td.expires_in || 3600) * 1000) } }); }
          }
          const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=statistics&mine=true", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) { const d: any = await res.json(); ytSubs = parseInt(d.items?.[0]?.statistics?.subscriberCount || "0"); }
          else { const errText = await res.text(); console.error(`YouTube API error (${res.status}):`, errText); }
        } else if (conn.platform === "twitch") {
          const res = await fetch("https://api.twitch.tv/helix/users", {
            headers: { Authorization: `Bearer ${conn.accessToken}`, "Client-Id": process.env.TWITCH_CLIENT_ID || "" },
          });
          if (res.ok) { const d: any = await res.json(); const uid = d.data?.[0]?.id; if (uid) {
            const f = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${uid}`, {
              headers: { Authorization: `Bearer ${conn.accessToken}`, "Client-Id": process.env.TWITCH_CLIENT_ID || "" },
            });
            if (f.ok) { const fd: any = await f.json(); twitchFol = fd.total || 0; }
          }}
        }
      } catch (e) { console.error(`Failed to fetch ${conn.platform} subscribers:`, e); }
    }

    const total = twitchFol + ytSubs;
    if (total > 0 && total !== user.followers) {
      await prisma.user.update({ where: { id: user.id }, data: { followers: total } });
    }

    return NextResponse.json({ followers: total, twitch: twitchFol, youtube: ytSubs });
  } catch (e) {
    console.error("GET /api/v1/stats error:", e);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
