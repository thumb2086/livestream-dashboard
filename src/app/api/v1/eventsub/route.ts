import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { subscribeEvents, deleteAllSubscriptions, listSubscriptions, getAppAccessToken } from "@/lib/twitch-eventsub";

export const dynamic = "force-dynamic";

/**
 * Registers (or reports) the Twitch EventSub subscriptions that feed the
 * follow / sub / cheer / raid alerts.
 *
 * Twitch only delivers events you explicitly subscribe to, so without this the
 * webhook route would sit idle forever.
 */
export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    const conn = await prisma.platformConnection.findFirst({
      where: { userId: user.id, platform: "twitch", connected: true },
    });
    if (!conn?.channelId) {
      return NextResponse.json({ error: "尚未連線 Twitch，或尚未取得 channel id" }, { status: 400 });
    }

    const token = await getAppAccessToken();
    if (!token) {
      return NextResponse.json({ error: "缺少 TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET" }, { status: 400 });
    }

    const list = await listSubscriptions(conn.channelId, token);
    return NextResponse.json({
      channelId: conn.channelId,
      channelName: conn.channelName,
      ok: list.ok,
      subscriptions: list.existing,
    });
  } catch (e) {
    console.error("GET /api/v1/eventsub error:", e);
    return NextResponse.json({ error: "Failed to read EventSub subscriptions" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    const body = await req.json().catch(() => ({}));

    if (body._meta === "removeAll") {
      const conn = await prisma.platformConnection.findFirst({
        where: { userId: user.id, platform: "twitch", connected: true },
      });
      if (!conn?.channelId) return NextResponse.json({ error: "尚未連線 Twitch" }, { status: 400 });
      const removed = await deleteAllSubscriptions(conn.channelId);
      return NextResponse.json({ removed });
    }

    const conn = await prisma.platformConnection.findFirst({
      where: { userId: user.id, platform: "twitch", connected: true },
    });
    if (!conn?.channelId) {
      return NextResponse.json({ error: "尚未連線 Twitch，或尚未取得 channel id" }, { status: 400 });
    }

    // EventSub delivers over the public internet, so the callback must be a
    // reachable https URL. Overriding it is what makes this testable against a
    // tunnel instead of a deployed domain.
    const base =
      str(body.baseUrl) ||
      process.env.PUBLIC_BASE_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
    if (!base) {
      return NextResponse.json(
        {
          error: "缺少公開網址",
          hint: "設定 PUBLIC_BASE_URL，或在請求中帶 baseUrl。EventSub 要求 Twitch 能以 HTTPS 連到你的 callback。",
        },
        { status: 400 }
      );
    }

    // Twitch replays the callback URL verbatim, query string included, so the
    // creator has to be carried in it — the handler resolves the owner from it.
    const username = str(body.username) || conn.channelName || (user.username ?? "");
    if (!username) {
      return NextResponse.json({ error: "需要 username 才能組出 callback 網址" }, { status: 400 });
    }

    const callback = `${base.replace(/\/+$/, "")}/api/webhooks/twitch?user=${encodeURIComponent(username)}`;
    const secret = process.env.TWITCH_EVENTSUB_SECRET;
    if (!secret) {
      return NextResponse.json(
        { error: "缺少 TWITCH_EVENTSUB_SECRET，webhook 會拒絕所有請求，訂閱有意義" },
        { status: 400 }
      );
    }

    if (!/^https:\/\//i.test(callback)) {
      return NextResponse.json(
        { error: `EventSub 只接受 https callback，目前為 ${callback}` },
        { status: 400 }
      );
    }

    const result = await subscribeEvents(conn.channelId, callback, secret);
    return NextResponse.json({ callback, ...result });
  } catch (e) {
    console.error("POST /api/v1/eventsub error:", e);
    return NextResponse.json({ error: "Failed to manage EventSub subscriptions" }, { status: 500 });
  }
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
