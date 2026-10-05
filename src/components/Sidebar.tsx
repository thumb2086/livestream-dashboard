"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Globe, Cable, CreditCard, Clapperboard, UserCog,
  ShoppingBag, CalendarDays, Layers2, Users2, Bell, ScrollText,
  Target, ClipboardCheck, MoveHorizontal, Trophy, FlaskConical,
  UserPlus, MessageSquare, Captions, BarChart3, Eye, MonitorPlay,
  Terminal, Monitor, Crown, Gauge, Receipt, Wallet, Heart, Video,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";

type Section = { title: string; links: { label: string; href: string; icon: LucideIcon }[] };

const SECTIONS: Section[] = [
  {
    title: "控制台",
    links: [
      { label: "觀眾斗內頁設定", href: "/dashboard/public-page", icon: Globe },
      { label: "平台授權", href: "/dashboard/connections", icon: Cable },
      { label: "金流設定", href: "/dashboard/payment-settings", icon: CreditCard },
      { label: "回放分析", href: "/dashboard/replay-analysis", icon: Clapperboard },
      { label: "帳戶設定", href: "/dashboard/account", icon: UserCog },
    ],
  },
  {
    title: "SHOP 與活動",
    links: [
      { label: "周邊商店", href: "/dashboard/commerce", icon: ShoppingBag },
      { label: "台聚活動", href: "/dashboard/meetups", icon: CalendarDays },
    ],
  },
  {
    title: "斗內工具",
    links: [
      { label: "斗內卡牌", href: "/dashboard/donation-cards", icon: Layers2 },
      { label: "共用斗內房間", href: "/dashboard/shared-donation-rooms", icon: Users2 },
      { label: "斗內通知", href: "/dashboard/donations/alerts", icon: Bell },
      { label: "斗內紀錄", href: "/dashboard/donations/records", icon: ScrollText },
      { label: "斗內進度條", href: "/dashboard/donations", icon: Target },
      { label: "斗內影片", href: "/dashboard/donation-video", icon: Video },
      { label: "影片審核佇列", href: "/dashboard/donation-video/review", icon: ClipboardCheck },
      { label: "斗內跑馬燈", href: "/dashboard/donation-ticker", icon: MoveHorizontal },
      { label: "排行榜", href: "/dashboard/leaderboard", icon: Trophy },
      { label: "測試頁面", href: "/dashboard/testing", icon: FlaskConical },
    ],
  },
  {
    title: "OVERLAY 與互動",
    links: [
      { label: "追隨與訂閱提醒", href: "/dashboard/follower-alert", icon: UserPlus },
      { label: "聊天室", href: "/dashboard/chat", icon: MessageSquare },
      { label: "即時字幕", href: "/dashboard/subtitles", icon: Captions },
      { label: "頻道數據", href: "/dashboard/stats", icon: BarChart3 },
      { label: "同時觀看人數", href: "/dashboard/live-viewers", icon: Eye },
      { label: "即時比分板", href: "/dashboard/scoreboard", icon: MonitorPlay },
      { label: "直播指令機器人", href: "/dashboard/commands", icon: Terminal },
      { label: "OBS 輸出", href: "/dashboard/obs", icon: Monitor },
    ],
  },
  {
    title: "ZIXI 生態系",
    links: [
      { label: "錢包設定", href: "/dashboard/zixi", icon: Wallet },
      { label: "捐款記錄", href: "/dashboard/zixi/donations", icon: Heart },
    ],
  },
  {
    title: "會員",
    links: [
      { label: "會員中心", href: "/dashboard/membership", icon: Crown },
      { label: "訂閱方案", href: "/dashboard/subscription", icon: CreditCard },
      { label: "用量與點數紀錄", href: "/dashboard/membership/usage", icon: Gauge },
      { label: "付款與發票", href: "/dashboard/membership/billing", icon: Receipt },
    ],
  },
];

const MENU_LINKS = [
  { label: "會員中心", href: "/dashboard/membership" },
  { label: "訂閱方案", href: "/dashboard/subscription" },
  { label: "用量與點數紀錄", href: "/dashboard/membership/usage" },
  { label: "付款與發票", href: "/dashboard/membership/billing" },
  { label: "帳戶設定", href: "/dashboard/account" },
];

export default function Sidebar() {
  const pathname = usePathname();
  // Two sources on purpose: /api/v1/user for identity, /api/v1/membership for
  // the plan that is actually GRANTED plus real quota.
  //
  // The previous version read User.chosenPlan -- a legacy column whose default is
  // the localized string for "starter" and which nothing updates when a
  // subscription is paid -- and read `aiPoints`, a field that does not exist on
  // the model at all. So the ribbon always rendered its fallback and the plan
  // label always read "<chosenPlan> · <localized legacy>".
  const [user, setUser] = useState<{
    name?: string;
    avatar?: string;
    plan?: string;
    captionMinutes?: string;
  }>({});
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    api.getUser()
      .then((u) => setUser((prev) => ({ ...prev, name: u?.name, avatar: u?.avatar })))
      .catch(() => {});

    fetch("/api/v1/membership")
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => {
        if (!m) return;
        const caption = (m.quotas ?? []).find((q: any) => q.metric === "caption_minutes");
        setUser((prev) => ({
          ...prev,
          plan: String(m.effectivePlan ?? "free").toUpperCase(),
          captionMinutes: caption
            ? `${Math.round(caption.used)} / ${caption.limit.toLocaleString()}`
            : undefined,
        }));
      })
      .catch(() => {});
  }, []);

  // Close the account popover whenever the route changes.
  useEffect(() => setMenuOpen(false), [pathname]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  };

  return (
    <>
      <div className="member-sidebar-scroll">
        {SECTIONS.map((section) => (
          <section className="sidebar-section" key={section.title}>
            <p className="sidebar-section-title">
              <span className="sidebar-section-dot" aria-hidden="true" />
              {section.title}
            </p>
            <div className="sidebar-link-list">
              {section.links.map((link) => {
                const active = isActive(link.href);
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    data-link=""
                    className={`sidebar-link${active ? " is-active" : ""}`}
                    aria-current={active ? "page" : undefined}
                  >
                    <span className="sidebar-link-icon" aria-hidden="true">
                      <Icon size={18} strokeWidth={2.15} />
                    </span>
                    <span className="sidebar-link-label">{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <div className="member-account">
        <div id="member-account-menu" className="member-account-menu" hidden={!menuOpen}>
          <p>帳戶與會員</p>
          <nav aria-label="帳戶與會員">
            {MENU_LINKS.map((l) => (
              <Link key={l.href} href={l.href} data-link="">
                {l.label}
              </Link>
            ))}
            <button type="button" onClick={logout}>
              登出
            </button>
          </nav>
        </div>

        <button
          type="button"
          className="member-account-trigger"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-controls="member-account-menu"
          aria-label={menuOpen ? "關閉帳戶與會員選單" : "開啟帳戶與會員選單"}
        >
          <span className="member-account-identity">
            <span className="member-avatar" aria-hidden="true">
              {user.avatar ? <img src={user.avatar} alt="" /> : user.name?.charAt(0) || "?"}
            </span>
            <span>
              <strong>{user.name || "未登入"}</strong>
              <small>{user.plan || "Free"}</small>
            </span>
            <span className="member-chevron" aria-hidden="true">
              ⌃
            </span>
          </span>
          <span className="member-points-ribbon">
            <span>字幕分鐘數</span>
            <span>
              <strong>{user.captionMinutes ?? "—"}</strong>
            </span>
          </span>
          <small className="member-expiry">新制點數尚未啟用</small>
        </button>
      </div>
    </>
  );
}
