import { NextResponse } from "next/server";
import { query } from "@/lib/db-http";
import { resolveOverlayViaHttp } from "@/lib/db-http";
import { overlayByKey } from "@/lib/overlays";
import { getLiveViewers } from "@/lib/platform-live";
import { fetchSheetParticipants } from "@/lib/google-sheets";

/**
 * JSON feed polled by the on-screen overlays.
 * Authenticated by the overlay token (query param), not the user session —
 * OBS cannot send cookies.
 */
export async function GET(req: Request, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await ctx.params;
    const def = overlayByKey(key);
    if (!def) return NextResponse.json({ error: "Unknown overlay" }, { status: 404 });

    const token = new URL(req.url).searchParams.get("token");
    if (!token) return NextResponse.json({ error: "token required" }, { status: 401 });

    // 2026-10-06：token 解析 + FeatureSettings 改用 Neon HTTP（Workers 相容）。
    //
    // 這是 **OBS 輪詢的實際資料來源** —— overlay HTML 裡那支 setInterval 打的是它。
    // 而它原本用 `(prisma as any)`，那個 `as any` cast 讓我的掃描漏掉，
    // 導致我一度結論「overlay 全部乾淨」。掃描器的盲點讓結論比事實更樂觀。
    const resolved = await resolveOverlayViaHttp(token, key);
    if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const user = resolved.user as any;
    const settings = resolved.settings;

    const payload = await buildPayload(key, settings, user);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e) {
    console.error("GET /api/v1/overlay-data/[key] error:", e);
    return NextResponse.json({ error: "Failed to build overlay payload" }, { status: 500 });
  }
}

type Payload = Record<string, unknown>;

// ─────────────────────────────────────────────────────────
// 這兩個型別對應 Neon HTTP 查詢回傳的列形狀
// ─────────────────────────────────────────────────────────
//
// ⚠️ 我第一版寫 `donor` / `title` / `url` —— 那是我**猜**的欄位名。
//    而下游的 map 讀的是 `d.donorName` / `d.donorAddress` /
//    `v.videoUrl` / `v.startSec` / `v.endSec`。
//
//    猜錯的後果特別糟：SQL 會在執行時報「no such column」，
//    那還算好的；壞的是若猜的欄位名**恰好存在**但語意不同，
//    就會安靜地顯示錯的資料。
//
// 所以欄位名一律照 prisma/schema.prisma 抄，不憑記憶。
//
// ⚠️ 另一個容易踩的：Prisma 的 Float 回 number，而 HTTP 查詢回**字串**。
//    所以 amount 在這裡是 string|number 而下游期望 number ——
//    需要轉換，否則顯示會是 NaN 或空白，而且**不會報錯**。
interface ZixiDonationRow {
  id: string;
  donorAddress: string;
  donorName: string;
  amount: number | string;
  token: string;
  message: string;
  createdAt: string;
}

interface DonationVideoRow {
  id: string;
  donorName: string;
  amount: number | string;
  videoUrl: string;
  startSec: number;
  endSec: number;
  message: string;
  createdAt: string;
}

