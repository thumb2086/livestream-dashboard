import { NextResponse } from "next/server";
import { query } from "@/lib/db-http";

export async function POST(req: Request) {
  try {
    const cookie = req.headers.get("cookie") || "";
    const match = cookie.match(/sf_session=([^;]+)/);
    if (match?.[1]) {
      await query('DELETE FROM "Session" WHERE "id" = $1', [match[1]]).catch(() => {});
    }
  } catch { /* best effort */ }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("sf_session", "", { maxAge: 0, path: "/" });
  return response;
}
