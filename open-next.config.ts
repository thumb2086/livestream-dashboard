// open-next.config.ts — Next.js → Cloudflare Workers 的轉換設定
//
// ══════════════════════════════════════════════════════════
// 為什麼需要 OpenNext
// ══════════════════════════════════════════════════════════
//
// Next.js 的 `next build` 產出的是「給 Node 伺服器跑」的東西：
//   .next/server/**  用到 Node 的 http/net/crypto/fs
//
// 而 Cloudflare Workers 沒有那些。所以需要一層轉換：
//   next build → OpenNext 把 App Router / Route Handler
//   打包成 workerd 看得懂的樣子 → wrangler 部署成 Worker。
//
// ⚠️ 版本相容性（實測，不是猜的）
//
//   @opennextjs/cloudflare@1.20.8 的 peer 是
//       next: '>=15.5.27 <16 || >=16.3.8'
//   本專案是 next 16.2.9 → **不落在 1.20.8 的範圍**
//
//   而 1.18.0 的 peer 是
//       next: '~15.0.8 || … || ~16.0.11 || ^16.1.5'
//   ^16.1.5 = >=16.1.5 <17 → **16.2.9 相容**
//
// 所以釘在 1.18.0，而不是「用最新的」。
// 升級 Next 到 16.3.8+ 是一個未經驗證的風險，
// 而釘住 OpenNext 版本是零風險的那一邊。
//
// ══════════════════════════════════════════════════════════
// cacheIncrementalTag 是什麼、為什麼開
// ══════════════════════════════════════════════════════════
//
// 沒有它，ISR / revalidate 的頁面會退化成「每次都重建」。
// 這個專案有 48 個 route handler 加上多個動態頁面，
// 沒有增量標籤快取等於每個請求都跑一次完整 render ——
// 那會讓 Worker 的 CPU 時間與 Neon 的查詢量一起爆。
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig({
  // ⚠️ 這裡**刻意不設** incrementalCache / tagCache。
  //
  // 我第一版寫了 `cacheIncrementalTag: true`，那是舊版 API，
  // 1.18.0 的型別裡沒有 → next build 的 TypeScript 階段直接失敗：
  //   "Object literal may only specify known properties,
  //    and 'cacheIncrementalTag' does not exist in type 'CloudflareOverrides'"
  //
  // 而 1.18.0 的實際欄位是（讀 dist/api/config.d.ts 確認的）：
  //   incrementalCache / tagCache / queue / cachePurge
  //   / enableCacheInterception / routePreloadingBehavior
  //
  // 兩者都有預設實作（走 wrangler.jsonc 裡的 OPENNEXT_CACHE DO），
  // 所以不寫就是預設行為 —— 而預設行為是我沒驗證過的東西。
  // 真的需要覆寫時，應該先量測再改，而不是先寫一個猜的旗標。
  //
  // routePreloadingBehavior 刻意留 "none"（預設）：
  // 官方註明白說「用其他值會提高 cold start 的 CPU 使用量」。
  // 這個專案有 48 個 route handler，preload 會把每個都預熱 ——
  // 那是把免費層的 CPU 額度花在沒人拜訪的路由上。

  // ── 邊緣快取 ────────────────────────────────────────────
  //
  // ⚠️ 這裡沒有設定 edgeCache，因為它屬於 AWS 層的設定
  //    （defineCloudflareConfig 覆蓋的是 CloudflareOverrides）。
  //
  //    而更重要的是**語意**：這個專案幾乎所有頁面都是
  //    「每個創作者自己的即時資料」—— 聊天室、OBS 狀態、
  //    觀看數、捐款紀錄。
  //
  //    快取那些等於顯示過期的觀看數字給創作者，
  //    而那種錯誤**不會報錯**，只會讓人以為自己的直播沒人看。
  //    所以即使要設定，也應該是 ratio: 0。
});