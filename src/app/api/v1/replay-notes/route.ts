import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import {
  listReplayNotes, countReplayNotes, createReplayNote, updateReplayNote, deleteReplayNote,
} from "@/lib/replay-notes-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const notes = await listReplayNotes(user.id, 100);
    return NextResponse.json({ notes });
  } catch (e) {
    console.error("GET /api/v1/replay-notes error:", e);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "add") {
      const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
      if (!title) return NextResponse.json({ error: "Title required" }, { status: 400 });
      const count = await countReplayNotes(user.id);
      if (count >= 200) return NextResponse.json({ error: "Too many notes (max 200)" }, { status: 400 });
      await createReplayNote(user.id, {
        title,
        sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl.trim().slice(0, 500) : "",
        startsAt: typeof body.startsAt === "string" ? body.startsAt.trim().slice(0, 20) : "",
        endsAt: typeof body.endsAt === "string" ? body.endsAt.trim().slice(0, 20) : "",
        note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : "",
      });
    } else if (body._meta === "update") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      await updateReplayNote(body.id, user.id, {
        title: typeof body.title === "string" ? body.title.trim().slice(0, 120) : undefined,
        sourceUrl: typeof body.sourceUrl === "string" ? body.sourceUrl.trim().slice(0, 500) : undefined,
        startsAt: typeof body.startsAt === "string" ? body.startsAt.trim().slice(0, 20) : undefined,
        endsAt: typeof body.endsAt === "string" ? body.endsAt.trim().slice(0, 20) : undefined,
        note: typeof body.note === "string" ? body.note.trim().slice(0, 500) : undefined,
      });
    } else if (body._meta === "delete") {
      if (typeof body.id !== "string") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      await deleteReplayNote(body.id, user.id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const notes = await listReplayNotes(user.id, 100);
    return NextResponse.json({ notes });
  } catch (e) {
    console.error("POST /api/v1/replay-notes error:", e);
    return NextResponse.json({ error: "Failed to update notes" }, { status: 500 });
  }
}
