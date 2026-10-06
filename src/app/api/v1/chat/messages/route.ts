import { timingSafeEqual as timingSafeEqualBuf } from "node:crypto";
import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import {
  findConnectionByPlatformAndChannel, clearChatMessages, createChatMessage,
  listChatMessages,
} from "@/lib/chat-messages-http";
import { findPlatformConnection } from "@/lib/platform-live-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { runLiveCommand } from "@/lib/live-commands";

/** Constant-time compare for shared secrets. Length is checked by the caller. */
function timingSafeEqual(a: string, b: string): boolean {
  return timingSafeEqualBuf(Buffer.from(a), Buffer.from(b));
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.message || !body.userName || !body.platform) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    let userId: string | null = null;

    // Support both: worker (apiKey) and authenticated user (session).
    const workerKey = process.env.CHAT_WORKER_KEY;
    const presented = typeof body.apiKey === "string" ? body.apiKey : "";
    // Fail closed. The previous test was `body.apiKey === process.env.CHAT_WORKER_KEY`,
    // which is `undefined === undefined` -> true whenever the variable is unset and the
    // body simply omits apiKey. That let any caller who knew a channel name post as that
    // creator, and `__clear__` then wiped their chat history.
    const workerAuthed =
      Boolean(workerKey) &&
      presented.length === workerKey!.length &&
      timingSafeEqual(presented, workerKey!);

    if (workerAuthed && body.channelName) {
      const conn = await findConnectionByPlatformAndChannel(body.platform, body.channelName);
      if (conn) userId = conn.userId;
    } else {
      const user = await getOrCreateUser(getSessionId(req));
      if (user) userId = user.id;
    }

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Destructive, so session-only: the worker key is a shared integration secret,
    // not permission to erase someone's chat.
    //
    // A bare `__clear__` used to mean deleteMany({ userId }) -- which also
    // removed every genuine message ingested from Twitch/YouTube by
    // /api/v1/chat/messages. Erasing real history needs to be asked for
    // explicitly; without it the delete is scoped to the simulated names.
    if (body.message === "__clear__") {
      if (workerAuthed) {
        return NextResponse.json({ error: "clear is not available to the worker" }, { status: 403 });
      }
      const wipeAll = body.confirm === "all";
      const names = Array.isArray(body.names)
        ? body.names.filter((n: unknown): n is string => typeof n === "string").slice(0, 50)
        : [];
      if (!wipeAll && names.length === 0) {
        return NextResponse.json(
          { error: "refusing to clear: pass `names` to clear simulated rows, or confirm:\"all\" to erase real chat" },
          { status: 400 }
        );
      }
      const cleared = await clearChatMessages(userId, wipeAll ? undefined : names);
      return NextResponse.json({ ok: true, cleared, scope: wipeAll ? "all" : "names" });
    }

    await createChatMessage({
      userId,
      platform: body.platform,
      userName: body.userName,
      message: body.message,
      avatarUrl: body.avatarUrl || "",
      isOwner: body.isOwner || false,
    });

    // Every source funnels through this handler -- the chat worker and the
    // YouTube pull both post here -- so this is the one place a live command can
    // be evaluated. Until now nothing read LiveCommand at all.
    const fired = await runLiveCommand(userId, {
      platform: body.platform,
      message: body.message,
      isOwner: body.isOwner === true,
    });

    return NextResponse.json({ ok: true, command: fired?.trigger ?? null });
  } catch (e) {
    console.error("POST chat message error:", e);
    return NextResponse.json({ error: "Failed to save message" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const since = searchParams.get("since");

    // Fetch stored messages
    const messages = await listChatMessages(user.id, since || undefined, 100);

    // Try to fetch YouTube live chat if connected
    const ytConn = await findPlatformConnection(user.id, "youtube");

    if (ytConn?.connected && ytConn?.accessToken) {
      try {
        // Get active broadcast
        const bcRes = await fetch("https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&mine=true&broadcastStatus=active", {
          headers: { Authorization: `Bearer ${ytConn.accessToken}` },
        });
        if (bcRes.ok) {
          const bcData: any = await bcRes.json();
          const broadcast = bcData.items?.[0];
          if (broadcast?.snippet?.liveChatId) {
            const chatId = broadcast.snippet.liveChatId;
            const chatRes = await fetch(
              `https://www.googleapis.com/youtube/v3/liveChat/messages?liveChatId=${chatId}&part=snippet,authorDetails&maxResults=200`,
              { headers: { Authorization: `Bearer ${ytConn.accessToken}` } },
            );
            if (chatRes.ok) {
              const chatData: any = await chatRes.json();
              const lastMsgTime = messages.length > 0 ? messages[messages.length - 1].createdAt : new Date(0);
              for (const item of chatData.items || []) {
                const pub = new Date(item.snippet.publishedAt);
                if (pub > lastMsgTime) {
                  await createChatMessage({
                      userId: user.id,
                      platform: "youtube",
                      userName: item.authorDetails.displayName,
                      message: item.snippet.displayMessage,
                      avatarUrl: item.authorDetails.profileImageUrl || "",
                      isOwner: item.authorDetails.isChatOwner || false,
                      createdAt: pub,
                    }).catch(() => {});
                  messages.push({
                    id: "",
                    userId: user.id,
                    platform: "youtube",
                    userName: item.authorDetails.displayName,
                    message: item.snippet.displayMessage,
                    avatarUrl: item.authorDetails.profileImageUrl || "",
                    isOwner: item.authorDetails.isChatOwner || false,
                    createdAt: pub,
                  } as any);
                }
              }
            }
          }
        }
      } catch (e) {
        console.error("YouTube live chat fetch error:", e);
      }
    }

    return NextResponse.json({ messages: messages.slice(-100) });
  } catch (e) {
    console.error("GET chat messages error:", e);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
