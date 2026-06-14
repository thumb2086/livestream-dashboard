"use client";

import { useState, useEffect } from "react";
import { Link2, Copy, Check } from "lucide-react";
import { api } from "@/lib/api";

export default function PublicPage() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [origin, setOrigin] = useState("");
  useEffect(() => { setOrigin(window.location.origin); api.getUser().then(setState).catch(() => setError("載入失敗")).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const update = async (partial: any) => {
    const merged = { ...state, ...partial };
    setState(merged);
    await api.updateUser(partial).catch(() => setError("儲存失敗"));
  };

  const avatarUrl = state.avatar || null;
  const previewUrl = `${origin}/@${state.username}`;
  const copyUrl = () => { navigator.clipboard.writeText(previewUrl); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="max-w-[1180px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">公開頁面</span>
      </div>
      <div className="mb-4 grid items-end gap-7 border-b border-[var(--ic-hairline)] pb-5 max-lg:grid-cols-1">
        <div>
          <h1 className="text-[clamp(30px,3vw,38px)] font-[500] leading-[1.12] text-[var(--ic-ink)]">公開頁面</h1>
          <p className="mt-2 max-w-[700px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">你的創作者個人頁面，觀眾可以在這裡看到你的直播資訊、贊助連結與精選內容。</p>
        </div>
      </div>
      <div className="mb-5 grid grid-cols-[1fr_310px] gap-[18px] items-start max-lg:grid-cols-1">
        <div className="rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">頁面預覽</span>
            <span className={`inline-flex items-center rounded-full border px-[10px] py-[2px] text-[11px] font-[500] ${state.publicPage ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.12)] text-[#075e28]" : "border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] text-[var(--ic-ink-muted)]"}`}>
              {state.publicPage ? "已公開" : "未公開"}
            </span>
          </div>
          <div className="mb-4 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-2)] p-4">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--ic-surface-3)] overflow-hidden">
                {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : <span className="text-lg font-bold text-[var(--ic-fin-orange)]">{state.name?.charAt(0)}</span>}
              </div>
              <div>
                <div className="text-[18px] font-[600] text-[var(--ic-ink)]">{state.name}</div>
                <div className="text-[13px] text-[var(--ic-ink-muted)]">@{state.username}</div>
              </div>
            </div>
            <div className="text-[14px] text-[var(--ic-ink-subtle)]">{state.publicPage ? "🟢 直播中 · 訂閱以獲得即時通知" : "🔴 頁面未公開"}</div>
          </div>
          <div className="mb-4 grid gap-3">
            <div className="grid gap-1">
              <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">顯示名稱</span>
              <input value={state.name} onChange={e => update({ name: e.target.value })}
                className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none focus:border-[var(--ic-fin-orange)]" />
            </div>
            <div className="grid gap-1">
              <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">使用者名稱</span>
              <div className="flex items-center gap-2">
                <span className="text-[14px] text-[var(--ic-ink-muted)]">@</span>
                <input value={state.username} onChange={e => update({ username: e.target.value.replace(/\s/g, "") })}
                  className="flex-1 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none focus:border-[var(--ic-fin-orange)]" />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-canvas)] px-3 py-2.5">
              <Link2 className="h-4 w-4 flex-shrink-0 text-[var(--ic-ink-muted)]" />
              <span className="truncate text-[13px] text-[var(--ic-ink-muted)]">{previewUrl}</span>
            </div>
            <button onClick={copyUrl} className="flex min-h-[36px] flex-shrink-0 items-center gap-1.5 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 text-[13px] font-[500] text-[var(--ic-ink)] transition-all hover:border-[var(--ic-hairline-strong)]">
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "已複製" : "複製"}
            </button>
          </div>
        </div>
        <div className="sticky top-[82px] grid gap-4 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-[22px]">
          <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">頁面設定</span>
          <div className="flex items-center justify-between gap-4 border-t border-[var(--ic-hairline-tertiary)] pt-4">
            <span className="text-[15px] font-[650] text-[var(--ic-ink)]">公開頁面</span>
            <button onClick={() => update({ publicPage: !state.publicPage })}
              className={`relative h-6 w-11 rounded-full border p-0 transition-all ${state.publicPage ? "border-[var(--ic-fin-orange)] bg-[var(--ic-fin-orange)]" : "border-[var(--ic-hairline-strong)] bg-[var(--ic-surface-4)]"}`}>
              <span className={`absolute top-[2px] block h-[18px] w-[18px] rounded-full bg-white transition-all ${state.publicPage ? "left-[21px]" : "left-[2px]"}`} />
            </button>
          </div>
          <div className="flex items-center gap-2 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] p-3">
            {state.publicPage ? <Check className="h-4 w-4 text-green-600" /> : <Link2 className="h-4 w-4 text-[var(--ic-ink-muted)]" />}
            <span className="text-[13px] text-[var(--ic-ink-muted)]">{state.publicPage ? "頁面已公開，觀眾可瀏覽" : "開啟後觀眾即可瀏覽你的公開頁面"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
