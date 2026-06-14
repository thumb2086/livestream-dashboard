"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Globe, Cable, MessageSquare, Heart, Bell,
  Monitor, FlaskConical, BarChart3, Terminal, Wallet,
} from "lucide-react";

const sidebarSections = [
  {
    title: "主要",
    links: [
      { label: "控制中心", href: "/dashboard", icon: LayoutDashboard },
      { label: "公開頁面", href: "/dashboard/public-page", icon: Globe },
    ],
  },
  {
    title: "串接",
    links: [
      { label: "平台串接", href: "/dashboard/connections", icon: Cable },
      { label: "ZIXI 錢包", href: "/dashboard/zixi", icon: Wallet },
    ],
  },
  {
    title: "互動工具",
    links: [
      { label: "聊天室", href: "/dashboard/chat", icon: MessageSquare },
      { label: "斗內進度", href: "/dashboard/donations", icon: Heart },
      { label: "斗內通知", href: "/dashboard/donations/alerts", icon: Bell },
      { label: "直播指令", href: "/dashboard/commands", icon: Terminal },
    ],
  },
  {
    title: "輸出與測試",
    links: [
      { label: "OBS 輸出", href: "/dashboard/obs", icon: Monitor },
      { label: "測試與整合", href: "/dashboard/testing", icon: FlaskConical },
    ],
  },
  {
    title: "數據",
    links: [
      { label: "頻道統計", href: "/dashboard/stats", icon: BarChart3 },
    ],
  },

  {
    title: "ZIXI",
    links: [
      { label: "錢包設定", href: "/dashboard/zixi", icon: Wallet },
      { label: "捐款記錄", href: "/dashboard/zixi/donations", icon: Heart },
    ],
  },

];

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="sticky top-[59px] flex h-[calc(100vh-59px)] max-h-[calc(100vh-59px)] flex-col items-stretch gap-[14px] overflow-y-auto border-r border-[var(--ic-hairline)] bg-[var(--ic-surface-2)] px-3 py-[18px] overscroll-contain" style={{ scrollbarGutter: "stable" }}>
      <div className="rounded-[var(--ic-radius-md)] border border-transparent bg-transparent px-3 pb-3 pt-[10px]">
        <h2 className="text-[17px] font-[600] text-[var(--ic-ink)]">創作者控制中心</h2>
        <p className="mt-1 text-[12px] leading-[1.55] text-[var(--ic-ink-subtle)]">管理你的直播工具與疊加層設定</p>
      </div>

      {sidebarSections.map((section) => (
        <div key={section.title} className="flex w-full min-w-0 flex-col gap-[6px] rounded-[var(--ic-radius-md)] border border-transparent bg-transparent p-1">
          <div className="px-2 pb-[5px] pt-2 text-[11px] font-[600] tracking-[0.08em] text-[var(--ic-ink-tertiary)]">
            {section.title}
          </div>
          <div className="grid min-w-0 gap-[3px]">
            {section.links.map((link) => {
              const active = isActive(link.href);
              const Icon = link.icon;
              return (
                <Link key={link.href} href={link.href}
                  className={`flex min-h-[38px] w-full min-w-0 items-center gap-[10px] rounded-[var(--ic-radius-md)] border border-transparent px-[10px] py-[9px] text-[13px] font-[500] no-underline transition-all ${
                    active
                      ? "border-[var(--ic-hairline-strong)] bg-[var(--ic-surface-1)] text-[var(--ic-ink)] shadow-[0_1px_2px_rgba(17,17,17,.08)]"
                      : "text-[var(--ic-ink-subtle)] hover:border-[var(--ic-hairline)] hover:bg-[var(--ic-surface-1)] hover:text-[var(--ic-ink-muted)]"
                  }`}
                >
                  <Icon className={`h-[18px] w-[18px] flex-shrink-0 ${active ? "text-[var(--ic-fin-orange)]" : "text-[var(--ic-ink-tertiary)]"}`} />
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </aside>
  );
}
