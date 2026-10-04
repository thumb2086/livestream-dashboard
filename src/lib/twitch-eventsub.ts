/**
 * Twitch EventSub subscription management.
 *
 * The webhook route already receives events, but nothing ever registers the
 * subscriptions — Twitch only delivers what you explicitly ask for, so without
 * this the follow/sub/cheer/raid alerts stay silent until someone creates the
 * subscriptions by hand.
 */

const ID_URL = "https://id.twitch.tv/oauth2/token";
const API = "https://api.twitch.tv/helix";

/**
 * The events the overlay alerts render, with the version and condition each
 * needs. Follow and subscription-gift require the broadcaster to also be listed
 * as a moderator (v2 asks for it explicitly).
 */
export const EVENTSUB_TYPES = [
  { type: "channel.follow", version: "2", needsModerator: true },
  { type: "channel.subscribe", version: "1", needsModerator: false },
  { type: "channel.subscription.gift", version: "1", needsModerator: false },
  { type: "channel.cheer", version: "1", needsModerator: false },
  { type: "channel.raid", version: "1", needsModerator: false },
] as const;

export type EventsubResult = {
  created: string[];
  alreadyExists: string[];
  failed: { type: string; status: number; message: string }[];
};

/** An app access token, used for both listing and creating subscriptions. */
export async function getAppAccessToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(`${ID_URL}?client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`, {
    method: "POST",
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  return data.access_token ?? null;
}

function headers(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Client-Id": process.env.TWITCH_CLIENT_ID ?? "",
    "Content-Type": "application/json",
  };
}

/** Subscriptions already registered for this broadcaster. */
export async function listSubscriptions(broadcasterId: string, token: string) {
  const q = new URLSearchParams();
  for (const e of EVENTSUB_TYPES) q.append("type", `${e.type}:${e.version}`);
  q.append("user_id", broadcasterId);

  const res = await fetch(`${API}/eventsub/subscriptions?${q}`, { headers: headers(token) });
  if (!res.ok) return { ok: false as const, status: res.status, existing: [] as { type: string; version: string }[] };
  const data: any = await res.json();
  return {
    ok: true as const,
    existing: (data.subscriptions ?? []).map((s: any) => ({ type: s.type, version: s.version })),
  };
}

/**
 * Registers the webhook subscriptions for a broadcaster.
 *
 * `callbackUrl` must be a public HTTPS endpoint that Twitch can reach, and the
 * `secret` must match what the webhook route verifies with — EventSub signs its
 * deliveries with an HMAC, which is the only thing standing between a forged
 * alert and a fake raid on screen.
 */
export async function subscribeEvents(
  broadcasterUserId: string,
  callbackUrl: string,
  secret: string
): Promise<EventsubResult> {
  const out: EventsubResult = { created: [], alreadyExists: [], failed: [] };

  const token = await getAppAccessToken();
  if (!token) {
    out.failed.push({ type: "*", status: 0, message: "缺少 TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET" });
    return out;
  }

  const existing = await listSubscriptions(broadcasterUserId, token);
  const have = new Set((existing.ok ? existing.existing : []).map((e) => `${e.type}:${e.version}`));

  for (const e of EVENTSUB_TYPES) {
    if (have.has(`${e.type}:${e.version}`)) {
      out.alreadyExists.push(`${e.type}:${e.version}`);
      continue;
    }

    const condition: Record<string, string> = { broadcaster_user_id: broadcasterUserId };
    if (e.needsModerator) condition.moderator_user_id = broadcasterUserId;

    const res = await fetch(`${API}/eventsub/subscriptions`, {
      method: "POST",
      headers: headers(token),
      body: JSON.stringify({
        type: e.type,
        version: e.version,
        condition,
        transport: { method: "webhook", callback: callbackUrl, secret },
      }),
    });

    if (res.ok || res.status === 202) out.created.push(`${e.type}:${e.version}`);
    else if (res.status === 400) {
      // 400 here usually means "already subscribed"; do not treat it as fatal.
      const body = await res.text().catch(() => "");
      if (/already exists|already subscribed/i.test(body)) out.alreadyExists.push(`${e.type}:${e.version}`);
      else out.failed.push({ type: `${e.type}:${e.version}`, status: res.status, message: body.slice(0, 160) });
    } else {
      out.failed.push({ type: `${e.type}:${e.version}`, status: res.status, message: (await res.text().catch(() => "")).slice(0, 160) });
    }
  }

  return out;
}

export async function deleteAllSubscriptions(broadcasterUserId: string): Promise<number> {
  const token = await getAppAccessToken();
  if (!token) return 0;

  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const q = new URLSearchParams();
    if (cursor) q.set("after", cursor);
    const res = await fetch(`${API}/eventsub/subscriptions?${q}`, { headers: headers(token) });
    if (!res.ok) break;
    const data: any = await res.json();
    for (const s of data.subscriptions ?? []) {
      if (s.status === "websocket_disconnected" || s.transport?.method === "webhook") ids.push(s.id);
    }
    cursor = data.pagination?.cursor ?? null;
  } while (cursor && ids.length < 200);

  let removed = 0;
  for (const id of ids) {
    const res = await fetch(`${API}/eventsub/subscriptions?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: headers(token),
    });
    if (res.ok || res.status === 204) removed++;
  }
  return removed;
}
