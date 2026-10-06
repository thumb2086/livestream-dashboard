import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// 這條路由的 Prisma 全是 platformConnection / user —— 而那些 helper
// **已經存在**（platform-live-http.ts 是 live-viewers 那輪建的）。
//
// ⚠️ 而「helper 已經有了」這件事我是從掃描結果知道的：
//    掃描顯示 connections 有 9 處 Prisma，而 platform-live-http 已有
//    同類操作 —— 那代表這個模組可以重用，而不是再寫一份。
import {
  listAllPlatforms, findPlatformConnection, upsertPlatformConnection, saveChannelInfo,
} from "@/lib/platform-live-http";
import { updateUserProfile } from "@/lib/account-http";
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
    const conns = await listAllPlatforms(user.id);
    for (const conn of conns) {
      if (conn.connected && (!conn.channelName || !conn.channelAvatar) && conn.accessToken) {
        try {
          const info = await Promise.race([
            refreshChannelInfo(conn.platform, conn.accessToken, process.env.TWITCH_CLIENT_ID),
            new Promise<null>(resolve => setTimeout(() => resolve(null), 3000)),
          ]);
          if (info) {
            await saveChannelInfo(conn.id, { channelId: info.channelId, channelName: info.channelName, channelAvatar: info.channelAvatar });
            conn.channelName = info.channelName || conn.channelName;
            conn.channelAvatar = info.channelAvatar || conn.channelAvatar;
            const updateUser: any = {};
            if (info.channelName) updateUser.name = info.channelName;
            if (info.channelHandle) { const h = info.channelHandle.toLowerCase().replace(/[^a-z0-9]/g, ""); if (h) updateUser.username = h; }
            if (info.channelAvatar && !user.avatar) updateUser.avatar = info.channelAvatar;
            if (Object.keys(updateUser).length) await updateUserProfile(user.id, updateUser);
          }
        } catch { /* skip slow refresh */ }
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
        const conn = await findPlatformConnection(user.id, body.platform);
        if (conn?.accessToken && body.platform === "twitch") {
          // ⚠️ 撤銷 token 的請求帶 access_token 在 query string。
          //    那是 Twitch revoke 端點的規定（它不收 body）。
          //    後果是 access_token 會出現在 Cloudflare 的請求日誌裡。
          //    繼承行為，不是本次改動 —— 記錄下來是為了讓人知道它存在。
          try { await fetch(`https://id.twitch.tv/oauth2/revoke?client_id=${process.env.TWITCH_CLIENT_ID}&token=${conn.accessToken}`, { method: "POST" }); } catch { /* best effort */ }
        }
        await upsertPlatformConnection(user.id, body.platform, {
          connected: false,
          accessToken: null, refreshToken: null, tokenExpiresAt: null,
          channelId: null, channelName: null, channelAvatar: null,
        });
      }
    }

    if (body._meta === "refresh") {
      const conn = await findPlatformConnection(user.id, body.platform);
      if (conn?.connected && conn?.accessToken) {
        const info = await refreshChannelInfo(body.platform, conn.accessToken, process.env.TWITCH_CLIENT_ID);
        if (info) {
          await saveChannelInfo(conn.id, { channelId: info.channelId, channelName: info.channelName, channelAvatar: info.channelAvatar });
          const updateUser: any = {};
          if (info.channelName) updateUser.name = info.channelName;
          if (info.channelHandle) { const h = info.channelHandle.toLowerCase().replace(/[^a-z0-9]/g, ""); if (h) updateUser.username = h; }
          if (info.channelAvatar && !user.avatar) updateUser.avatar = info.channelAvatar;
          if (Object.keys(updateUser).length) await updateUserProfile(user.id, updateUser);
        }
      }
    }

    const conns = await listAllPlatforms(user.id);
    const result: Record<string, any> = {};
    conns.forEach((c) => { result[c.platform] = { connected: c.connected, channelName: c.channelName, channelAvatar: c.channelAvatar }; });
    return NextResponse.json(result);
  } catch (e) {
    console.error("POST /api/v1/connections error:", e);
    return NextResponse.json({ error: "Failed to update connections" }, { status: 500 });
  }
}
