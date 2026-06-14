"use client";

import { useState, useEffect, useRef } from "react";
import { Terminal } from "lucide-react";
import { api } from "@/lib/api";

export default function ChatPage() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [obsSources, setObsSources] = useState<any[]>([]);
  const [demoMode, setDemoMode] = useState(true);
  const [messages, setMessages] = useState<{ user: string; text: string; color: string }[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([api.getChat(), api.getOBS(), api.getUser()])
      .then(([s, o, u]) => { setSettings(s); setObsSources(o.sources); if (u) setDemoMode(u.demoMode ?? false); })
      .catch(() => setError("載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!demoMode) return;
    setMessages([
      { user: "User1", text: "哈囉！大家好", color: "text-purple-400" },
      { user: "SuperChat", text: "太精采了！繼續加油 🎉", color: "text-orange-400" },
      { user: "User2", text: "這個主題好漂亮", color: "text-blue-400" },
    ]);
    intervalRef.current = setInterval(() => {
      setMessages(prev => {
        const names = ["小明", "阿花", "直播迷", "新觀眾", "老粉絲"];
        const msgs = ["Nice!", "加油！", "哈哈哈", "讚讚", "77777", "好強喔"];
        const colors = ["text-purple-400", "text-blue-400", "text-green-400", "text-pink-400", "text-yellow-400"];
        return [...prev.slice(-20), { user: names[Math.floor(Math.random() * names.length)], text: msgs[Math.floor(Math.random() * msgs.length)], color: colors[Math.floor(Math.random() * colors.length)] }];
      });
    }, 5000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [demoMode]);

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>;

  const update = async (partial: any) => {
    const merged = { ...settings, ...partial };
    setSettings(merged);
    await api.saveChat(merged).catch(() => setError("儲存失敗"));
  };

  const maxCount = parseInt((settings?.maxMessages || "50").replace(/\D/g, "")) || 50;
  const fontSizeMap: Record<string, string> = { "小": "12px", "中": "15px", "大": "18px" };
  const chatSource = obsSources.find((s: any) => s.sourceKey === "chat");
  const overlayUrl = chatSource ? `${typeof window !== "undefined" ? window.location.origin : ""}/overlay/chat/${chatSource.token}` : null;

  return (
    <div className="max-w-[1080px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">聊天室</span>
      </div>
      <div className="mb-6 grid gap-2">
        <h1 className="text-[34px] font-[500] leading-[1.12] text-[var(--ic-ink)]">聊天室疊加層</h1>
        <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">自訂直播聊天室的顯示樣式、字型、動畫與過濾規則。</p>
      </div>
      <div className="grid grid-cols-[1fr_290px] gap-6 items-start max-lg:grid-cols-1">
        <div className="grid gap-3.5 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">設定</span>
            <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-[500] ${settings.enabled ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.12)] text-[#075e28]" : "border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] text-[var(--ic-ink-muted)]"}`}>
              {settings.enabled ? "啟用中" : "已停用"}
            </span>
          </div>
          <div className="grid gap-4">
            <div className="flex items-center justify-between gap-4 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-4">
              <div><strong className="text-[14px] font-[600] text-[var(--ic-ink)]">啟用聊天室</strong><p className="m-0 mt-0.5 text-[13px] text-[var(--ic-ink-subtle)]">在直播中顯示聊天室疊加層</p></div>
              <button onClick={() => update({ enabled: !settings.enabled })}
                className={`relative h-6 w-11 flex-shrink-0 rounded-full border p-0 transition-all ${settings.enabled ? "border-[var(--ic-fin-orange)] bg-[var(--ic-fin-orange)]" : "border-[var(--ic-hairline-strong)] bg-[var(--ic-surface-4)]"}`}>
                <span className={`absolute top-[2px] block h-[18px] w-[18px] rounded-full bg-white transition-all ${settings.enabled ? "left-[21px]" : "left-[2px]"}`} />
              </button>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">顯示主題</span>
              <select value={settings.theme} onChange={e => update({ theme: e.target.value })}
                className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none focus:border-[var(--ic-fin-orange)]">
                <option value="dark">深色主題</option><option value="light">淺色主題</option><option value="transparent">透明主題</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">顯示訊息數量</span>
              <select value={settings.maxMessages} onChange={e => update({ maxMessages: e.target.value })}
                className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none">
                <option>最近 50 則</option><option>最近 30 則</option><option>最近 100 則</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">字型大小</span>
              <select value={settings.fontSize} onChange={e => update({ fontSize: e.target.value })}
                className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none">
                <option>小</option><option>中</option><option>大</option>
              </select>
            </div>
          </div>
          <div className="mt-2 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-canvas)] p-3">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-[500] text-[var(--ic-ink-muted)]">
              <Terminal className="h-4 w-4" /> 即時預覽
            </div>
            <div className={`grid gap-2 rounded-[var(--ic-radius-md)] p-3 ${settings.theme === "light" ? "bg-white" : settings.theme === "transparent" ? "bg-transparent" : "bg-black/80"}`}>
              {messages.slice(-maxCount).map((m, i) => (
                <div key={i} className="flex items-start gap-2" style={{ fontSize: fontSizeMap[settings.fontSize] || "15px" }}>
                  <strong className={`flex-shrink-0 ${m.color}`}>{m.user}:</strong>
                  <span className={settings.theme === "light" ? "text-gray-800" : "text-white"}>{m.text}</span>
                </div>
              ))}
              {!settings.enabled && <div className="text-center text-[13px] text-[var(--ic-ink-muted)]">聊天室已停用</div>}
            </div>
          </div>
        </div>
        <div className="sticky top-[82px] grid gap-3.5 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-[22px]">
          <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">快速資訊</span>
          <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-[500] ${settings.enabled ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.12)] text-[#075e28]" : "border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] text-[var(--ic-ink-muted)]"}`}>
            狀態：{settings.enabled ? "運作中" : "已停用"}
          </span>
          <div className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-3)] p-3">
            <strong className="text-[14px] text-[var(--ic-ink)]">Browser Source 網址</strong>
            <p className="mt-1 break-all text-[13px] text-[var(--ic-ink-muted)]">
              {settings.enabled && overlayUrl ? overlayUrl : "請先在 OBS 頁面啟用來源"}
            </p>
          </div>
          <a href="/dashboard/obs" className="flex w-full items-center justify-center rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[13px] font-[500] text-[var(--ic-ink)] transition-all hover:border-[var(--ic-hairline-strong)] no-underline">
            管理 OBS 來源
          </a>
        </div>
      </div>
    </div>
  );
}
