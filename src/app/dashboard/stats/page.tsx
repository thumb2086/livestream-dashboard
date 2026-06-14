"use client";

import { useState, useEffect } from "react";
import { Users } from "lucide-react";
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
        <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">你的頻道訂閱數據。</p>
      </div>
      <div className="rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6 text-center">
        <Users className="mx-auto mb-2 h-8 w-8 text-[var(--ic-fin-orange)]" />
        <div className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)] mb-1">訂閱數</div>
        <div className="text-[48px] font-[700] text-[var(--ic-ink)]">{state?.followers || 0}</div>
      </div>
    </div>
  );
}
