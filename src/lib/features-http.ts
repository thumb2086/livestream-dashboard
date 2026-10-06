// features-http.ts — FeatureSettings 的 Neon HTTP 存取
//
// 原本 `donation-videos-http.ts` 裡的 `videoSettings` / `saveFeatureSettings`
// 已驗證可行（Neon HTTP 對 updatedAt + jsonb 的回寫路徑是對的）。
// 這裡只是重新命名導出，讓其他路由（features/[key]、payment-settings）
// 能共用同一組已驗證的實作，而不是再寫一份有同一個 bug 的。
export { videoSettings as getFeatureSettings, saveFeatureSettings } from "./donation-videos-http";
