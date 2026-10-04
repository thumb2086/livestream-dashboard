import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

/**
 * Generic per-feature JSON settings store.
 * GET /api/v1/features/:key   -> { settings }
 * PUT /api/v1/features/:key   -> { settings }
 */
type Ctx = { params: Promise<{ key: string }> };

// Whitelist of feature keys the dashboard is allowed to persist.
const ALLOWED_KEYS = new Set([
  "payment-settings",
  "donation-cards",
  "shared-donation-rooms",
  "donation-video",
  "donation-ticker",
  "follower-alert",
  "live-viewers",
  "scoreboard",
  "channel-stats",
  "membership",
  "subscription",
  "commerce",
  "meetups",
  "replay-analysis",
  "account",
  "captions",
  "chat",
]);

function isValidKey(key: string) {
  return ALLOWED_KEYS.has(key) && /^[a-z0-9-]{1,40}$/.test(key);
}

export async function GET(req: Request, ctx: Ctx) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const { key } = await ctx.params;
    if (!isValidKey(key)) return NextResponse.json({ error: "Unknown feature key" }, { status: 400 });

    const row = await (prisma as any).featureSettings.findUnique({
      where: { userId_featureKey: { userId: user.id, featureKey: key } },
    });
    return NextResponse.json({ settings: row?.settings ?? {} });
  } catch (e) {
    console.error("GET /api/v1/features/[key] error:", e);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request, ctx: Ctx) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const { key } = await ctx.params;
    if (!isValidKey(key)) return NextResponse.json({ error: "Unknown feature key" }, { status: 400 });

    const body = await req.json();
    if (!body || typeof body.settings !== "object" || body.settings === null || Array.isArray(body.settings)) {
      return NextResponse.json({ error: "settings must be an object" }, { status: 400 });
    }

    // Cap serialized size so a single settings blob cannot bloat the row.
    const payload = JSON.stringify(body.settings);
    if (payload.length > 64_000) {
      return NextResponse.json({ error: "settings too large (64KB limit)" }, { status: 413 });
    }

    const row = await (prisma as any).featureSettings.upsert({
      where: { userId_featureKey: { userId: user.id, featureKey: key } },
      create: { userId: user.id, featureKey: key, settings: body.settings },
      update: { settings: body.settings },
    });
    return NextResponse.json({ settings: row.settings });
  } catch (e) {
    console.error("PUT /api/v1/features/[key] error:", e);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}