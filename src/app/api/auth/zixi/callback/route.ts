import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionId } from "@/lib/getUser";
import { zixiApiBase } from "@/lib/zixi-endpoints";

// 2026-10-06：原本是 `|| "https://zixi-casino-api.onrender.com/api/v1"`。
// 那台 Render 已經逾時（實測），而 .env.example 從來沒宣告 ZIXI_API_URL ——
// 所以**每次部署都靜默使用死掉的 host**。
// 現在走 lib/zixi-endpoints.ts 單一來源，預設指向實測活著的 workers.dev。
// 詳見該檔案檔頭：問題不是網址舊了，是「舊網址是 fallback」。
const ZIXI_API_URL = zixiApiBase();
const ZIXI_CLIENT_ID = process.env.ZIXI_CLIENT_ID || "livestream-dashboard";
const ZIXI_CLIENT_SECRET = process.env.ZIXI_CLIENT_SECRET || "";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const errorParam = searchParams.get("error");
  const stateParam = searchParams.get("state");

  if (errorParam) {
    return NextResponse.redirect(new URL("/dashboard/zixi?error=" + errorParam, req.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/dashboard/zixi?error=no_code", req.url));
  }

  const sessionId = getSessionId(req);
  if (!sessionId) {
    return NextResponse.redirect(new URL("/dashboard/zixi?error=not_logged_in", req.url));
  }

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  if (!session) {
    return NextResponse.redirect(new URL("/dashboard/zixi?error=session_not_found", req.url));
  }

  if (!ZIXI_CLIENT_SECRET) {
    return NextResponse.redirect(new URL("/dashboard/zixi?error=missing_client_secret", req.url));
  }

  try {
    const redirectUri = `${req.nextUrl.origin}/api/auth/zixi/callback`;
    const tokenRes = await fetch(`${ZIXI_API_URL}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        client_id: ZIXI_CLIENT_ID,
        client_secret: ZIXI_CLIENT_SECRET,
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      console.error("ZIXI token exchange failed:", tokenData);
      return NextResponse.redirect(new URL("/dashboard/zixi?error=token_exchange_failed", req.url));
    }

    await prisma.user.update({
      where: { id: session.userId },
      data: {
        zixiAccessToken: tokenData.access_token,
        zixiTokenExpiresAt: new Date(Date.now() + (tokenData.expires_in || 365 * 24 * 3600) * 1000),
      },
    });

    return NextResponse.redirect(new URL("/dashboard/zixi?success=connected", req.url));
  } catch (e) {
    console.error("ZIXI OAuth callback error:", e);
    return NextResponse.redirect(new URL("/dashboard/zixi?error=callback_failed", req.url));
  }
}
