import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const BASESCAN_API = "https://api-sepolia.basescan.org/api";
const ZXC_CONTRACT = "0xe3d9af5f15857cb01e0614fa281fcc3256f62050".toLowerCase();
const YJC_CONTRACT = "0x82d6adb17d58820324d86b378775350d03a071ae".toLowerCase();
const KNOWN_TOKENS: Record<string, string> = { [ZXC_CONTRACT]: "ZXC", [YJC_CONTRACT]: "YJC" };

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    if (!user.zixiWallet) {
      return NextResponse.json({ error: "No ZIXI wallet configured" }, { status: 400 });
    }

    const apiKey = process.env.BASESCAN_API_KEY || "";
    const url = `${BASESCAN_API}?module=account&action=tokentx&address=${user.zixiWallet}&sort=desc${apiKey ? `&apikey=${apiKey}` : ""}`;

    const res = await fetch(url);
    if (!res.ok) return NextResponse.json({ error: "BaseScan API failed" }, { status: 502 });

    const data: any = await res.json();
    if (data.status !== "1") return NextResponse.json({ result: [], message: data.message });

    // Get last recorded tx hash to avoid duplicates
    const lastDonation = await prisma.zixiDonation.findFirst({
      where: { userId: user.id, txHash: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    const seenHashes = new Set<string>();
    if (lastDonation?.txHash) seenHashes.add(lastDonation.txHash);

    const newDonations: any[] = [];

    for (const tx of data.result || []) {
      const contract = (tx.contractAddress || "").toLowerCase();
      const token = KNOWN_TOKENS[contract];
      if (!token) continue; // Skip unknown tokens

      const to = (tx.to || "").toLowerCase();
      if (to !== user.zixiWallet.toLowerCase()) continue; // Not incoming

      if (seenHashes.has(tx.hash)) continue;
      seenHashes.add(tx.hash);

      // Convert from wei (18 decimals) to human readable
      const amount = parseFloat(tx.value) / 1e18;
      if (amount <= 0) continue;

      const donorAddr = tx.from || "";
      const existing = await prisma.zixiDonation.findFirst({
        where: { txHash: tx.hash, userId: user.id },
      });
      if (existing) continue;

      const donation = await prisma.zixiDonation.create({
        data: {
          userId: user.id,
          donorAddress: donorAddr,
          amount,
          token,
          txHash: tx.hash,
          status: "confirmed",
        },
      });
      newDonations.push(donation);
    }

    return NextResponse.json({ checked: true, found: newDonations.length, donations: newDonations });
  } catch (e) {
    console.error("ZIXI check-tx error:", e);
    return NextResponse.json({ error: "Failed to check transactions" }, { status: 500 });
  }
}
