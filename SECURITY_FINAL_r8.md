# LiveCore 正式站紅隊總報告（第 1–8 輪，約 140 向量）

- 時間：2026-09-17 14:30–17:10（UTC+8），RoE 窗口內
- 測試帳號：thumb2084（A）、thumb2085（B），皆 Free 方案；未碰他人帳號、未真實付款
- 目標：可免費升級方案／解鎖付費功能的漏洞，不限方法

## 結論

**免費升級方案：未找到。** 付款門（ECPay CheckMacValue＋server-side 金額＋Zod 嚴格 enum）與授權牆（session 隔離、owner 檢查、功能鎖）在約 140 向量下全部成立。

## 確認漏洞

| # | 嚴重度 | 位置 | 說明 | 狀態 |
|---|--------|------|------|------|
| 1 | P1 | `PUT /internal-api/v1/payment-settings` | 可寫入自己的 ECPay/OPay 商家憑證（`configured:true`），改變自己斗內收款流向；需驗證是否有跨帳號影響 | 已證、已還原 |
| 2 | P2 | `POST /internal-api/v1/subscription/checkout` | 無速率限制，並發建出 4 筆待付款訂單；訂單無可見過期清理（累積約 15 筆測試訂單待甲方清理） | 已證 |
| 3 | P3 | `POST /v1/features/captions-overlay/test-segments` | 不耗 trial 配額但照常廣播（`broadcastCount:1`，usedQuantity 不變）；僅自己 output，跨用戶被擋 | 已證 |

## 已驗證安全（黑盒）

付款：CheckMacValue（含 form-encoded、HPP 重複參數、RtnCode=0 一律先驗簽）、金額 server-side、方案/計費 enum 大小寫嚴格、CustomField/promo 欄位忽略、return URL 僅 303、notify 僅 POST、OPay/PayPal 未實作。
授權：IDOR 讀寫全擋（A↔B 雙向）、creatorPublicId/publicSlug 唯一性、mass-assignment 白名單、room member 寫入 `owner_required`、子路由授權一致、commerce 按人隔離、outputs 列表隔離、test-events 跨用戶被擋。
OAuth：returnTo 同源驗證、callback server-side 驗 code、state 瀏覽器綁定＋過期失效、POST 被拒、dev-login 正式站關閉。
其他：SSRF 白名單（僅 docs.google.com）、CORS 無反射、HSTS/CSP/nosniff 完整、SQLi 無影響、轉錄音檔驗證、heartbeat 計費 server-side elapsed。

## 未覆蓋（黑盒極限，需擴大授權或白盒）

1. **overlay.livio.tw 舊 token 有效性**（reissue 後舊 token 是否失效）——超出 RoE，首要嫌疑
2. **OAuth 帳號合併邏輯**（email/channelName 合併）——需真實 provider 授權碼
3. **ECPay HashKey/HashIV** —— server-side
4. **trial 耗盡後 fail-open** —— 需實際串流 600 秒

## 測試殘留

- 待付款訂單約 15 筆（無刪除 API，請甲方排程清理：LCS251BFAFF6AC04F3B8、LCSE3AFEC5E6A8D43DFA…等）
- B 測試 output（alerts/captions 各一）、B trial 配額消耗約 8 秒
- 其餘 room/target/session/displayName/payment-settings 均已還原

## 24h 通報草稿

主旨：【LiveCore 資安通報】正式站紅隊 8 輪：付款門成立，發現 P1 金流設定劫持＋P2 無速率限制＋P3 配額繞過
內容：重現步驟如上（測試帳號 thumb2084/thumb2085），影響與修復建議：payment-settings 加強審查／異動通知、checkout 加速率限制＋訂單 TTL、test-segments 納入配額；請求清理測試訂單、評估 RoE 擴大至 overlay 主機。
