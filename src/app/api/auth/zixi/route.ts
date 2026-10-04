import { NextRequest, NextResponse } from "next/server";

const ZIXI_OAUTH_URL = process.env.ZIXI_OAUTH_URL || "https://zixi-casino.vercel.app";
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
