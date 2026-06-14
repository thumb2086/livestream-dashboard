"use client";

import { useEffect, useState } from "react";
import { Gamepad2, TvMinimalPlay } from "lucide-react";
import { api } from "@/lib/api";

export default function Home() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    api.getUser().then(u => {
      if (u?.id) window.location.href = "/dashboard";
    }).catch(() => {}).finally(() => setChecking(false));
  }, []);

  if (checking) return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--ic-canvas)]">
      <div className="text-[14px] text-[var(--ic-ink-muted)]">載入中...</div>
    </div>
  );

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--ic-canvas)] px-4" style={{ background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)" }}>
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--ic-radius-md)] bg-[var(--ic-fin-orange)] text-xl font-bold text-white shadow-lg">SF</div>
          <span className="text-2xl font-[650] tracking-tight text-white">StreamFlow</span>
        </div>
        <h1 className="text-[clamp(24px,5vw,32px)] font-[600] leading-[1.2] text-white">
          創作者控制中心
        </h1>
        <p className="text-[14px] leading-[1.6] text-white/60">
          免費開源的直播工具平台。管理斗內、聊天室、疊加層、OBS 串接。<br />
          使用你的 Twitch 或 Google 帳號開始使用。
        </p>

        <div className="mt-4 flex w-full flex-col gap-3">
          <a href="/api/auth/twitch"
            className="flex items-center justify-center gap-3 rounded-[12px] bg-[#9146ff] px-6 py-3.5 text-[15px] font-[600] text-white no-underline transition-all hover:bg-[#7c3aed]">
            <Gamepad2 size={22} />
            使用 Twitch 帳號登入
          </a>
          <a href="/api/auth/youtube"
            className="flex items-center justify-center gap-3 rounded-[12px] bg-white px-6 py-3.5 text-[15px] font-[600] text-[#111] no-underline transition-all hover:bg-gray-100">
            <TvMinimalPlay size={22} className="text-[#ff0033]" />
            使用 Google 帳號登入
          </a>
        </div>

        <p className="text-[12px] text-white/30">
          免費・開源 MIT・使用 Twitch/Google 帳號快速登入
        </p>
      </div>
    </div>
  );
}
