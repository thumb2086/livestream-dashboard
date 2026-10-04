import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const STATUSES = new Set(["draft", "open", "closed", "completed"]);

async function load(userId: string) {
  const meetups = await (prisma as any).meetup.findMany({
    where: { userId },
    orderBy: { startsAt: "desc" },
    include: { registrations: { select: { id: true, name: true, createdAt: true } } },
  });
  return { meetups };
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
        startsAt,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        capacity: Math.max(0, Number(body.capacity) || 0),
        price: Math.max(0, Number(body.price) || 0),
        status,
      };
      if (body._meta === "add") {
        await (prisma as any).meetup.create({ data: { ...data, userId: user.id } });
      } else {
        await (prisma as any).meetup.updateMany({ where: { id: str(body.id, 40), userId: user.id }, data });
      }
    } else if (body._meta === "delete") {
      await (prisma as any).meetup.deleteMany({ where: { id: str(body.id, 40), userId: user.id } });
    } else if (body._meta === "setStatus") {
      if (!STATUSES.has(body.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 });
      await (prisma as any).meetup.updateMany({
        where: { id: str(body.id, 40), userId: user.id },
        data: { status: body.status },
      });
    } else if (body._meta === "removeRegistration") {
      await (prisma as any).meetupRegistration.deleteMany({
        where: { id: str(body.id, 40), meetup: { userId: user.id } },
      });
    } else if (body._meta === "addRegistration") {
      const name = str(body.name, 60);
      if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
      const meetup = await (prisma as any).meetup.findFirst({
        where: { id: str(body.meetupId, 40), userId: user.id },
      });
      if (!meetup) return NextResponse.json({ error: "meetup not found" }, { status: 404 });
      if (meetup.capacity > 0) {
        const count = await (prisma as any).meetupRegistration.count({ where: { meetupId: meetup.id } });
        if (count >= meetup.capacity) {
          return NextResponse.json({ error: "名額已滿" }, { status: 409 });
        }
      }
      await (prisma as any).meetupRegistration.create({ data: { meetupId: meetup.id, name } });
    } else {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json(await load(user.id));
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "重複的報名" }, { status: 409 });
    console.error("POST /api/v1/meetups error:", e);
    return NextResponse.json({ error: "Failed to update meetups" }, { status: 500 });
  }
}