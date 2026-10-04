import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { advanceReplay } from "@/lib/replay-job";
import { recordUsage } from "@/lib/usage";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const STATUSES = new Set(["queued", "running", "completed", "failed"]);

async function load(userId: string) {
  const jobs = await (prisma as any).replayJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { segments: { orderBy: { startSec: "asc" } } },
  });
  return { jobs };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("GET /api/v1/replay-jobs error:", e);
    return NextResponse.json({ error: "Failed to fetch replay jobs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "create") {
      const title = str(body.title, 120);
      const replayUrl = str(body.replayUrl, 500);
      if (!title || !replayUrl) {
        return NextResponse.json({ error: "title and replayUrl are required" }, { status: 400 });
      }
      if (!/^https?:\/\/.+/i.test(replayUrl)) {
        return NextResponse.json({ error: "replayUrl must be an http(s) URL" }, { status: 400 });
      }
      const running = await (prisma as any).replayJob.count({
        where: { userId: user.id, status: { in: ["queued", "running"] } },
      });
      if (running >= 3) {
        return NextResponse.json({ error: "同時最多 3 個分析工作" }, { status: 429 });
      }
      await (prisma as any).replayJob.create({
        data: {
          userId: user.id,
          title,
          replayUrl,
          language: str(body.language, 8) || "zh",
          status: "queued",
          progress: 0,
        },
      });
    } else if (body._meta === "advance") {
      // Runs the real pipeline one bounded step per call: fetch + decode the
      // audio, then transcribe and score it chunk by chunk. Progress reflects
      // work actually done -- the previous version only incremented a counter
      // and invented placeholder segments with made-up scores.
      const job = await (prisma as any).replayJob.findFirst({
        where: { id: str(body.id, 40), userId: user.id },
      });
      if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
      if (job.status === "completed") return NextResponse.json(await load(user.id));

      try {
        const result = await advanceReplay(job);
        await (prisma as any).replayJob.update({
          where: { id: job.id },
          data: {
            progress: result.progress,
            status: result.status,
            completedAt: result.status === "completed" ? new Date() : null,
            summary: result.summary,
          },
        });

        // Meter the step that actually ran. advanceReplay transcribes at most
        // SECONDS_PER_STEP (60s) of audio per call, so one step is one minute.
        // Recorded only after a successful advance, so a failed step is not billed
        // for work that did not finish.
        await recordUsage(user.id, "replay_minutes", 1, "replay analysis " + job.title.slice(0, 100));
      } catch (e: any) {
        await (prisma as any).replayJob.update({
          where: { id: job.id },
          data: { status: "failed", summary: String(e?.message || e).slice(0, 300) },
        });
        return NextResponse.json({ error: e?.message || "分析失敗" }, { status: 500 });
      }
    } else if (body._meta === "delete") {
      await (prisma as any).replayJob.deleteMany({ where: { id: str(body.id, 40), userId: user.id } });
    } else if (body._meta === "setStatus") {
      if (!STATUSES.has(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      await (prisma as any).replayJob.updateMany({
        where: { id: str(body.id, 40), userId: user.id },
        data: { status: body.status },
      });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("POST /api/v1/replay-jobs error:", e);
    return NextResponse.json({ error: "Failed to update replay jobs" }, { status: 500 });
  }
}
