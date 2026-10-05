"use client";

import { useState, useEffect } from "react";
import { Monitor, Copy, Check, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export default function OBSPage() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { setOrigin(window.location.origin); api.getOBS().then(setState).finally(() => setLoading(false)); }, []);

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(null), 2000);
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      setState(await api.toggleOBS(id, enabled));
    } catch (e: any) {
      setErr(e?.message || "切換失敗");
    }
  };

  // api.regenerateOBS posts `_meta: "regenerate"`, but the route only matches
  // `"reissue"`, so this fell through to a 400 "Unknown action". With no catch
  // the rejection was unhandled: the button looked live and silently did
  // nothing. Now it reports the failure, and the message is accurate about what
  // the button actually does.
  const regenerate = async (id: string) => {
    setErr(null);
    try {
      setState(await api.regenerateOBS(id));
    } catch (e: any) {
      setErr(e?.message || "重新產生失敗");
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;

  const sources = state?.sources || [];

  return (
    <div className="max-w-[1080px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">OBS 輸出</span>
      </div>
      <div className="mb-6 grid gap-2">
        <h1 className="text-[34px] font-[500] leading-[1.12] text-[var(--ic-ink)]">OBS 輸出</h1>
        <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">取得 Browser Source 網址，在 OBS 中新增來源即可顯示疊加層。</p>
      </div>
      {err && (
        <div className="mb-3 rounded-[var(--ic-radius-md)] border border-[var(--ic-danger)] bg-[rgba(196,28,28,.1)] px-3 py-2 text-[13px] text-[var(--ic-danger)]" role="alert">
          {err}
        </div>
      )}
      <div className="grid gap-3.5">
        {sources.map((src: any) => {
          // The API already returns an absolute, correct `url` built from the
          // overlay key (see api/v1/obs/route.ts). This page used to rebuild it
          // from `src.sourceKey`, which that payload does not have -- the field
          // is `key` -- so every URL was /overlay/undefined/<token> and all 11
          // Browser Sources 404'd in OBS.
          const url: string = src.url || `${origin}/overlay/${src.key}/${src.token}`;
          if (!src.key) {
            console.warn("[obs] source is missing `key`; the URL above may not resolve", src);
          }
          return (
            <div key={src.id} className="rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-[var(--ic-fin-orange)]" />
                  <strong className="text-[16px] font-[600] text-[var(--ic-ink)]">{src.name}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggle(src.id, !src.enabled)}
                    className={`relative h-6 w-11 rounded-full border p-0 transition-all ${src.enabled ? "border-[var(--ic-fin-orange)] bg-[var(--ic-fin-orange)]" : "border-[var(--ic-hairline-strong)] bg-[var(--ic-surface-4)]"}`}>
                    <span className={`absolute top-[2px] block h-[18px] w-[18px] rounded-full bg-white transition-all ${src.enabled ? "left-[21px]" : "left-[2px]"}`} />
                  </button>
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-[500] ${src.enabled ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.12)] text-[#075e28]" : "border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] text-[var(--ic-ink-muted)]"}`}>
                    {src.enabled ? "啟用中" : "已停用"}
                  </span>
                </div>
              </div>
              <div className="mb-3 flex items-center gap-2 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-canvas)] px-3 py-2.5">
                <code className="flex-1 truncate text-[13px] text-[var(--ic-ink-muted)]">{url}</code>
                <button onClick={() => copyUrl(url)} className="flex min-h-[32px] flex-shrink-0 items-center gap-1 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-2.5 text-[12px] font-[500] text-[var(--ic-ink)] transition-all hover:border-[var(--ic-hairline-strong)]">
                  {copied === url ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied === url ? "已複製" : "複製"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-[13px] text-[var(--ic-ink-subtle)]">在 OBS 中新增 Browser Source，貼上以上網址，寬度設為 1920，高度設為 1080。</p>
                <button onClick={() => regenerate(src.id)} className="flex flex-shrink-0 items-center gap-1 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-2.5 py-1.5 text-[12px] font-[500] text-[var(--ic-ink)] transition-all hover:border-[var(--ic-hairline-strong)]">
                  <RefreshCw className="h-3.5 w-3.5" /> 重新產生
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-6 flex items-start gap-3 rounded-[var(--ic-radius-md)] border border-[rgba(196,28,28,.26)] bg-[rgba(196,28,28,.1)] p-3.5">
        <RefreshCw className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--ic-danger)]" />
        <div className="text-[13px] text-[var(--ic-danger)]"><strong>安全性提醒：</strong>請勿將 Browser Source 網址分享給他人。若懷疑外洩，請點擊「重新產生」更換 token，舊網址會立即失效。</div>
      </div>
    </div>
  );
}
