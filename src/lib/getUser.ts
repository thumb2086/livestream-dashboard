import { prisma } from "./prisma";

export async function getOrCreateUser(sessionId?: string) {
  if (!sessionId) return null;
  // One round trip, not two. This sits on the caption hot path where every
  // extra query costs ~400ms against a remote database, and it was measurable:
  // the transcription endpoint went from a 491ms upstream call to 2.5s wall.
  const session = await prisma.session.findUnique({
    where: { id: sessionId },
    include: { user: true },
  });
  return session?.user ?? null;
}

export function getSessionId(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/sf_session=([^;]+)/);
  return match?.[1];
}

export function unauthorized() {
  return Response.json({ error: "請先登入" }, { status: 401 });
}
