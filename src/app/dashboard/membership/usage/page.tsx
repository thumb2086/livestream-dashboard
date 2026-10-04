"use client";

import {
  PageHeader, Panel, Btn, Badge, EmptyState, Loading, ErrorBox, useAsync,
} from "@/components/ui";
import { RefreshCw, Sparkles, TrendingUp } from "lucide-react";
import { useState } from "react";

type Usage = { id: string; metric: string; quantity: number; note: string; createdAt: string };
type Payload = {
  quotas: { metric: string; label: string; limit: number; unit: string; used: number }[];
  usage: Usage[];
  periodStart: string;
};

const METRIC_LABEL: Record<string, string> = {
  overlay: "疊加層建立",
  caption_minutes: "字幕轉錄",
  ai_credits: "AI 點數消耗",
  replay_minutes: "回放分析",
};

export default function UsagePage() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, loading, error, reload } = useAsync<Payload>(
    () => fetch("/api/v1/membership").then((r) => { if (!r.ok) throw new Error("載入失敗"); return r.json(); }),
    []
  );

  const record = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/v1/membership", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _meta: "recordUsage", metric: "ai_credits", quantity: 10, note: "手動測試用量" }),
      });
      if (!res.ok) throw new Error("操作失敗");
      await reload();
    } catch (e: any) { setErr(e?.message || "操作失敗"); }
    finally { setBusy(false); }
  };

  const quotas = data?.quotas ?? [];
  const usage = data?.usage ?? [];

  // Aggregate per metric over the last 30 days for the trend strip.
  const cutoff = Date.now() - 30 * 864e5;
  const recent = usage.filter((u) => new Date(u.createdAt).getTime() >= cutoff);
  const byMetric: Record<string, number> = {};
  for (const u of recent) byMetric[u.metric] = (byMetric[u.metric] ?? 0) + u.quantity;

  return (
    <>
      <PageHeader
        title="用量與點數紀錄"
        description="逐筆查看這個計費週期消耗了哪些額度。資料來源包含字幕轉錄、疊加層建立與 AI 點數扣用。"
        actions={
          <div className="flex gap-2">
            <Btn variant="secondary" onClick={reload}><RefreshCw size={15} /> 重新整理</Btn>
            <Btn variant="secondary" onClick={record} disabled={busy}><Sparkles size={15} /> 加一筆測試用量</Btn>
          </div>
        }
      />

      {error && <ErrorBox message={error} />}
      {err && <ErrorBox message={err} />}

      <div className="mb-[18px] grid gap-[14px] md:grid-cols-3">
        {quotas.map((q) => {
          const pct = q.limit > 0 ? Math.min(100, Math.round((q.used / q.limit) * 100)) : 0;
          const over = q.used > q.limit;
          return (
            <Panel key={q.metric}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[14px] font-[600] text-[var(--ic-ink-muted)]">{q.label}</span>
                <Badge tone={over ? "danger" : pct > 80 ? "warn" : "ok"}>{pct}%</Badge>
              </div>
              <div className="mt-[8px] text-[26px] font-[800] leading-none tabular-nums text-[var(--ic-ink)]">
                {q.used.toLocaleString()}
                <span className="text-[14px] font-[500] text-[var(--ic-ink-tertiary)]"> / {q.limit.toLocaleString()} {q.unit}</span>
              </div>
              <div className="mt-[12px] h-[7px] w-full overflow-hidden rounded-full bg-[var(--ic-surface-4)]">
                <div className={`h-full rounded-full ${over ? "bg-[var(--ic-danger)]" : "bg-[var(--ic-brand-accent)]"}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-[8px] flex items-center gap-[6px] text-[12px] text-[var(--ic-ink-tertiary)]">
                <TrendingUp size={13} /> 近 30 天 {byMetric[q.metric]?.toLocaleString() ?? 0} {q.unit}
              </div>
            </Panel>
          );
        })}
      </div>

      {loading && <Loading />}

      {!loading && usage.length === 0 && (
        <EmptyState title="尚無用量紀錄" description="開始使用字幕或回放分析後，這裡會逐筆記錄每一筆扣用。" />
      )}

      {!loading && usage.length > 0 && (
        <Panel title="用量明細" description={`共 ${usage.length} 筆 · 顯示最近 200 筆`}>
          <div className="-mx-[22px] -my-[22px] overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--ic-hairline)] bg-[var(--ic-surface-2)]">
                  {["時間", "項目", "用量", "備註"].map((h) => (
                    <th key={h} className="px-[22px] py-[11px] text-[13px] font-[600] text-[var(--ic-ink-muted)]">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usage.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--ic-hairline-tertiary)] last:border-b-0 hover:bg-[var(--ic-surface-2)]">
                    <td className="px-[22px] py-[12px] text-[14px] whitespace-nowrap text-[var(--ic-ink-subtle)]">
                      {new Date(u.createdAt).toLocaleString("zh-TW")}
                    </td>
                    <td className="px-[22px] py-[12px] text-[14px] font-[600] text-[var(--ic-ink)]">
                      {METRIC_LABEL[u.metric] ?? u.metric}
                    </td>
                    <td className="px-[22px] py-[12px] text-[14px] font-[700] tabular-nums text-[var(--ic-brand-accent)]">
                      {u.quantity}
                    </td>
                    <td className="px-[22px] py-[12px] text-[14px] text-[var(--ic-ink-muted)]">{u.note || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </>
  );
}