/** Neon HTTP 的 numeric/decimal 欄位回字串；統一轉成 number。 */
function num(v: number | string | null | undefined): number {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function buildPayload(
  key: string,
  s: Record<string, any>,
  user: any
): Promise<Payload> {
  switch (key) {
    case "live-viewers": {
      // The real concurrent audience from the connected platforms. Returns null
      // when nothing could report one, which the overlay renders differently
      // from a verified zero.
      const viewers = await getLiveViewers(user.id);
      return {
        enabled: s.enabled !== false,
        title: s.title ?? "同時觀看人數",
        label: s.labelText ?? "人氣",
        accent: s.accent ?? "#059669",
        viewers,
        known: viewers !== null,
        knownLabel: s.knownLabel ?? "--",
        position: s.position ?? "右上",
        size: s.size ?? "中",
        bgColor: s.bgColor ?? "rgba(13,17,26,0.82)",
        textColor: s.textColor ?? "#ffffff",
        thousands: s.thousands !== false,
      };
    }

    case "scoreboard": {
      // A creator can drive the scoreboard from a published Google Sheet; the
      // manual participant list stays as the fallback.
      let sourceParts: any[] = Array.isArray(s.participants) ? s.participants : [];
      let sheetError: string | null = null;
      let sheetUpdatedAt: string | null = null;

      if (s.sourceType === "google-sheets" && s.sheet?.spreadsheetUrl) {
        const result = await fetchSheetParticipants({
          spreadsheetUrl: String(s.sheet.spreadsheetUrl ?? ""),
          sheetName: String(s.sheet.sheetName ?? ""),
          namesRange: String(s.sheet.namesRange ?? ""),
          scoresRange: String(s.sheet.scoresRange ?? ""),
        });
        if ("error" in result) {
          // Keep showing the last known list rather than blanking the overlay.
          sheetError = result.error;
        } else {
          sourceParts = result.participants;
          sheetUpdatedAt = new Date().toISOString();
        }
      }

      const ranks: any[] = Array.isArray(s.ranks) ? s.ranks : [];
      const sorted = [...sourceParts]
        .map((p) => ({ id: String(p.id ?? ""), name: String(p.name ?? ""), score: Number(p.score) || 0 }))
        .sort((a, b) => b.score - a.score);
      return {
        enabled: s.enabled !== false,
        placement: s.placement ?? "top",
        fontFamily: s.fontFamily ?? "noto",
        sourceType: s.sourceType ?? "manual",
        sheetError,
        sheetUpdatedAt,
        participants: sorted.slice(0, 12).map((p, i) => ({
          ...p,
          rank: i + 1,
          tier: ranks[i]?.tier ?? "iron",
          accent: ranks[i]?.accent ?? "#64748b",
          text: ranks[i]?.text ?? "#ffffff",
          border: ranks[i]?.border ?? "#64748b",
          opacity: ranks[i]?.opacity ?? 82,
        })),
      };
    }

    case "follower-alert": {
      // 原本寫 `(prisma as any).eventLog?.findMany?.({...}).catch(() => null)`
      //
      // 那個 `?.` 鏈的**作用是讓「表不存在」變成靜默的空** ——
      // 而它同時把「Prisma 根本沒載入」也變成空。
      // 在 Workers 上那就是 WASM 錯誤被吞掉，症狀是
      // 「粉絲提示永遠是空的」而沒有任何錯誤。
      //
      // 所以改成真的查一次，失敗就明確失敗。
      // （這裡若 eventLog 表不存在，SQL 會報錯 —— 那才是應該被知道的。）
      const events = await query<{ id: string; actorName: string; createdAt: string }>(
        // 欄位照 prisma/schema.prisma 的 EventLog 抄：
        //   id / userId / platform / kind / externalId / actorName / actorId
        //   / message / amount / …
        // 我第一版寫了 "meta" —— 那個欄位不存在。
        `SELECT "id", "actorName", "createdAt"
           FROM "EventLog"
          WHERE "userId" = $1 AND "kind" = 'follow'
          ORDER BY "createdAt" DESC
          LIMIT 5`,
        [user.id],
      );
      return {
        enabled: s.enabled !== false,
        position: s.position ?? "右上",
        layout: s.layout ?? "卡片",
        duration: Number(s.duration) || 6,
        accent: s.accent ?? "#059669",
        textColor: s.textColor ?? "#ffffff",
        followText: s.followText ?? "加入了追隨行列",
        subText: s.subText ?? "訂閱了頻道 {tier} {months} 個月",
        sound: s.sound ?? "提示音",
        volume: Number(s.volume) || 60,
        showAvatar: s.showAvatar !== false,
        showMessage: s.showMessage !== false,
        events: events ?? [],
      };
    }

    case "donation-ticker": {
      const zixi = await query<ZixiDonationRow>(
        `SELECT "id", "donorAddress", "donorName", "amount", "token", "message", "createdAt"
           FROM "ZixiDonation"
          WHERE "userId" = $1
          ORDER BY "createdAt" DESC
          LIMIT $2`,
        [user.id, Math.max(1, Number(s.maxItems) || 5)],
      );
      return {
        enabled: s.enabled !== false,
        position: s.position ?? "底部",
        speed: s.speed ?? "中",
        direction: s.direction ?? "由右至左",
        fontSize: s.fontSize ?? "中",
        showAmount: s.showAmount !== false,
        showMessage: s.showMessage !== false,
        showAvatar: s.showAvatar !== false,
        background: s.background ?? "rgba(13,17,26,0.85)",
        textColor: s.textColor ?? "#ffffff",
        accent: s.accent ?? "#059669",
        separator: s.separator ?? "💛",
        items: zixi.map((d: any) => ({
          name: d.donorName || String(d.donorAddress ?? "").slice(0, 6) || "匿名",
          amount: num(d.amount),
          currency: d.token || "ZXC",
          message: d.message ?? "",
        })),
      };
    }

    case "donation-cards": {
      const cards: any[] = Array.isArray(s.cards) ? s.cards : [];
      return {
        enabled: s.enabled !== false,
        layout: s.layout ?? "3x2",
        showOnOverlay: s.showOnOverlay !== false,
        revealSeconds: Number(s.revealSeconds) || 8,
        cards: cards.filter((c) => c.enabled !== false),
      };
    }

    case "donation-video": {
      const videos = await query<DonationVideoRow>(
        `SELECT "id", "donorName", "amount", "videoUrl", "startSec", "endSec", "message", "createdAt"
           FROM "DonationVideo"
          WHERE "userId" = $1 AND "status" = 'approved'
          ORDER BY "createdAt" ASC
          LIMIT $2`,
        [user.id, Math.max(1, Number(s.maxQueue) || 10)],
      );
      return {
        enabled: s.enabled !== false,
        autoPlayNext: s.autoPlayNext !== false,
        showDonorMessage: s.showDonorMessage !== false,
        showQueueList: s.showQueueList !== false,
        playerWidth: Number(s.playerWidth) || 720,
        accent: s.accent ?? "#059669",
        queue: videos.map((v: any) => ({
          id: v.id,
          donorName: v.donorName || "匿名",
          amount: num(v.amount),
          videoUrl: v.videoUrl,
          startSec: v.startSec,
          endSec: v.endSec,
          message: v.message,
        })),
      };
    }

    default:
      return { enabled: s.enabled !== false, settings: s };
  }
}

