import { NextResponse } from "next/server";
import { getOrCreateUser, getSessionId } from "@/lib/getUser";

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return NextResponse.json({ error: '請先登入' }, { status: 401 });
    return NextResponse.json({ ok: true, userId: user.id });
  } catch (e) {
    console.error("POST /api/v1/seed error:", e);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
