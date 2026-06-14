import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

async function refreshChannelInfo(platform: string, accessToken: string, clientId?: string) {
  if (platform === "twitch" && clientId) {
    const res = await fetch("https://api.twitch.tv/helix/users", {
      headers: { Authorization: `Bearer ${accessToken}`, "Client-Id": clientId },
    });
    if (res.ok) {
      const data: any = await res.json();
      if (data.data?.[0]) {
        const u = data.data[0];
        return { channelId: u.id, channelName: u.display_name, channelHandle: u.login, channelAvatar: u.profile_image_url };
      }
    }
  } else if (platform === "youtube") {
    const ytRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (ytRes.ok) {
      const data: any = await ytRes.json();
      if (data.items?.[0]) {
        const ch = data.items[0];
        return { channelId: ch.id, channelName: ch.snippet.title, channelHandle: ch.snippet.customUrl?.replace(/^@/, ""), channelAvatar: ch.snippet.thumbnails?.default?.url };
      }
    }
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const conns = await prisma.platformConnection.findMany({ where: { userId: user.id } });
    for (const conn of conns) {
      if (conn.connected && (!conn.channelName || !conn.channelAvatar) && conn.accessToken) {
        const info = await refreshChannelInfo(conn.platform, conn.accessToken, process.env.TWITCH_CLIENT_ID);
        if (info) {
          await prisma.platformConnection.update({ where: { id: conn.id }, data: { channelId: info.channelId, channelName: info.channelName, channelAvatar: info.channelAvatar } });
          conn.channelName = info.channelName || conn.channelName;
          conn.channelAvatar = info.channelAvatar || conn.channelAvatar;
          const updateUser: any = {};
          if (info.channelName) updateUser.name = info.channelName;
          if (info.channelHandle) { const h = info.channelHandle.toLowerCase().replace(/[^a-z0-9]/g, ""); if (h) updateUser.username = h; }
          if (info.channelAvatar && !user.avatar) updateUser.avatar = info.channelAvatar;
          if (Object.keys(updateUser).length) await prisma.user.update({ where: { id: user.id }, data: updateUser });
        }
      }
    }
    const result: Record<string, any> = {};
    conns.forEach((c) => { result[c.platform] = { connected: c.connected, channelName: c.channelName, channelAvatar: c.channelAvatar }; });
    return NextResponse.json(result);
  } catch (e) {
    console.error("GET /api/v1/connections error:", e);
    return NextResponse.json({ error: "Failed to fetch connections" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "toggle") {
      if (typeof body.platform !== "string" || typeof body.connected !== "boolean") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      if (body.connected === false) {
        const conn = await prisma.platformConnection.findUnique({
          where: { userId_platform: { userId: user.id, platform: body.platform } },
        });
        if (conn?.accessToken && body.platform === "twitch") {
          try { await fetch(`https://id.twitch.tv/oauth2/revoke?client_id=${process.env.TWITCH_CLIENT_ID}&token=${conn.accessToken}`, { method: "POST" }); } catch { /* best effort */ }
        }
        await prisma.platformConnection.upsert({
          where: { userId_platform: { userId: user.id, platform: body.platform } },
          update: { connected: false, accessToken: null, refreshToken: null, tokenExpiresAt: null, channelId: null, channelName: null, channelAvatar: null },
          create: { userId: user.id, platform: body.platform, connected: false },
        });
      }
    }

    if (body._meta === "refresh") {
      const conn = await prisma.platformConnection.findUnique({
        where: { userId_platform: { userId: user.id, platform: body.platform } },
      });
      if (conn?.connected && conn?.accessToken) {
        const info = await refreshChannelInfo(body.platform, conn.accessToken, process.env.TWITCH_CLIENT_ID);
        if (info) {
          await prisma.platformConnection.update({ where: { id: conn.id }, data: { channelId: info.channelId, channelName: info.channelName, channelAvatar: info.channelAvatar } });
          const updateUser: any = {};
          if (info.channelName) updateUser.name = info.channelName;
          if (info.channelHandle) { const h = info.channelHandle.toLowerCase().replace(/[^a-z0-9]/g, ""); if (h) updateUser.username = h; }
          if (info.channelAvatar && !user.avatar) updateUser.avatar = info.channelAvatar;
          if (Object.keys(updateUser).length) await prisma.user.update({ where: { id: user.id }, data: updateUser });
        }
      }
    }

    const conns = await prisma.platformConnection.findMany({ where: { userId: user.id } });
    const result: Record<string, any> = {};
    conns.forEach((c) => { result[c.platform] = { connected: c.connected, channelName: c.channelName, channelAvatar: c.channelAvatar }; });
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/v1/connections error:", e);
    return NextResponse.json({ error: "Failed to update connections" }, { status: 500 });
  }
}
