import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

// Only user-editable profile fields. Server-computed (chosenPlan, totals, followers,
// messages) and identity-linked (email) must NOT be self-writable — they allow
// privilege escalation / stats forgery / OAuth-merge takeover.
const ALLOWED = new Set(["name", "username", "publicPage", "donationMinAmount", "donationSound", "demoMode", "zixiWallet", "avatar"]);

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    return NextResponse.json(user);
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
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: filtered,
    });
    return NextResponse.json(updated);
  } catch (e) {
    console.error("PATCH /api/v1/user error:", e);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}
