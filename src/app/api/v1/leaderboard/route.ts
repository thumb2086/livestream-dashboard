import { NextResponse } from "next/server";
import { query } from "@/lib/db-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

export async function GET(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    const { searchParams } = new URL(req.url);
    const range = searchParams.get("range") === "week" ? "week" : searchParams.get("range") === "all" ? "all" : "month";

    const now = new Date();
    const since =
      range === "week"
        ? new Date(now.getTime() - 7 * 24 * 3600 * 1000)
        : range === "month"
          ? new Date(now.getTime() - 30 * 24 * 3600 * 1000)
          : new Date(0);

    const donations = await query<{ donorAddress: string; donorName: string; amount: number }>(
      `SELECT "donorAddress", "donorName", "amount"
         FROM "ZixiDonation"
        WHERE "userId" = $1 AND "status" = 'confirmed' AND "createdAt" >= $2
        ORDER BY "createdAt" DESC
        LIMIT 500`,
      [user.id, since.toISOString()],
    );

    const totals = new Map<string, { name: string; amount: number; count: number }>();
    for (const d of donations) {
      const key = d.donorAddress || d.donorName || "anonymous";
      const name = d.donorName || `${d.donorAddress.slice(0, 6)}...${d.donorAddress.slice(-4)}`;
      const prev = totals.get(key) || { name, amount: 0, count: 0 };
      prev.amount += d.amount;
      prev.count += 1;
      if (d.donorName) prev.name = d.donorName;
      totals.set(key, prev);
    }

    const ranking = [...totals.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10)
      .map((r, i) => ({ rank: i + 1, ...r }));

    return NextResponse.json({ range, ranking });
  } catch (e) {
    console.error("GET /api/v1/leaderboard error:", e);
    return NextResponse.json({ error: "Failed to fetch leaderboard" }, { status: 500 });
  }
}
