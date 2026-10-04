"use client";

import {
  PageHeader, Panel, Btn, Badge, EmptyState, Loading, ErrorBox, StatCard, useAsync,
} from "@/components/ui";
import { Receipt, Download, CreditCard } from "lucide-react";
import { useState } from "react";

type Invoice = {
  id: string; number: string; amount: number; tax: number;
  status: string; period: string; issuedAt: string;
};
type Payload = { invoices: Invoice[] };

export default function BillingPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync<Payload>(
    () => fetch("/api/v1/membership").then((r) => { if (!r.ok) throw new Error("載入失敗"); return r.json(); }),
    []
  );

  const invoices = data?.invoices ?? [];
  const paid = invoices.filter((i) => i.status === "paid");
  const pending = invoices.filter((i) => i.status === "pending");

  const pay = async (id: string) => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch("/api/v1/membership", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _meta: "payInvoice", id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `操作失敗 (${res.status})`);
      await reload();
    } catch (e: any) { setErr(e?.message || "操作失敗"); }
    finally { setBusy(false); }
  };

  const downloadInvoice = (inv: Invoice) => {
    const body = [
      "StreamFlow 發票（樣本）",
      `發票號碼：${inv.number}`,
      `計費期間：${inv.period}`,
      `開立日期：${new Date(inv.issuedAt).toLocaleDateString("zh-TW")}`,
      `金額：NT$ ${inv.amount.toLocaleString()}`,
      `稅額：NT$ ${inv.tax.toLocaleString()}`,
      `狀態：${inv.status === "paid" ? "已付款" : "待付款"}`,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([body], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${inv.number}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        title="付款與發票"
        description="查看每期帳單、付款狀態與發票。台灣開立發票需要填寫統編與抬頭，設定會沿用到後續所有帳單。"
        actions={<Badge tone={pending.length ? "warn" : "ok"}>{pending.length ? `${pending.length} 筆待付款` : "無待付款"}</Badge>}
      />

      {error && <ErrorBox message={error} />}
      {err && <ErrorBox message={err} />}

      <div className="mb-[18px] grid gap-[14px] sm:grid-cols-3">
        <StatCard label="帳單總數" value={String(invoices.length)} />
        <StatCard label="已付款" value={`NT$ ${paid.reduce((a, i) => a + i.amount, 0).toLocaleString()}`} />
        <StatCard label="待付款" value={`NT$ ${pending.reduce((a, i) => a + i.amount, 0).toLocaleString()}`} />
      </div>

      {loading && <Loading />}

      {!loading && invoices.length === 0 && (
        <EmptyState
          title="還沒有任何帳單"
          description="升級到付費方案後，系統會在這裡列出每一期的帳單與發票。"
        />
      )}

      {!loading && invoices.length > 0 && (
        <div className="flex flex-col gap-[14px]">
          {invoices.map((inv) => (
            <Panel key={inv.id}>
              <div className="flex flex-wrap items-center justify-between gap-[14px]">
                <div className="min-w-[200px]">
                  <div className="flex items-center gap-[10px]">
                    <Receipt size={17} className="text-[var(--ic-ink-tertiary)]" />
                    <span className="font-mono text-[15px] font-[700] text-[var(--ic-ink)]">{inv.number}</span>
                    <Badge tone={inv.status === "paid" ? "ok" : "warn"}>
                      {inv.status === "paid" ? "已付款" : "待付款"}
                    </Badge>
                  </div>
                  <div className="mt-[5px] text-[13px] text-[var(--ic-ink-muted)]">
                    計費期間 {inv.period} · 開立於 {new Date(inv.issuedAt).toLocaleDateString("zh-TW")}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[22px] font-[800] leading-none tabular-nums text-[var(--ic-ink)]">
                    NT$ {inv.amount.toLocaleString()}
                  </div>
                  <div className="mt-[3px] text-[12px] text-[var(--ic-ink-tertiary)]">
                    含稅 NT$ {(inv.amount + inv.tax).toLocaleString()}
                  </div>
                </div>

                <div className="flex gap-2">
                  {inv.status === "pending" && (
                    <Btn className="min-h-[38px] px-[16px]" disabled={busy} onClick={() => pay(inv.id)}>
                      <CreditCard size={15} /> 前往付款
                    </Btn>
                  )}
                  <Btn variant="secondary" className="min-h-[38px] px-[16px]" onClick={() => downloadInvoice(inv)}>
                    <Download size={15} /> 下載發票
                  </Btn>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <p className="mt-[16px] rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-2)] px-[16px] py-[12px] text-[13px] leading-[1.65] text-[var(--ic-ink-muted)]">
        金流收款尚未串接綠界自動對帳，因此付款按鈕目前只會把帳單標記為已付款以便測試流程。
        正式環境請先到
        <a href="/dashboard/payment-settings" className="mx-1 text-[var(--ic-brand-accent)] no-underline hover:underline">金流設定</a>
        設定商店代號與金鑰。
      </p>
    </>
  );
}