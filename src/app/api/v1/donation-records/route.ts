import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

/**
 * Unified donation ledger.
 * Aggregates ZIXI on-chain donations (ZixiDonation) with card/wallet
 * donations recorded through DonationRecord, newest first.
 */
export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();

    const url = new URL(req.url);
    const since = url.searchParams.get("since");
    const source = url.searchParams.get("source");
    const limit = Math.min(Number(url.searchParams.get("limit")) || 200, 500);

    const sinceDate = since ? new Date(since) : null;
    const invalid = sinceDate && isNaN(sinceDate.getTime());
    if (invalid) return NextResponse.json({ error: "invalid since" }, { status: 400 });

    const wantZixi = !source || source === "zixi";
    const wantCard = !source || source === "card";

    const [zixi, card] = await Promise.all([
      wantZixi
        ? (prisma as any).zixiDonation.findMany({
            where: sinceDate ? { userId: user.id, createdAt: { gte: sinceDate } } : { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: limit,
          })
        : Promise.resolve([]),
      wantCard
        ? (prisma as any).donationRecord.findMany({
            where: sinceDate ? { userId: user.id, createdAt: { gte: sinceDate } } : { userId: user.id },
            orderBy: { createdAt: "desc" },
            take: limit,
          })
        : Promise.resolve([]),
    ]);

    const records = [
      ...zixi.map((d: any) => ({
        id: `zixi-${d.id}`,
        source: "zixi",
        sourceLabel: "ZIXI",
        donorName: d.donorName || d.donorAddress?.slice(0, 6) || "匿名",
        amount: d.amount,
        currency: d.token || "ZXC",
        message: d.message,
        status: d.status,
        tradeNo: d.txHash || "",
        createdAt: d.createdAt,
      })),
      ...card.map((d: any) => ({
        id: `card-${d.id}`,
        source: d.source,
        sourceLabel: { ecpay: "綠界", opay: "歐付寶", paypal: "PayPal" }[d.source as string] ?? d.source,
        donorName: d.donorName || "匿名",
        amount: d.amount,
        currency: d.currency,
        message: d.message,
        status: d.status,
        tradeNo: d.tradeNo,
        createdAt: d.createdAt,
      })),
    ].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    return NextResponse.json({ records });
  } catch (e) {
    console.error("GET /api/v1/donation-records error:", e);
    return NextResponse.json({ error: "Failed to fetch donation records" }, { status: 500 });
  }
}