import { NextResponse } from "next/server";
// 2026-10-06：從 Prisma 改成 Neon HTTP（Workers 相容）。
import { getLastZixiDonationWithHash, createZixiDonation } from "@/lib/zixi-donations-http";
import { getOrCreateUser, getSessionId, unauthorized } from "@/lib/getUser";
import { zixiApiBase } from "@/lib/zixi-endpoints";

// Host comes from the single source of truth rather than a literal here, so
// there is exactly one place a ZIXI endpoint can be configured.
const ZIXI_API = zixiApiBase();

// Etherscan on **Ethereum Sepolia**, not BaseScan. The ZXC/YJC contracts live on
// Ethereum Sepolia (chainId 11155111 -- see zixi-earth/src/chain.js:1 and
// chain-settle.js:59, DEFAULT_CHAIN_ID). api-sepolia.basescan.org queries Base
// Sepolia, a different chain, so this could never have seen a single transfer.
// The empty catch that used to sit below is why that stayed invisible: the page
// just reported 沒有新交易.
const ETHERSCAN_API = process.env.ETHERSCAN_API_URL || "https://api-sepolia.etherscan.io/api";
const ZXC_CONTRACT = "0xe3d9af5f15857cb01e0614fa281fcc3256f62050".toLowerCase();
const YJC_CONTRACT = "0x82d6adb17d58820324d86b378775350d03a071ae".toLowerCase();

export async function POST(req: Request) {
  try {
    const user = await getOrCreateUser(getSessionId(req));
    if (!user) return unauthorized();
    if (!user.zixiWallet) return NextResponse.json({ error: "No ZIXI wallet configured" }, { status: 400 });

    const newDonations: any[] = [];
    const lastDonation = await getLastZixiDonationWithHash(user.id);
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
          const donation = await createZixiDonation({
              userId: user.id,
              donorAddress: tx.from || "",
              donorName: "",
              amount: Math.abs(tx.amount || 0),
              token: tx.token === "YJC" ? "YJC" : "ZXC",
              message: "",
              status: "confirmed",
              txHash: hash,
            });
            newDonations.push(donation);
        }
      }
    } catch { /* ZIXI API may be unavailable */ }

    // 2. Try the chain explorer (on-chain token transfers, for external wallet sends)
    //    Failures are reported, not swallowed. Both catches used to be empty,
    //    which is the whole reason a wrong-chain query looked identical to
    //    "no donations today" for as long as it existed.
    let explorerError: string | null = null;
    if (newDonations.length === 0) {
      try {
        const apiKey = process.env.ETHERSCAN_API_KEY || "";
        const url = `${ETHERSCAN_API}?module=account&action=tokentx&contractaddress=${ZXC_CONTRACT}&address=${user.zixiWallet}&sort=desc${apiKey ? `&apikey=${apiKey}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) {
          explorerError = `explorer HTTP ${res.status}`;
        } else {
          const data: any = await res.json();
          if (data.status !== "1") {
            explorerError = `explorer: ${data.message || data.result || "no data"}`;
          } else {
            for (const tx of data.result || []) {
              const contract = (tx.contractAddress || "").toLowerCase();
              const token = contract === ZXC_CONTRACT ? "ZXC" : contract === YJC_CONTRACT ? "YJC" : null;
              if (!token) continue;
              if ((tx.to || "").toLowerCase() !== user.zixiWallet.toLowerCase()) continue;
              if (seenHashes.has(tx.hash)) continue;
              const amount = parseFloat(tx.value) / 1e18;
              if (amount <= 0) continue;
              await createZixiDonation({
                userId: user.id,
                donorAddress: tx.from || "",
                donorName: "",
                amount,
                token,
                message: "",
                status: "confirmed",
                txHash: tx.hash,
              });
              newDonations.push({ from: tx.from, amount, token });
            }
          }
        }
      } catch (e: any) {
        explorerError = `explorer unreachable: ${e?.message || e}`;
      }
    }

    return NextResponse.json({
      checked: true,
      found: newDonations.length,
      donations: newDonations,
      // Surfaced so "nothing found" can be told apart from "could not look".
      ...(explorerError ? { warning: explorerError } : {}),
    });
  } catch (e) {
    console.error("ZIXI check-tx error:", e);
    return NextResponse.json({ error: "Failed to check transactions" }, { status: 500 });
  }
}
