import { prisma } from "@/lib/prisma";
import { addClient } from "@/lib/caption-sse";
import { getSubtitleSettings } from "@/lib/subtitle-config";

export const dynamic = "force-dynamic";
export const preferredRegion = "auto";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return new Response("Missing token", { status: 400 });

  const source = await prisma.oBSSource.findFirst({
    where: { token, sourceKey: "captions" },
  });
  if (!source || !source.enabled) return new Response("Forbidden", { status: 403 });

  const userId = source.userId;
  const config = await getSubtitleSettings(userId);
  if (!config.enabled) return new Response("Disabled", { status: 403 });

  const stream = new ReadableStream({
    start(controller) {
      const cleanup = addClient(userId, controller);
      req.signal.addEventListener("abort", cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
