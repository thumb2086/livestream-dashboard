import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
//
// ★ 這條順帶修掉一個繼承的 race condition：
//   報名的 capacity 檢查（count → insert）是兩條語句，
//   兩個並發報名都會通過檢查而超額。
//   現在是單一條件式 INSERT —— 檢查與插入原子，資料庫保證不超額。
//   見 lib/meetups-http.ts 檔頭。
//
// ★ 重複報名原本靠 Prisma 的 P2002 例外轉 409，
//   現在靠 RETURNING + 二次查詢分出「滿了」與「重複」——
//   呼叫端能給出正確的錯誤訊息，而不是同一個 409。
import {
  listMeetups, createMeetup, updateMeetup, deleteMeetup,
  registerForMeetup, removeRegistration,
} from "@/lib/meetups-http";
import { queryOne } from "@/lib/db-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const STATUSES = new Set(["draft", "open", "closed", "completed"]);

async function load(userId: string) {
  return { meetups: await listMeetups(userId) };
}

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    return NextResponse.json(await load(user.id));
  } catch (e) {
    console.error("GET /api/v1/meetups error:", e);
    return NextResponse.json({ error: "Failed to fetch meetups" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "add" || body._meta === "update") {
      const title = str(body.title, 120);
      const startsAt = new Date(body.startsAt);
      if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
      if (isNaN(startsAt.getTime())) return NextResponse.json({ error: "invalid startsAt" }, { status: 400 });

      const status = STATUSES.has(body.status) ? body.status : "open";
      const data = {
        title,
        description: str(body.description, 1000),
        location: str(body.location, 200),
        startsAt: startsAt.toISOString(),
        endsAt: body.endsAt ? new Date(body.endsAt).toISOString() : null,
        capacity: Math.max(0, Number(body.capacity) || 0),
        price: Math.max(0, Number(body.price) || 0),
        status,
      };
      if (body._meta === "add") {
        await createMeetup(user.id, data);
      } else {
        await updateMeetup(str(body.id, 40), user.id, data);
      }
    } else if (body._meta === "delete") {
      await deleteMeetup(str(body.id, 40), user.id);
    } else if (body._meta === "setStatus") {
      if (!STATUSES.has(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      await updateMeetup(str(body.id, 40), user.id, { status: body.status });
    } else if (body._meta === "removeRegistration") {
      await removeRegistration(str(body.id, 40), user.id);
    } else if (body._meta === "addRegistration") {
      const name = str(body.name, 60);
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      const meetupId = str(body.meetupId, 40);
      // 先確認這個聚會屬於當前用戶（所有權檢查）
      const owned = await queryOne<{ id: string }>(
        'SELECT "id" FROM "Meetup" WHERE "id" = $1 AND "userId" = $2 LIMIT 1',
        [meetupId, user.id],
      );
      if (!owned) return NextResponse.json({ error: "meetup not found" }, { status: 404 });
      const result = await registerForMeetup(meetupId, user.id, name);
      if (!result.ok) {
        const status = result.reason === 'full' ? 409 : 409;
        return NextResponse.json({ error: result.reason === 'full' ? "名額已滿" : "重複的報名" }, { status });
      }
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(await load(user.id));
  } catch (e: any) {
    // Prisma 的 P2002 不會再出現（raw SQL 不拋那個 code），但保留一行方便 diff
    console.error("POST /api/v1/meetups error:", e);
    return NextResponse.json({ error: "Failed to update meetups" }, { status: 500 });
  }
}