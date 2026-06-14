"use client";

import { useState, useEffect } from "react";
import { Wallet, ExternalLink, Check } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast/Toast";

export default function ZixiPage() {
  const [wallet, setWallet] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    api.getUser().then(u => { setWallet(u.zixiWallet || ""); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    await api.updateUser({ zixiWallet: wallet.trim() }).then(() => show("錢包地址已儲存", "success")).catch(() => show("儲存失敗", "error"));
    setSaving(false);
  };

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;

  return (
    <div className="max-w-[1080px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">ZIXI 錢包</span>
      </div>
      <div className="mb-6 grid gap-2">
        <h1 className="text-[34px] font-[500] leading-[1.12] text-[var(--ic-ink)]">ZIXI 生態系捐款</h1>
        <p className="max-w-[560px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">
          設定你的 ZIXI 錢包地址，讓觀眾可以透過 子熙幣 (ZXC) 或 佑戩幣 (YJC) 贊助你。
        </p>
      </div>
      <div className="grid grid-cols-[1fr_290px] gap-6 items-start max-lg:grid-cols-1">
        <div className="grid gap-4 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6">
          <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">錢包設定</span>

          <div className="grid gap-3">
            <div className="grid gap-1">
              <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">ZIXI 錢包地址</span>
              <input value={wallet} onChange={e => setWallet(e.target.value)}
                placeholder="0x..." className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] font-mono text-[var(--ic-ink)] outline-none focus:border-[var(--ic-fin-orange)]" />
            </div>
            <button onClick={save} disabled={saving}
              className="flex w-fit min-h-[36px] items-center gap-2 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-4 text-[13px] font-[500] text-white transition-all hover:bg-[var(--ic-primary-hover)] disabled:opacity-50">
              {saving ? "儲存中..." : <><Check className="h-4 w-4" /> 儲存</>}
            </button>
          </div>

          <div className="mt-2 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-canvas)] p-4">
            <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">支援代幣</span>
            <div className="mt-3 grid gap-3">
              <div className="flex items-center gap-3 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-orange-100 text-sm font-bold text-orange-600">ZXC</div>
                <div><strong className="text-[14px] font-[600] text-[var(--ic-ink)]">子熙幣 (ZXC)</strong><p className="m-0 text-[12px] text-[var(--ic-ink-muted)]">生態核心代幣，用於遊戲、交易、贊助</p></div>
              </div>
              <div className="flex items-center gap-3 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-3">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-sm font-bold text-purple-600">YJC</div>
                <div><strong className="text-[14px] font-[600] text-[var(--ic-ink)]">佑戩幣 (YJC)</strong><p className="m-0 text-[12px] text-[var(--ic-ink-muted)]">稀缺保值代幣，1 YJC = 1 億 ZXC</p></div>
              </div>
            </div>
          </div>
        </div>

        <div className="sticky top-[82px] grid gap-3.5 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-[22px]">
          <Wallet className="h-8 w-8 text-[var(--ic-fin-orange)]" />
          <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">如何取得錢包？</span>
          <div className="text-[13px] text-[var(--ic-ink-subtle)] leading-[1.6]">
            <p className="m-0">到 ZIXI Casino 註冊帳號即可獲得錢包地址。</p>
          </div>
          <a href="https://zixi-casino.vercel.app" target="_blank" rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-1.5 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-3 py-2.5 text-[13px] font-[500] text-white no-underline hover:bg-[var(--ic-primary-hover)]">
            <ExternalLink className="h-4 w-4" /> 前往 ZIXI Casino
          </a>
          <div className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] p-3 text-[12px] text-[var(--ic-ink-muted)]">
            設定錢包地址後，觀眾就可以在你的公開頁面使用 ZXC/YJC 贊助你。
          </div>
        </div>
      </div>
    </div>
  );
}
