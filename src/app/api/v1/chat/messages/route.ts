import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body.message || !body.userName || !body.platform) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    let userId: string | null = null;

    // Support both: worker (apiKey) and authenticated user (session)
    if (body.apiKey === process.env.CHAT_WORKER_KEY && body.channelName) {
      const conn = await prisma.platformConnection.findFirst({
        where: { platform: body.platform, channelName: body.channelName },
      });
      if (conn) userId = conn.userId;
    } else {
      const user = await getOrCreateUser(getSessionId(req));
      if (user) userId = user.id;
    }

    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Handle clear command
    if (body.message === "__clear__") {
      await prisma.chatMessage.deleteMany({ where: { userId } });
      return NextResponse.json({ ok: true, cleared: true });
    }

    await prisma.chatMessage.create({
      data: {
        userId,
        platform: body.platform,
        userName: body.userName,
        message: body.message,
        avatarUrl: body.avatarUrl || "",
        isOwner: body.isOwner || false,
      },
    });
    return NextResponse.json({ ok: true });
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
    const where: any = { userId: user.id };
    if (since) where.createdAt = { gt: new Date(since) };
    const messages = await prisma.chatMessage.findMany({
      where, orderBy: { createdAt: "asc" }, take: 100,
    });

    // Try to fetch YouTube live chat if connected
    const ytConn = await prisma.platformConnection.findUnique({
      where: { userId_platform: { userId: user.id, platform: "youtube" } },
    });

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
                  await prisma.chatMessage.create({
                    data: {
                      userId: user.id,
                      platform: "youtube",
                      userName: item.authorDetails.displayName,
                      message: item.snippet.displayMessage,
                      avatarUrl: item.authorDetails.profileImageUrl || "",
                      isOwner: item.authorDetails.isChatOwner || false,
                      createdAt: pub,
                    },
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
