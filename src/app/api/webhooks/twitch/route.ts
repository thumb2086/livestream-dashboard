import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Twitch EventSub webhook.
 *
 * Mount the callback as
 *   https://<domain>/api/webhooks/twitch?user=<username>
 * and subscribe to `channel.follow`, `channel.subscribe`, `channel.subscription.gift`
 * plus `channel.raid`. Twitch retries non-2xx responses, so we always answer 200
 * once the signature has been checked and the event stored.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const secret = process.env.TWITCH_EVENTSUB_SECRET;

  // Fail closed. Skipping the check when no secret is configured would let
  // anyone POST a fake raid or follow and have it appear on the stream.
  if (!secret) {
    console.error("TWITCH_EVENTSUB_SECRET is not set — rejecting EventSub delivery");
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  {
    const id = req.headers.get("twitch-eventsub-message-id") ?? "";
    const ts = req.headers.get("twitch-eventsub-message-timestamp") ?? "";
    const sig = req.headers.get("twitch-eventsub-message-signature") ?? "";
    if (!id || !ts || !sig) {
      return NextResponse.json({ error: "missing signature headers" }, { status: 400 });
    }
    const { createHmac } = await import("node:crypto");
    const expected = "sha256=" + createHmac("sha256", secret).update(`${id}${ts}${raw}`).digest("hex");
    if (!timingSafeEqual(sig, expected)) {
      return NextResponse.json({ error: "bad signature" }, { status: 403 });
    }

    // Reject stale replays. Twitch retries for ~10 minutes, so a short window
    // still absorbs legitimate retries while bounding a captured request.
    const age = Date.now() - Date.parse(ts);
    if (!Number.isFinite(age) || age > 10 * 60 * 1000 || age < -60 * 1000) {
      return NextResponse.json({ error: "stale message" }, { status: 403 });
    }
  }

  let body: any;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // Subscription lifecycle messages carry no event payload.
  if (body.subscription?.status === "webhook_callback_verification_pending" && body.challenge) {
    return new Response(body.challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  if (!body.event) return NextResponse.json({ ok: true, ignored: true });

  const username = new URL(req.url).searchParams.get("user");
  if (!username) return NextResponse.json({ error: "user query required" }, { status: 400 });

  const owner = await (prisma as any).user.findUnique({ where: { username } });
  if (!owner) return NextResponse.json({ error: "creator not found" }, { status: 404 });

  const ev = body.event;
  const type = String(body.subscription?.type ?? "");
  const map: Record<string, { kind: string }> = {
    "channel.follow": { kind: "follow" },
    "channel.subscribe": { kind: "sub" },
    "channel.subscription.gift": { kind: "subgift" },
    "channel.cheer": { kind: "cheer" },
    "channel.raid": { kind: "raid" },
  };
  const kind = map[type]?.kind ?? type.split(".").pop() ?? "event";

  const externalId = String(
    ev.id ?? body.subscription?.id ?? `${type}:${ev.user_id ?? ev.from_user_id ?? ""}:${Date.now()}`
  );

  const data = {
    userId: owner.id,
    platform: "twitch",
    kind,
    externalId,
    actorName: String(ev.user_name ?? ev.from_user_name ?? ev.display_name ?? ""),
    actorId: String(ev.user_id ?? ev.from_user_id ?? ""),
    message: String(ev.message ?? ""),
    amount: Number(ev.amount ?? ev.viewer_count ?? 0) || 0,
    tier: String(ev.tier ?? ""),
    months: Number(ev.cumulative_months ?? ev.streak_months ?? 0) || 0,
    payload: body,
  };

  try {
    // Idempotent: Twitch redelivers, so ignore duplicates.
    await (prisma as any).eventLog.upsert({
      where: { platform_kind_externalId: { platform: "twitch", kind, externalId } },
      create: data,
      update: {},
    });
  } catch (e) {
    console.error("eventLog upsert failed:", e);
    return NextResponse.json({ error: "failed to store event" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, kind });
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}