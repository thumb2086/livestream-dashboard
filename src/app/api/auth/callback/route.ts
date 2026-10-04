import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const CLIENT_CONFIG: Record<string, { tokenUrl: string; idEnv: string; secretEnv: string }> = {
  twitch: { tokenUrl: "https://id.twitch.tv/oauth2/token", idEnv: "TWITCH_CLIENT_ID", secretEnv: "TWITCH_CLIENT_SECRET" },
  youtube: { tokenUrl: "https://oauth2.googleapis.com/token", idEnv: "YOUTUBE_CLIENT_ID", secretEnv: "YOUTUBE_CLIENT_SECRET" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const stateParam = searchParams.get("state");

  let platform = "twitch";
  if (stateParam) {
    try {
      const decoded = JSON.parse(Buffer.from(stateParam, "base64").toString());
      platform = decoded.platform || "twitch";
    } catch { /* ignore */ }
  }

  if (errorParam) return NextResponse.redirect(new URL(`/dashboard/connections?error=${errorParam}`, req.url));
  if (!code) return NextResponse.redirect(new URL(`/dashboard/connections?error=no_code&platform=${platform}`, req.url));

  const config = CLIENT_CONFIG[platform];
  if (!config) return NextResponse.redirect(new URL("/dashboard/connections?error=unknown_platform", req.url));

  const clientId = process.env[config.idEnv];
  const clientSecret = process.env[config.secretEnv];
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL("/dashboard/connections?error=missing_credentials", req.url));

  // Exchange code for tokens
  let tokens: any;
  try {
    const redirectUri = `${req.nextUrl.origin}/api/auth/callback`;
    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error(`Token exchange failed for ${platform}:`, text);
      return NextResponse.redirect(new URL("/dashboard/connections?error=token_exchange_failed", req.url));
    }
    tokens = await tokenRes.json();
  } catch (e) {
    console.error(`Token exchange exception for ${platform}:`, e);
    return NextResponse.redirect(new URL("/dashboard/connections?error=token_exchange_failed", req.url));
  }

  // Fetch channel/user info (best effort)
  let channelId: string | null = null, channelName: string | null = null, channelHandle: string | null = null, channelAvatar: string | null = null, email: string | null = null;

  try {
    if (platform === "twitch") {
      const res = await fetch("https://api.twitch.tv/helix/users", {
        headers: { Authorization: `Bearer ${tokens.access_token}`, "Client-Id": clientId },
      });
      if (res.ok) { const d: any = await res.json(); if (d.data?.[0]) { channelId = d.data[0].id; channelName = d.data[0].display_name; channelHandle = d.data[0].login; channelAvatar = d.data[0].profile_image_url; email = d.data[0].email; } }
    } else if (platform === "youtube") {
      // 1. Try YouTube channel API (gives the CHANNEL name + handle)
      const chRes = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (chRes.ok) {
        const chData: any = await chRes.json();
        if (chData.items?.[0]) { const ch = chData.items[0]; channelId = ch.id; channelName = ch.snippet.title; channelHandle = ch.snippet.customUrl?.replace(/^@/, ""); channelAvatar = ch.snippet.thumbnails?.default?.url; }
      } else {
        const chErr = await chRes.text();
        console.error(`YouTube channel API failed (${chRes.status}):`, chErr);
      }
      // 2. Get email + avatar from userinfo (always works with Google OAuth)
      const infoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) { const info: any = await infoRes.json(); email = info.email; if (!channelAvatar) channelAvatar = info.picture; }
      // 3. If channel API failed, check scopes
      if (!channelName) {
        try {
          const tokRes = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${tokens.access_token}`);
          if (tokRes.ok) console.log("Token scopes:", (await tokRes.json()).scope);
        } catch { /* ignore */ }
      }
    }
  } catch (e) { console.error(`Failed to fetch ${platform} info:`, e); }

  // Determine user: check existing session → email match → channel match → create new
  let user: any = null;

  // 1. Check existing session cookie
  const cookie = req.headers.get("cookie") || "";
  const sessionMatch = cookie.match(/sf_session=([^;]+)/);
  if (sessionMatch) {
    const existingSession = await prisma.session.findUnique({ where: { id: sessionMatch[1] } });
    if (existingSession) user = await prisma.user.findUnique({ where: { id: existingSession.userId } });
  }

  // 2. Try by email (most reliable cross-platform)
  if (!user && email) {
    user = await prisma.user.findFirst({ where: { email } });
  }

  // 3. Try by channel ID
  if (!user && channelId) {
    const conn = await prisma.platformConnection.findFirst({ where: { channelId, platform } });
    if (conn) user = await prisma.user.findUnique({ where: { id: conn.userId } });
  }

  // 4. If this user already has a connection for this platform, DON'T create new user
  if (!user) {
    const existingConn = await prisma.platformConnection.findFirst({ where: { platform, channelName } });
    if (existingConn) user = await prisma.user.findUnique({ where: { id: existingConn.userId } });
  }

  // 5. Create new user with default settings
  if (!user) {
    const finalHandle = (channelHandle || channelName || email?.split("@")[0] || `user_${Date.now()}`).toLowerCase().replace(/[^a-z0-9]/g, "");
    const finalName = channelName || finalHandle;
    function rt(): string { return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8); }
    user = await prisma.user.create({ data: { name: finalName, username: finalHandle, email: email || "", demoMode: false } });
    await Promise.all([
      prisma.chatSettings.create({ data: { userId: user.id } }),
      prisma.subtitleConfig.create({ data: { userId: user.id } }),
      prisma.onboardState.create({ data: { userId: user.id } }),
      prisma.platformConnection.upsert({
        where: { userId_platform: { userId: user.id, platform: "twitch" } },
        update: {}, create: { userId: user.id, platform: "twitch", connected: false },
      }),
      prisma.platformConnection.upsert({
        where: { userId_platform: { userId: user.id, platform: "youtube" } },
        update: {}, create: { userId: user.id, platform: "youtube", connected: false },
      }),
      prisma.oBSSource.create({ data: { userId: user.id, sourceKey: "chat", name: "聊天室疊加層", token: rt() } }),
      prisma.oBSSource.create({ data: { userId: user.id, sourceKey: "donations", name: "斗內進度條", token: rt(), enabled: false } }),
      prisma.oBSSource.create({ data: { userId: user.id, sourceKey: "subtitles", name: "字幕疊加層", token: rt() } }),
      prisma.oBSSource.create({ data: { userId: user.id, sourceKey: "alerts", name: "斗內通知", token: rt() } }),
      prisma.oBSSource.create({ data: { userId: user.id, sourceKey: "stats", name: "頻道統計疊加層", token: rt(), enabled: false } }),
    ]);
  } else {
    // Update user: display name from channel name, username from handle
    const updateFields: any = {};
    if (channelName && channelName !== user.name) updateFields.name = channelName;
    if (channelHandle) {
      const cleanHandle = channelHandle.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanHandle && cleanHandle !== user.username) updateFields.username = cleanHandle;
    }
    if (email && email !== user.email) updateFields.email = email;
    if (channelAvatar && !user.avatar) updateFields.avatar = channelAvatar;
    if (Object.keys(updateFields).length) await prisma.user.update({ where: { id: user.id }, data: updateFields });
  }

  // Store/update platform connection for THIS user (regardless of which platform it is)
  await prisma.platformConnection.upsert({
    where: { userId_platform: { userId: user.id, platform } },
    update: { connected: true, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null, tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000), channelId, channelName, channelAvatar },
    create: { userId: user.id, platform, connected: true, accessToken: tokens.access_token, refreshToken: tokens.refresh_token || null, tokenExpiresAt: new Date(Date.now() + (tokens.expires_in || 3600) * 1000), channelId, channelName, channelAvatar },
  });

  // Create/renew session
  const session = await prisma.session.create({ data: { userId: user.id, platform } });
  const response = NextResponse.redirect(new URL(`/dashboard/connections?connected=${platform}`, req.url));
  response.cookies.set("sf_session", session.id, { httpOnly: true, maxAge: 86400 * 30, path: "/", sameSite: "lax" });

  return response;
}
