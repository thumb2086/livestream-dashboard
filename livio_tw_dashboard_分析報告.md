# LiveCore 創作者控制中心 — 網站架構與功能分析報告

> 分析日期：2026-06-14  
> 網站網址：https://livio.tw/dashboard  
> 分析方式：HTML 原始碼分析 + 公開搜尋資料

---

## 一、網站基本資訊

| 項目 | 內容 |
|------|------|
| **網站名稱** | LiveCore 創作者控制中心 |
| **網域** | livio.tw |
| **技術棧** | Next.js 16.2.9 + React 19.2.4 |
| **CSS 框架** | Tailwind CSS v4 |
| **主機/託管** | Cloudflare（含 Cloudflare Insights 分析） |
| **圖示** | SVG favicon (`/icon.svg`) |
| **字型** | Geist + Geist Mono (Google Fonts) |
| **語言** | 繁體中文 (zh-TW) |
| **Meta 描述** | "LiveCore 直播工具平台，包含斗內進度、聊天室、字幕等疊加層設定與 OBS 連結核發。" |

---

## 二、網站架構

### 2.1 技術架構

- **Framework**: Next.js 16.2.9 (App Router 模式)
- **UI Library**: React 19.2.4
- **CSS**: Tailwind CSS v4 with CSS 變數設計系統（自訂 Design Tokens）
- **渲染模式**: Client-side rendering (CSR) 為主，需 JS 執行才會顯示實際內容
- **路由結構**: Next.js App Router 搭配 Catch-All Route `[[...path]]`

### 2.2 設計系統（Design Tokens）

從 CSS 變數可看出完整的設計系統（命名前綴 `ic-`）：

| Token | 值 | 用途 |
|-------|-----|------|
| `--ic-primary` | #111111 | 主要色 |
| `--ic-fin-orange` | #ff5600 | 強調色/品牌橙色 |
| `--ic-danger` | #c41c1c | 危險/紅色 |
| `--ic-ink` | #111111 | 文字主色 |
| `--ic-surface-1` ~ `--ic-surface-4` | 白→淺灰 | 表面層級 |
| `--ic-canvas` | #f5f1ec | 頁面背景（暖米色） |
| `--ic-hairline` | #e5e2dd | 邊框分隔線 |
| `--ic-radius-md` | 8px | 中圓角 |
| `--ic-radius-lg` | 14px | 大圓角 |

整體風格為暖色系、簡約、低飽和度的 UI。

### 2.3 已知路由結構

| 路由 | 用途 | 是否需要登入 |
|------|------|:----:|
| `/` | 首頁/Landing Page | 否 |
| `/dashboard` | 控制中心主頁（功能模組選擇頁） | 是 |
| `/dashboard/subscription` | 訂閱管理 | 是 |
| `/dashboard/channel-stats-overlay` | 頻道統計疊加層設定 | 是 |
| `/dashboard/public-page` | 公開頁面設定 | 是 |
| `/dashboard/obs` | OBS 輸出網址管理 | 是 |
| `/dashboard/testing` | 測試與整合 | 是 |

### 2.4 認證系統

- **登入方式**: Twitch OAuth + Google OAuth
- **Session 管理**: Cookie-based session
- 需登入才能訪問 `/dashboard` 及其子路由

---

## 三、功能模組分析

根據 Meta Description 與搜尋片段，平台提供以下功能：

### 3.1 斗內進度（Donation Progress）
- 設定斗內目標金額與進度條
- 在直播中即時顯示贊助進度
- 結合 OBS Browser Source 顯示為疊加層

### 3.2 聊天室疊加層（Chat Overlay）
- 自訂直播聊天室顯示樣式（主題、字型大小、訊息數量）
- 支援深色/淺色/透明主題
- OBS Browser Source 輸出

### 3.3 字幕疊加層（Subtitles/Captions）
- 設定字幕字型、大小、文字顏色、背景顏色、位置
- 顯示開關控制

### 3.4 斗內通知（Donation Alerts）
- 當觀眾斗內時，在直播畫面上顯示通知動畫
- 自訂通知位置與顯示時間

### 3.5 OBS 輸出（OBS Output）
- 自動產生 Browser Source 網址
- 支援多種疊加層來源：聊天室、斗內進度、字幕、斗內通知、頻道統計
- 啟用/停用各來源
- Token 重新產生（安全機制）

### 3.6 公開頁面（Public Page）
- 創作者個人公開頁面
- 顯示名稱、頭像、斗內目標
- 可開關公開狀態

### 3.7 平台串接（Platform Connections）
- Twitch 帳號串接
- YouTube/Google 帳號串接
- 同步頻道資訊（名稱、頭像、訂閱狀態）

### 3.8 頻道統計（Channel Stats）
- 顯示訂閱數 / 觀眾數據
- 可作為 OBS 疊加層輸出

### 3.9 測試與整合（Testing & Integration）
- 模擬聊天室訊息
- 模擬斗內（寫入資料庫）
- 自動模擬模式（Demo Mode）
- 疊加層預覽網址快速複製

### 3.10 訂閱管理（Subscription）
- 管理平台訂閱方案

---

## 四、技術亮點

1. **Next.js 16 + React 19**：採用最新版本框架，使用 App Router 模式
2. **RSC (React Server Components) Payload**：部分頁面使用 RSC 資料串流
3. **完整 Design System**：CSS 變數驅動的主題系統，便於維護與擴展
4. **Cloudflare 整合**：使用 Cloudflare Insights 做效能監控
5. **Webpack Runtime Recovery**：內建 Webpack chunk 載入失敗自動重整機制
6. **OBS 整合**：核心功能圍繞 OBS Browser Source 提供直播疊加層
7. **雙平台 OAuth**：支援 Twitch 與 Google 兩種登入方式

---

## 五、可能的路由推測

從 RSC Payload 中的 `entry: "dashboard"` 與 Catch-All Route `[[...path]]` 判斷，該站採用統一的 dashboard entry point，實際子頁面可能包含：

- `/dashboard` — 控制中心主畫面
- `/dashboard/*` — 各功能模組（透過 Client-side Routing 切換）
- 所有 dashboard 頁面共用同一 Layout（側邊欄 + 頂部導航）

---

## 六、總結

LiveCore 創作者控制中心（livio.tw）是一個專為直播創作者設計的免費 SaaS 平台，核心價值在於提供「OBS 疊加層」的一站式管理方案。創作者無需撰寫任何程式碼，即可獲得：

- ✅ 專業級的斗內進度條
- ✅ 可自訂的聊天室疊加層
- ✅ 斗內通知動畫
- ✅ 字幕疊加層
- ✅ 頻道統計顯示
- ✅ 公開贊助頁面
- ✅ 雙平台帳號串接（Twitch / YouTube）
- ✅ 測試/模擬工具

平台使用現代 Web 技術（Next.js 16 + React 19 + Tailwind CSS）建構，設計風格簡約專業，是台灣直播生態中少見的本土自製工具平台。
