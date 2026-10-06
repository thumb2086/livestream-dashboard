import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
// 原本 7 處全是 `(prisma as any)`。
import {
  listCommands, countCommands, createCommand, updateCommand,
  setCommandEnabled, deleteCommand,
} from "@/lib/live-commands-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

function normalizeTrigger(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toLowerCase();
  if (!t.startsWith("!") || t.length < 2 || t.length > 30) return null;
  if (!/^![a-z0-9_]+$/.test(t)) return null;
  return t;
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const commands = await listCommands(user.id);
    return NextResponse.json({ commands });
  } catch (e) {
    console.error("GET /api/v1/commands error:", e);
    return NextResponse.json({ error: "Failed to fetch commands" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "add") {
      const trigger = normalizeTrigger(body.trigger);
      const response = typeof body.response === "string" ? body.response.trim().slice(0, 500) : "";
      if (!trigger || !response) {
        return NextResponse.json({ error: "Invalid command (trigger must be like !help, response required)" }, { status: 400 });
      }
      const count = await countCommands(user.id);
      if (count >= 50) {
        return NextResponse.json({ error: "Too many commands (max 50)" }, { status: 400 });
      }
      await createCommand(user.id, trigger, response, count);
    } else if (body._meta === "update") {
      const trigger = normalizeTrigger(body.trigger);
      const response = typeof body.response === "string" ? body.response.trim().slice(0, 500) : "";
      if (!body.id || !trigger || !response) {
        return NextResponse.json({ error: "Invalid command data" }, { status: 400 });
      }
      await updateCommand(body.id, user.id, trigger, response);
    } else if (body._meta === "toggle") {
      if (typeof body.id !== "string" || typeof body.enabled !== "boolean") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await setCommandEnabled(body.id, user.id, body.enabled);
    } else if (body._meta === "delete") {
      if (typeof body.id !== "string") {
        return NextResponse.json({ error: "Invalid request" }, { status: 400 });
      }
      await deleteCommand(body.id, user.id);
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const commands = await listCommands(user.id);
    return NextResponse.json({ commands });
  } catch (e: any) {
    if (e?.code === "P2002") {
      return NextResponse.json({ error: "Duplicate trigger" }, { status: 409 });
    }
    if (e?.code === "P2021") {
      return NextResponse.json(
        { error: "Table missing — run: npx prisma db push (DB unreachable during dev)" },
        { status: 503 }
      );
    }
    console.error("POST /api/v1/commands error:", e);
    return NextResponse.json({ error: "Failed to update commands" }, { status: 500 });
  }
}
