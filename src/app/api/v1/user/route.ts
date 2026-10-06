import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import { queryOne } from "@/lib/db-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

// Only user-editable profile fields. Server-computed (chosenPlan, totals, followers,
// messages) and identity-linked (email) must NOT be self-writable — they allow
// privilege escalation / stats forgery / OAuth-merge takeover.
const ALLOWED = new Set(["name", "username", "publicPage", "donationMinAmount", "donationSound", "demoMode", "zixiWallet", "avatar"]);

/**
 * The only shape of a user that leaves the server.
 *
 * Both handlers used to `return NextResponse.json(user)` on the raw row, which
 * shipped `zixiAccessToken` -- a live third-party OAuth bearer -- to the browser
 * on every dashboard load, along with its expiry. Derived flags replace it: the
 * UI needs to know *whether* ZIXI is connected, never the credential.
 *
 * Keep this explicit rather than spreading the raw row. A new secret column on
 * the model should not become a leak by default.
 */
function publicUser(u: {
  id: string;
  name: string;
  username: string;
  avatar: string;
  publicPage: boolean;
  demoMode: boolean;
  chosenPlan: string;
  donationMinAmount: number;
  donationSound: string;
  donationTotal: number;
  donationDonors: number;
  totalViews: number;
  followers: number;
  totalMessages: number;
  zixiWallet: string;
  zixiAccessToken?: string | null;
  zixiTokenExpiresAt?: Date | null;
}) {
  const expires = u.zixiTokenExpiresAt ? new Date(u.zixiTokenExpiresAt) : null;
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    avatar: u.avatar,
    publicPage: u.publicPage,
    demoMode: u.demoMode,
    chosenPlan: u.chosenPlan,
    donationMinAmount: u.donationMinAmount,
    donationSound: u.donationSound,
    donationTotal: u.donationTotal,
    donationDonors: u.donationDonors,
    totalViews: u.totalViews,
    followers: u.followers,
    totalMessages: u.totalMessages,
    zixiWallet: u.zixiWallet,
    zixiConnected: Boolean(u.zixiAccessToken) && (!expires || expires > new Date()),
  };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    return NextResponse.json(publicUser(user as any));
  } catch (e) {
    console.error("GET /api/v1/user error:", e);
    return NextResponse.json({ error: "Failed to fetch user" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED.has(key)) filtered[key] = body[key];
    }
    const updated = await queryOne(
      `UPDATE "User" SET ${Object.keys(filtered).map((k, i) => `"${k}" = $${i + 2}`).join(", ")} WHERE "id" = $1 RETURNING *`,
      [user.id, ...Object.values(filtered)],
    );
    return NextResponse.json(publicUser(updated as any));
  } catch (e) {
    console.error("PATCH /api/v1/user error:", e);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}