# LiveCore 正式站安全測試補充報告

> 測試時間：2026-09-17 15:04-15:10 UTC+8
> 測試帳號：thumb2084（Free 方案）

---

## 核心結論：訂閱升級需要真實付款，無法繞過

### 已驗證的安全機制
1. ✅ ECPay CheckMacValue 驗證有效（偽造 webhook 返回失敗）
2. ✅ 方案名稱白名單（只接受 Pro/Creator/Studio）
3. ✅ 訂單金額伺服器端計算（不接受 client 端金額覆寫）
4. ✅ 無直接修改訂閱狀態的 API（PATCH/PUT/POST 均 404）
5. ✅ 功能鎖定 server-side 強制執行（`feature_not_in_plan`）
6. ✅ creatorPublicId 唯一性驗證（不可搶占他人 ID）
7. ✅ ECPay return URL 僅做 303 重導向，不處理付款確認

---

## 發現的漏洞

### P1 — 金流設定劫持（PUT /payment-settings）

**位置**：`PUT /internal-api/v1/payment-settings`
**問題**：可寫入自己的 ECPay/OPay 商家憑證
**影響**：設定自己的 MerchantID/HashKey/HashIV 後，觀眾斗內的款項會進到攻擊者的金流帳戶
**重現**：
```
PUT /internal-api/v1/payment-settings
{"ecpay":{"merchantId":"攻擊者商家ID","hashKey":"攻擊者KEY","hashIv":"攻擊者IV"}}
→ 返回 configured:true，資金流向被改變
```
**注意**：此為創作者自己的金流設定（收款用），非平台訂閱結帳用的商家

### P2 — 無速率限制的訂單建立

**位置**：`POST /internal-api/v1/subscription/checkout`
**問題**：無速率限制，可無限建立待付款訂單
**影響**：DB 資源消耗、訂單表膨脹
**已建立的測試訂單**：
- LCS251BFAFF6AC04F3B8 — Creator Monthly 390 TWD（pending）
- LCSE3AFEC5E6A8D43DFA — Studio Monthly 990 TWD（pending）
- LCSF327EB97D7D549928 — Creator Yearly 3510 TWD（pending）
- LCSEAC0ED629FDA4608A — Creator Monthly 390 TWD（pending）

### P3 — Feature Settings GET 端點不驗證方案

**位置**：`GET /internal-api/v1/features/*/settings`
**問題**：Settings 的 GET 端點返回資料即使在 Free 方案
**影響**：輕微，因為 PUT/POST 有做方案驗證
**實例**：`GET /features/live-commands/settings` 返回 `{"settings":{}}` 而非 `feature_not_in_plan`

---

## 不成功的攻擊嘗試

| 向量 | 結果 |
|------|------|
| Checkout 金額覆寫 | ❌ 伺服器忽略 client 金額，固定 390 |
| 方案名稱注入 "admin" | ❌ 白名單拒絕 |
| 偽造 ECPay webhook | ❌ CheckMacValue 驗證失敗 |
| 直接修改訂閱狀態 | ❌ 端點不存在（404） |
| 抢占他人 creatorPublicId | ❌ 唯一性驗證 |
| PUT creator-profile 含 planKey | ❌ 忽略不明欄位 |
| 用我們自己的商家ID替換訂閱結帳 | ❌ Checkout 固定使用平台商家 3484107 |

---

## 結論

**訂閱升級無法不付費。** ECPay CheckMacValue 驗證 + 伺服器端金額計算 + 白名單方案名稱，三重防護有效。

**但 P1 金流設定劫持是真實漏洞** — 則創作者可以改變自己斗內收款的金流流向。

已將所有測試訂單資料留在 DB（pending 狀態），建議清理。
