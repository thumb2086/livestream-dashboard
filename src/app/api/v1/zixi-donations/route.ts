import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const ZIXI_API = "https://zixi-casino-api.onrender.com/api/v1";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { username, donorAddress, amount, token, message } = body;

    if (!username || !donorAddress || !amount || amount <= 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.zixiWallet) {
      return NextResponse.json({ error: "Creator not found or no wallet configured" }, { status: 404 });
    }

    // Record the donation (pending until verified on-chain)
    const donation = await prisma.zixiDonation.create({
      data: {
        userId: user.id,
        donorAddress,
        amount: Number(amount),
        token: token || "ZXC",
        message: message || "",
        status: "pending",
      },
    });

    return NextResponse.json({
      ok: true,
      donationId: donation.id,
      recipientAddress: user.zixiWallet,
      instructions: `請從你的 ZIXI 錢包發送 ${amount} ${token || "ZXC"} 到 ${user.zixiWallet}`,
    });
  } catch (e) {
    console.error("POST /api/v1/zixi-donations error:", e);
    return NextResponse.json({ error: "Failed to create donation" }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const token = searchParams.get("token");

    let userId: string | null = null;

    // Support both: authenticated user (session) and OBS source (token)
    if (token) {
      const source = await prisma.oBSSource.findFirst({ where: { token, sourceKey: "alerts" } });
      if (source) userId = source.userId;
    }
    if (!userId) {
      const user = await getOrCreateUser(getSessionId(req));
      if (!user) return unauthorized();
      userId = user.id;
    }

    const where: any = { userId };
    if (status) where.status = status;

    const donations = await prisma.zixiDonation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ donations });
  } catch (e) {
    console.error("GET /api/v1/zixi-donations error:", e);
    return NextResponse.json({ error: "Failed to fetch donations" }, { status: 500 });
  }
}
