"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthModal from "./AuthModal";
import { api } from "@/lib/api";

const navItems = [
  { label: "儀表板", href: "/dashboard" },
  { label: "公開頁面", href: "/dashboard/public-page" },
];

export default function TopNav() {
  const pathname = usePathname();
  const [demoMode, setDemoMode] = useState<boolean | null>(null);
  const [userName, setUserName] = useState("");
  const [userAvatar, setUserAvatar] = useState("");

  useEffect(() => {
    api.getUser().then(u => { setDemoMode(u.demoMode ?? false); setUserName(u.name || ""); setUserAvatar(u.avatar || ""); }).catch(() => {});
  }, []);

  const toggleDemo = async () => {
    const next = !demoMode;
    setDemoMode(next);
    await api.updateUser({ demoMode: next }).catch(() => {});
  };

  return (
    <nav className="sticky top-0 z-20 flex min-h-[58px] items-center justify-between gap-[18px] border-b border-[var(--ic-hairline)] bg-[rgba(245,241,236,.92)] px-5 py-[10px] backdrop-blur-[16px]">
      <Link href="/dashboard" className="inline-flex items-center gap-[10px] text-[14px] font-[650] text-[var(--ic-ink)] no-underline">
        <div className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--ic-radius-md)] bg-[var(--ic-fin-orange)] text-[12px] font-bold text-white">SF</div>
        StreamFlow
      </Link>

      <div className="absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 justify-center gap-7">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}
            className={`inline-flex min-h-[34px] items-center px-0 py-[7px] text-[13px] font-[500] no-underline transition-colors ${pathname === item.href ? "font-[650] text-[var(--ic-ink)]" : "text-[var(--ic-ink-subtle)] hover:text-[var(--ic-ink)]"}`}>
            {item.label}
          </Link>
        ))}
      </div>

      <div className="user-menu flex items-center gap-[10px]">
        {demoMode !== null && (
          <button onClick={toggleDemo}
            className="flex items-center gap-1.5 rounded-[999px] border px-3 py-1.5 text-[11px] font-[600] transition-all"
            style={{
              borderColor: demoMode ? "rgba(255,86,0,.28)" : "var(--ic-hairline)",
              background: demoMode ? "rgba(255,86,0,.1)" : "var(--ic-surface-3)",
              color: demoMode ? "#a53700" : "var(--ic-ink-muted)",
            }}
            title={demoMode ? "點擊關閉模擬訊息" : "點擊開啟模擬訊息"}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: demoMode ? "#ff5600" : "var(--ic-ink-tertiary)" }} />
            {demoMode ? "Demo 中" : "Demo 關"}
          </button>
        )}
        <a href="/dashboard/public-page" className="flex items-center gap-2 text-[13px] text-[var(--ic-ink-muted)] no-underline hover:text-[var(--ic-ink)]">
          {userAvatar ? <img src={userAvatar} className="h-6 w-6 rounded-full object-cover" /> : <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--ic-surface-3)] text-[10px] font-bold text-[var(--ic-ink)]">{userName?.charAt(0) || "管"}</span>}
          {userName || "管理員"}
        </a>
        {userName ? (
          <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}
            className="text-[12px] text-[var(--ic-ink-tertiary)] hover:text-red-500 transition-colors" title="登出">
            登出
          </button>
        ) : (
          <AuthModal />
        )}
      </div>
    </nav>
  );
}
