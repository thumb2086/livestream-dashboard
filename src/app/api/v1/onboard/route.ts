import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import { getOnboardState, upsertOnboardState } from "@/lib/onboard-state-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const ALLOWED = new Set(["step1", "step2", "step3", "step4"]);

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const state = await getOnboardState(user.id);
    return NextResponse.json(state);
  } catch (e) {
    console.error("GET /api/v1/onboard error:", e);
    return NextResponse.json({ error: "Failed to fetch onboard state" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();
    const filtered: Record<string, unknown> = {};
    for (const key of Object.keys(body)) {
      if (ALLOWED.has(key)) filtered[key] = body[key];
    }
    await upsertOnboardState(user.id, filtered);
    const state = await getOnboardState(user.id);
    return NextResponse.json(state);
  } catch (e) {
    console.error("POST /api/v1/onboard error:", e);
    return NextResponse.json({ error: "Failed to update onboard state" }, { status: 500 });
  }
}
