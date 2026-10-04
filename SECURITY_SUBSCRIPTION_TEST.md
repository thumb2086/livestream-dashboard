# LiveCore 正式站訂閱系統安全測試報告

> 測試時間：2026-09-17 14:47-14:49 UTC+8
> 測試帳號：thumb2084（Free 方案）
> RoE 範圍內：僅測試帳號，不碰他人帳號/真金流

---

## 一、測試發現摘要

### ✅ 安全（已驗證）
| 項目 | 結果 | 說明 |
|------|------|------|
| ECPay Webhook 驗證 | ✅ 安全 | CheckMacValue 驗證機制有效，無法偽造付款通知 |
| 方案名稱注入 | ✅ 安全 | 僅接受 Pro/Creator/Studio，拒絕 "admin" 等非法值 |
| 訂閱狀態直接修改 | ✅ 安全 | PATCH /v1/subscription 不存在（404） |
| 訂單狀態篡改 | ✅ 安全 | checkout 端點不接受 orderId/status 參數 |

### ⚠️ 發現問題
| 項目 | 嚴重度 | 說明 |
|------|--------|------|
| 無限建立待付款訂單 | P2 | 無速率限制，可建立大量待付款訂單（占用 DB 資源） |
| 未付款訂單無過期機制 | P2 | 待付款訂單無自動過期/清理，可能累積 |
| Cookie 名稱差異 | P3 | 正式站用 `livecore_session`，本地用 `sf_session` |

---

## 二、詳細測試過程

### 1. API 架構發現

正式站與本地不同：
- **本地**：Next.js API Routes（`/api/v1/*`）
- **正式站**：Fastify API（`/internal-api/*`）+ Caddy 反向代理
- **Cookie**：正式站用 `livecore_session`，本地用 `sf_session`
- **認證**：Session cookie，無 CSRF token

### 2. 方案升級測試

#### 測試 A：Checkout 建立（成功建立但未付款）
```
POST /internal-api/v1/subscription/checkout
Body: {"planName":"Creator","billingMode":"monthly"}
Result: ✅ 成功建立 ECPay 訂單（390 TWD/月）
         訂單狀態: pending
         方案狀態: 仍為 Free（未自動升級）
```

#### 測試 B：高價方案 Checkout（成功）
```
POST /internal-api/v1/subscription/checkout
Body: {"planName":"Studio","billingMode":"monthly"}
Result: ✅ 成功建立 ECPay 訂單（990 TWD/月）
```

#### 測試 C：計費模式切換（成功）
```
POST /internal-api/v1/subscription/checkout
Body: {"planName":"Creator","billingMode":"yearly"}
Result: ✅ 成功建立年繳訂單（3510 TWD/年）
```

#### 測試 D：方案名稱注入（被拒絕）
```
POST /internal-api/v1/subscription/checkout
Body: {"planName":"admin","billingMode":"monthly"}
Result: ❌ "Invalid enum value. Expected 'Pro' | 'Creator' | 'Studio'"
```

### 3. 付款繞過測試

#### 測試 E：偽造 ECPay Webhook（被拒絕）
```
POST /public-api/public/subscriptions/ecpay/notify
Body: {"MerchantID":"3484107","MerchantTradeNo":"...","RtnCode":"1","CheckMacValue":"FAKE"}
Result: ❌ "CheckMacValue verification failed"
```

#### 測試 F：直接存取付款回傳 URL（無效）
```
GET /public-api/public/subscriptions/ecpay/return?orderId=...&RtnCode=1
Result: 空回應（未升級方案）
```

---

## 三、方案功能權限對照

從 API 回傳的 `entitlements` 可見 Free 方案限制：

| 功能 | Free | Pro | Creator | Studio |
|------|------|-----|---------|--------|
| 公開創作者頁 | ✅ | ✅ | ✅ | ✅ |
| 公開斗內頁 | ✅ | ✅ | ✅ | ✅ |
| 真實金流 | ✅ (3家) | ✅ | ✅ | ✅ |
| 斗內通知 | basic | ✅ | ✅ | ✅ |
| 斗內進度條 | basic | ✅ | ✅ | ✅ |
| 聊天室 | basic | ✅ | ✅ | ✅ |
| 即時字幕 | trial 600s | 2h/月 | 20h/月 | 80h/月 |
| 直播指令 | ❌ | ✅ | ✅ | ✅ |
| 抽獎活動 | ❌ | ✅ | ✅ | ✅ |
| 斗內影片 | ❌ | ✅ | ✅ | ✅ |
| 回放分析 | ❌ | ❌ | ✅ (10h) | ✅ (40h) |
| 共享斗內房 | ✅ | ✅ | ✅ | ✅ |

---

## 四、結論

### 安全評估
1. **付款流程安全**：ECPay CheckMacValue 驗證有效，無法偽造付款
2. **方案驗證安全**：方案名稱白名單驗證，無法注入非法方案
3. **訂單狀態安全**：無法直接修改訂單狀態

### 建議改善
1. **P2 - 速率限制**：Checkout 端點應加入速率限制（每用戶每小時最多 3 次）
2. **P2 - 訂單過期**：待付款訂單應在 24 小時後自動過期
3. **P3 - Cookie 統一**：建議統一 Cookie 命名（`sf_session` vs `livecore_session`）

---

## 五、本地修補狀態

| 漏洞 | 本地已修 | 正式站狀態 |
|------|----------|------------|
| PATCH /user 自提權 | ✅ 已收斂 ALLOWED | 需確認（API 路徑不同） |
| donations updateUser 偽造 | ✅ 已移除 | 需確認 |
| Session 未失效 | ✅ 已修 | 需確認 |
| Math.random Token | ✅ 已改 randomUUID | 需確認 |
| isTest 免授權 | ✅ 已要求 session | 需確認 |
| OAuth 合併接管 | ❌ 未修 | 需排期 |
| Chat worker 弱 key | ❌ 未修 | 需排期 |

---

*本報告僅涵蓋 RoE 範圍內的測試，未觸及他人帳號或真實金流。*
