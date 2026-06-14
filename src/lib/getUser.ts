import { prisma } from "./prisma";

export async function getOrCreateUser(sessionId?: string) {
  if (sessionId) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (session) {
      const user = await prisma.user.findUnique({ where: { id: session.userId } });
      if (user) return user;
    }
  }
  return null;
}

export function getSessionId(request: Request): string | undefined {
  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/sf_session=([^;]+)/);
  return match?.[1];
}

export function unauthorized() {
  return Response.json({ error: "請先登入" }, { status: 401 });
}
