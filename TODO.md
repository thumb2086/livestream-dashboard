# StreamFlow 剩餘工作計畫

## P0 — 必須優先處理

### 1. 移除金流設定頁
- 刪除 `/dashboard/payments` 頁面
- 從側邊欄移除金流設定連結

### 2. 修復 Overlay 模擬訊息（使用者說沒修好）
- Chat overlay 的 `setInterval` demo 訊息的 `<script>` 仍在 HTML 中（即使 demoMode=false）
- 需要確認 overlay route handler 正確讀取 DB 的 `demoMode` 並條件式渲染 JS
- 在所有 overlay route handler 加入 `console.error` 記錄 demoMode 值以便除錯

### 3. 硬編碼 Token 動態化
- `getUser.ts` 的 seed token (`abc123`, `def456`, `ghi789`, `jkl012`, `mno345`) 改為隨機產生
- OBS 頁面現有 token 應保留，僅新使用者用隨機 token
- 所有頁面的 overlay URL 應從 API 動態讀取，而非硬編碼

## P1 — 金流整合（ZXC / YJC）

### 4. 串接 ZIXI 生態系
- 研究 zixi API 結構（位於 `C:\Users\CPXru\Desktop\thumb\program\zixi\zixi-casino\apps\api\src\`）
- 建立捐款頁面 `/dashboard/donations/zixi` 
- 使用 zixi API 建立捐款訂單
- 支援 ZXC（子熙幣）和 YJC（佑戩幣）
- 更新公開斗內頁面 `/donate/[username]` 支援 ZIXI 付款

### 5. 移除 localStorage store（已棄用）
- 確認無頁面再使用 `useClientStore` / `store.ts`
- 移除 `src/lib/store.ts` 和 `src/lib/useClientStore.ts`

## P2 — 優化

### 6. 改善 Overlay 架構
- Overlay 頁面應從單一 source of truth 讀取設定（chat/subtitle 設定）
- 加入 Overlay 健康檢查端點

### 7. 改善錯誤處理
- 統一錯誤回應格式
- 前端顯示更友善的錯誤訊息

## 執行順序

```
LOOP 1: 移除金流頁 + 修復 Overlay demo 問題
LOOP 2: 硬編碼 token 動態化
LOOP 3: 研究 zixi API + 基本捐款功能
LOOP 4: ZXC/YJC 捐款完整串接
LOOP 5: 清理棄用程式碼 + 最終測試
```
