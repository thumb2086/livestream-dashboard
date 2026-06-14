"use client";

import { useState, useEffect } from "react";
import { Users, Gamepad2, TvMinimalPlay } from "lucide-react";
import { api } from "@/lib/api";

export default function StatsPage() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getStats().then(setState).catch(() => {}).finally(() => setLoading(false)); }, []);

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;

  return (
    <div className="max-w-[1080px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">頻道統計</span>
      </div>
      <div className="mb-6 grid gap-2">
        <h1 className="text-[34px] font-[500] leading-[1.12] text-[var(--ic-ink)]">頻道統計</h1>
        <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">來自 Twitch 與 YouTube 的訂閱/追蹤數據。</p>
      </div>
      <div className="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
        <div className="rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6 text-center">
          <Gamepad2 className="mx-auto mb-2 h-8 w-8 text-[#9146ff]" />
          <div className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)] mb-1">Twitch 追蹤</div>
          <div className="text-[48px] font-[700] text-[#9146ff]">{state?.twitch || 0}</div>
        </div>
        <div className="rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6 text-center">
          <TvMinimalPlay className="mx-auto mb-2 h-8 w-8 text-[#ff0033]" />
          <div className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)] mb-1">YouTube 訂閱</div>
          <div className="text-[48px] font-[700] text-[#ff0033]">{state?.youtube || 0}</div>
        </div>
      </div>
    </div>
  );
}
