"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { api } from "@/lib/api";

export default function DashboardPage() {
  const [onboard, setOnboard] = useState<any>(null);
  const [conn, setConn] = useState<Record<string, any>>({});
  const [don, setDon] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getOnboard(),
      api.getConnections(),
      api.getDonations(),
    ]).then(([o, c, d]) => {
      if (o) setOnboard(o);
      if (c) setConn(c);
      if (d) setDon(d);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const toggleStep = async (idx: number) => {
    const key = `step${idx + 1}`;
    const upd = { ...onboard, [key]: !onboard[key] };
    setOnboard(upd);
    const result = await api.saveOnboard(upd).catch(() => upd);
    setOnboard(result);
  };

  const features = [
    { label: "公開頁面", href: "/dashboard/public-page", check: () => true, on: "已啟用", off: "未啟用" },
    { label: "平台串接", href: "/dashboard/connections", check: () => conn.twitch?.connected || conn.youtube?.connected, on: "已串接", off: "未串接" },
    { label: "聊天室", href: "/dashboard/chat", check: () => true, on: "已啟用", off: "未啟用" },
    { label: "斗內進度", href: "/dashboard/donations", check: () => don?.goals?.length > 0, on: () => `${don?.goals?.length || 0} 個目標`, off: "未設定" },
    { label: "斗內通知", href: "/dashboard/donations/alerts", check: () => true, on: "已啟用", off: "未啟用" },
    { label: "OBS 輸出", href: "/dashboard/obs", check: () => true, on: "可使用", off: "未啟用" },
    { label: "測試與整合", href: "/dashboard/testing", check: () => true, on: "就緒", off: "未就緒" },
    { label: "頻道統計", href: "/dashboard/stats", check: () => true, on: "查看", off: "無資料" },
    { label: "ZIXI 錢包", href: "/dashboard/zixi", check: () => true, on: "已設定", off: "未設定" },
  ];

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;

  const steps = [
    { num: 1, title: "串接你的平台", desc: "連結 Twitch 或 YouTube 帳號", href: "/dashboard/connections" },
    { num: 2, title: "設定疊加層", desc: "設定聊天室、斗內進度條", href: "/dashboard/chat" },
    { num: 3, title: "串接 ZIXI 錢包", desc: "接收 ZXC/YJC 贊助", href: "/dashboard/zixi" },
    { num: 4, title: "輸出到 OBS", desc: "取得 Browser Source 網址", href: "/dashboard/obs" },
  ];

  const doneCount = onboard ? [onboard.step1, onboard.step2, onboard.step3, onboard.step4].filter(Boolean).length : 0;
  const allDone = doneCount === 4;

  return (
    <div className="max-w-[1240px]">
      <div className="mb-[18px] border-b border-[var(--ic-hairline)] pb-[18px]">
        <h1 className="text-[40px] font-[500] leading-[1.15] text-[var(--ic-ink)]">控制中心</h1>
        <p className="mt-1 text-[15px] leading-[1.6] text-[var(--ic-ink-muted)]">
          歡迎回來
          {allDone && <span className="ml-2 text-green-600">✓ 全部就緒</span>}
        </p>
      </div>

      <div className="mb-8 grid gap-[18px]">
        <div className="flex items-start justify-between gap-[18px]">
          <h2 className="mt-1 text-[22px] font-[600] text-[var(--ic-ink)]">
            快速開始 <span className="ml-2 text-[14px] font-[400] text-[var(--ic-ink-muted)]">{doneCount}/4</span>
          </h2>
        </div>
        <div className="grid grid-cols-4 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1">
          {steps.map((step, idx) => {
            const done = onboard ? onboard[`step${idx + 1}`] : false;
            return (
              <Link key={step.num} href={step.href} className="no-underline">
                <div className={`grid gap-2 rounded-[var(--ic-radius-md)] border p-[14px] transition-all ${done ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.08)]" : "border-[var(--ic-hairline)] bg-[var(--ic-surface-2)] hover:border-[var(--ic-hairline-strong)]"}`}>
                  <div className="flex items-start justify-between">
                    <span className={`grid h-7 w-7 place-items-center rounded-full text-[12px] font-[800] ${done ? "bg-green-600 text-white" : "bg-[var(--ic-ink)] text-[var(--ic-surface-1)]"}`}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : step.num}
                    </span>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleStep(idx); }}
                      className="text-[11px] text-[var(--ic-ink-tertiary)] hover:text-[var(--ic-ink)]">
                      {done ? "取消" : "完成"}
                    </button>
                  </div>
                  <strong className="text-[14px] font-[600] text-[var(--ic-ink)]">{step.title}</strong>
                  <p className="m-0 text-[14px] leading-[1.55] text-[var(--ic-ink-subtle)]">{step.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {features.map((f) => {
          const active = f.check();
          const st = active ? (typeof f.on === "function" ? f.on() : f.on) : f.off;
          return (
            <Link key={f.href} href={f.href} className="no-underline">
              <div className="flex items-start gap-4 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-[22px] transition-all hover:border-[var(--ic-hairline-strong)] hover:shadow-[var(--ic-shadow-soft)] max-sm:p-4">
                <div className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[var(--ic-radius-md)] bg-[var(--ic-surface-3)]">
                  <span className="text-[18px]">{
                    {
                      "公開頁面": "🌐", "平台串接": "🔗", "聊天室": "💬",
                      "斗內進度": "❤️", "斗內通知": "🔔", "OBS 輸出": "🖥️",
                      "測試與整合": "🧪", "頻道統計": "📊", "ZIXI 錢包": "💰",
                    }[f.label] || "⚙️"
                  }</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-[16px] font-[600] text-[var(--ic-ink)]">{f.label}</h3>
                    <span className={`inline-flex flex-shrink-0 items-center rounded-full border px-[10px] py-[2px] text-[11px] font-[500] ${active ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.12)] text-[#075e28]" : "border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] text-[var(--ic-ink-muted)]"}`}>
                      {active ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                      {st}
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
