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
      // Totals are server-computed via simulate/confirmed donations only.
      // Accepting totalReceived/donorCount from client allows stats forgery.
      await prisma.user.update({
        where: { id: user.id },
        data: { donationMinAmount: body.minAmount ?? user.donationMinAmount, donationSound: body.soundEffect ?? user.donationSound },
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

      // Opt-in. This used to increment User.donationTotal / donationDonors --
      // the lifetime figures the public page renders as real money received --
      // so clicking a test button permanently inflated a visible financial
      // total. demoMode is the creator explicitly opting in to test rows.
      if (!user.demoMode) {
        return NextResponse.json(
          { error: "\u6a21\u64ec\u6597\u5165\u9700\u8981\u5148\u958b\u555f\u300c\u5c55\u793a\u6a21\u5f0f\u300d\uff0c\u5426\u5247\u6e2c\u8a66\u6703\u5beb\u5165\u516c\u958b\u9801\u986f\u793a\u7684\u6b63\u5f0f\u7d71\u8a08" },
          { status: 403 }
        );
      }

      // Feed the overlays, which read zixiDonation, rather than the money
      // counters. txHash "TEST" marks the row so it can be identified and
      // removed from the donation ledger.
      await prisma.zixiDonation.create({
        data: {
          userId: user.id,
          donorAddress: "0xTEST",
          donorName: "測試贊助者",
          amount,
          token: "TWD",
          message: "這是一筆測試紀錄，可在斗內紀錄中刪除",
          txHash: "TEST",
          status: "confirmed",
        },
      });

      // The goal bar is the thing under test, so it still advances -- bounded by
      // the goal, so it can complete it but never overshoot.
      const goals = await prisma.donationGoal.findMany({ where: { userId: user.id }, orderBy: { sortOrder: "asc" } });
      const incompleteGoal = goals.find((g: { current: number; goal: number }) => g.current < g.goal);
      if (incompleteGoal) {
        await prisma.donationGoal.update({
          where: { id: incompleteGoal.id },
          data: { current: Math.min(incompleteGoal.current + amount, incompleteGoal.goal) },
        });
      }
      return refresh(user.id);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    console.error("POST /api/v1/donations error:", e);
    return NextResponse.json({ error: "Failed to process donations" }, { status: 500 });
  }
}
