import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";

const ZIXI_API = process.env.ZIXI_API_URL || "https://zixi-casino-api.onrender.com/api/v1";
const BASESCAN_API = "https://api-sepolia.basescan.org/api";
const ZXC_CONTRACT = "0xe3d9af5f15857cb01e0614fa281fcc3256f62050".toLowerCase();
const YJC_CONTRACT = "0x82d6adb17d58820324d86b378775350d03a071ae".toLowerCase();

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    if (!user.zixiWallet) return NextResponse.json({ error: "No ZIXI wallet configured" }, { status: 400 });

    const newDonations: any[] = [];
    const lastDonation = await prisma.zixiDonation.findFirst({
      where: { userId: user.id, txHash: { not: null } },
      orderBy: { createdAt: "desc" },
    });
    const seenHashes = new Set(lastDonation?.txHash ? [lastDonation.txHash] : []);

    // 1. Try ZIXI API (internal custody transactions)
    try {
      const zixiRes = await fetch(`${ZIXI_API}/transactions/public?limit=50`);
      if (zixiRes.ok) {
        const zixiData: any = await zixiRes.json();
        for (const tx of zixiData.data?.items || []) {
          if (tx.type !== "transfer") continue;
          const to = (tx.to || "").toLowerCase();
          if (to !== user.zixiWallet.toLowerCase()) continue;
          const hash = tx.txHash || tx.id;
          if (seenHashes.has(hash)) continue;
          seenHashes.add(hash);
          const donation = await prisma.zixiDonation.create({
            data: { userId: user.id, donorAddress: tx.from || "", amount: Math.abs(tx.amount || 0), token: tx.token === "YJC" ? "YJC" : "ZXC", txHash: hash, status: "confirmed" },
          });
          newDonations.push(donation);
        }
      }
    } catch { /* ZIXI API may be unavailable */ }

    // 2. Try BaseScan (on-chain token transfers, for external wallet sends)
    if (newDonations.length === 0) {
      try {
        const apiKey = process.env.BASESCAN_API_KEY || "";
        const url = `${BASESCAN_API}?module=account&action=tokentx&address=${user.zixiWallet}&sort=desc${apiKey ? `&apikey=${apiKey}` : ""}`;
        const res = await fetch(url);
        if (res.ok) {
          const data: any = await res.json();
          if (data.status === "1") {
            for (const tx of data.result || []) {
              const contract = (tx.contractAddress || "").toLowerCase();
              const token = contract === ZXC_CONTRACT ? "ZXC" : contract === YJC_CONTRACT ? "YJC" : null;
              if (!token) continue;
              if ((tx.to || "").toLowerCase() !== user.zixiWallet.toLowerCase()) continue;
              if (seenHashes.has(tx.hash)) continue;
              const amount = parseFloat(tx.value) / 1e18;
              if (amount <= 0) continue;
              await prisma.zixiDonation.create({
                data: { userId: user.id, donorAddress: tx.from || "", amount, token, txHash: tx.hash, status: "confirmed" },
              });
              newDonations.push({ from: tx.from, amount, token });
            }
          }
        }
      } catch { /* BaseScan may be unavailable */ }
    }

    return NextResponse.json({ checked: true, found: newDonations.length, donations: newDonations });
  } catch (e) {
    console.error("ZIXI check-tx error:", e);
    return NextResponse.json({ error: "Failed to check transactions" }, { status: 500 });
  }
}
