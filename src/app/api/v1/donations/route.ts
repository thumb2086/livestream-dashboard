import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const goals = await prisma.donationGoal.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({
      goals, minAmount: user.donationMinAmount, soundEffect: user.donationSound,
      totalReceived: user.donationTotal, donorCount: user.donationDonors,
    });
  } catch (e) {
    console.error("GET /api/v1/donations error:", e);
    return NextResponse.json({ error: "Failed to fetch donations" }, { status: 500 });
  }
}

async function refresh(userId: string) {
  const user = (await prisma.user.findUnique({ where: { id: userId } }))!;
  const goals = await prisma.donationGoal.findMany({ where: { userId }, orderBy: { sortOrder: "asc" } });
  return NextResponse.json({
    goals, minAmount: user.donationMinAmount, soundEffect: user.donationSound,
    totalReceived: user.donationTotal, donorCount: user.donationDonors,
  });
}

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const body = await req.json();

    if (body._meta === "updateUser") {
      await prisma.user.update({
        where: { id: user.id },
        data: { donationMinAmount: body.minAmount ?? user.donationMinAmount, donationSound: body.soundEffect ?? user.donationSound, donationTotal: body.totalReceived ?? user.donationTotal, donationDonors: body.donorCount ?? user.donationDonors },
      });
      return refresh(user.id);
    }

    if (body._meta === "addGoal") {
      if (!body.title || typeof body.title !== "string" || !body.title.trim() || typeof body.goal !== "number" || body.goal <= 0) {
        return NextResponse.json({ error: "Invalid goal data" }, { status: 400 });
      }
      const count = await prisma.donationGoal.count({ where: { userId: user.id } });
      await prisma.donationGoal.create({ data: { userId: user.id, title: body.title.trim(), emoji: body.emoji || "🎯", goal: body.goal, current: 0, sortOrder: count } });
      return refresh(user.id);
    }

    if (body._meta === "deleteGoal") {
      if (!body.id) return NextResponse.json({ error: "Missing goal id" }, { status: 400 });
      await prisma.donationGoal.deleteMany({ where: { id: body.id, userId: user.id } });
      return refresh(user.id);
    }

    if (body._meta === "updateGoal") {
      if (!body.id) return NextResponse.json({ error: "Missing goal id" }, { status: 400 });
      await prisma.donationGoal.updateMany({
        where: { id: body.id, userId: user.id },
        data: { title: body.title, goal: body.goal, emoji: body.emoji, current: body.current },
      });
      return refresh(user.id);
    }

    if (body._meta === "simulate") {
      const amount = Math.max(1, Math.floor(Number(body.amount)) || 0);
      if (amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
      const goals = await prisma.donationGoal.findMany({ where: { userId: user.id }, orderBy: { sortOrder: "asc" } });
      const incompleteGoal = goals.find((g: { current: number; goal: number }) => g.current < g.goal);
      if (incompleteGoal) {
        await prisma.donationGoal.update({
          where: { id: incompleteGoal.id },
          data: { current: Math.min(incompleteGoal.current + amount, incompleteGoal.goal) },
        });
      }
      await prisma.user.update({
        where: { id: user.id },
        data: { donationTotal: { increment: amount }, donationDonors: { increment: 1 } },
      });
      return refresh(user.id);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/v1/donations error:", e);
    return NextResponse.json({ error: "Failed to process donations" }, { status: 500 });
  }
}
