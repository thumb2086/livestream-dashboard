import { NextRequest, NextResponse } from "next/server";
import { zixiOAuthOrigin } from "@/lib/zixi-endpoints";

// 2026-10-06：原本 fallback 是 `https://zixi-casino.vercel.app` ——
// 那是 zixi-casino（已拋棄）的**前端**網域，不是授權頁的服務端。
// 而 OAuth 授權頁在 zixi-earth 的 Worker 上（/api/oauth/authorize）。
// 單一來源見 lib/zixi-endpoints.ts。
const ZIXI_OAUTH_URL = zixiOAuthOrigin();
const ZIXI_CLIENT_ID = process.env.ZIXI_CLIENT_ID || "livestream-dashboard";

export async function GET(req: NextRequest) {
  const redirectUri = `${req.nextUrl.origin}/api/auth/zixi/callback`;

  const qs = new URLSearchParams({
    client_id: ZIXI_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "profile",
  });

  return NextResponse.redirect(`${ZIXI_OAUTH_URL}/oauth/consent?${qs.toString()}`);
}
