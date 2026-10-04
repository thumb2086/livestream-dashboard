"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessagesSquare } from "lucide-react";
import { api } from "@/lib/api";
import { Loading, ErrorBox } from "@/components/ui";
import {
  OverlaySettingsPage, OverlayPreview, OverlayOutput, OverlayEditor,
  SettingsTabs, SettingsTabPanel, SettingsCard, OverlayTokenProvider,
} from "@/components/overlay-settings";

/**
 * Chat overlay settings.
 *
 * The markup deliberately mirrors the `.chat-settings-*` class family that
 * livio's stylesheet defines (see public/css/dashboard.*.css) rather than
 * inventing Tailwind: header -> summary -> workspace(preview | output) -> tabs
 * -> tab panels -> cards.
 */
const FAMILY = "chat-settings";

const TABS = [
  { key: "basic", label: "基本" },
  { key: "style", label: "樣式" },
  { key: "filter", label: "過濾" },
  { key: "account", label: "平台" },
];

const FONT_SIZE: Record<string, string> = { "小": "12px", "中": "15px", "大": "18px" };

const CONNECTIONS = [
  { key: "twitch", label: "Twitch 聊天室", note: "需要 Channel:Read:subscriptions 權限" },
  { key: "youtube", label: "YouTube 聊天室", note: "需要 live chat 讀取權限" },
];

export default function ChatPage() {
  return (
    <OverlayTokenProvider overlayKey="chat">
      <ChatInner />
    </OverlayTokenProvider>
  );
}

function ChatInner() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("basic");
  const [connections, setConnections] = useState<Record<string, any>>({});
  const [messages, setMessages] = useState<{ user: string; text: string; color: string }[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    Promise.all([api.getChat(), api.getConnections()])
      .then(([s, c]) => {
        setSettings(s);
        setConnections(c ?? {});
      })
      .catch((e) => setError(e?.message || "載入失敗"))
      .finally(() => setLoading(false));

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // The overlay iframe carries the live chat; this list only previews the
  // styling between real messages.
  useEffect(() => {
    setMessages([
      { user: "User1", text: "哈囉！大家好", color: "text-purple-400" },
      { user: "SuperChat", text: "太精采了！繼續加油 🎉", color: "text-orange-400" },
      { user: "User2", text: "這個主題好漂亮", color: "text-blue-400" },
    ]);
    intervalRef.current = setInterval(() => {
      setMessages((prev) => {
        const names = ["小明", "阿花", "直播迷", "新觀眾", "老粉絲"];
        const texts = ["Nice!", "加油！", "哈哈哈", "讚讚", "77777", "好強喔"];
        const colors = ["text-purple-400", "text-blue-400", "text-green-400", "text-pink-400", "text-yellow-400"];
        const pick = (a: string[]) => a[Math.floor(Math.random() * a.length)];
        return [
          ...prev.slice(-19),
          { user: pick(names), text: pick(texts), color: pick(colors) },
        ];
      });
    }, 5000);
  }, []);

  const update = useCallback(
    async (partial: Record<string, unknown>) => {
      const merged = { ...settings, ...partial };
      setSettings(merged);
      try {
        await api.saveChat(merged);
      } catch {
        setError("儲存失敗");
      }
    },
    [settings]
  );

  if (loading) return <Loading />;
  if (error && !settings) return <ErrorBox message={error} />;

  const maxCount = parseInt(String(settings?.maxMessages ?? "50").replace(/\D/g, "")) || 50;
  const theme = settings?.theme ?? "dark";
  const fontSize = FONT_SIZE[settings?.fontSize ?? "中"] ?? "15px";
  const connectedCount = CONNECTIONS.filter((c) => connections[c.key]?.connected).length;

  return (
    <OverlaySettingsPage
      family={FAMILY}
      icon={<MessagesSquare size={26} />}
      title="聊天室"
      description="自訂直播聊天室的顯示樣式、字型與過濾規則。"
      summary={[
        {
          label: "模組狀態",
          value: (
            <span className={settings?.enabled ? "is-enabled" : ""}>
              {settings?.enabled ? "已啟用" : "已停用"}
            </span>
          ),
        },
        { label: "主題", value: theme === "light" ? "淺色" : theme === "transparent" ? "透明" : "深色" },
        { label: "已串接平台", value: `${connectedCount} / ${CONNECTIONS.length}` },
      ]}
    >
      <OverlayPreview family={FAMILY} title="整體顯示效果預覽">
        <div className="preview-frame-shell">
          {settings?.enabled ? (
            <div
              className={`preview-frame ${theme === "light" ? "bg-white" : theme === "transparent" ? "bg-transparent" : "bg-black/80"}`}
              style={{ padding: 12, display: "grid", gap: 8, alignContent: "start" }}
            >
              {messages.slice(-maxCount).map((m, i) => (
                <div key={i} style={{ display: "flex", gap: 6, fontSize, lineHeight: 1.4 }}>
                  <strong className={m.color} style={{ flexShrink: 0 }}>
                    {m.user}:
                  </strong>
                  <span style={{ color: theme === "light" ? "#1f2937" : "#ffffff" }}>{m.text}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="preview-frame preview-frame-chat-empty">
              <p>聊天室已停用，開啟後這裡會顯示即時訊息。</p>
            </div>
          )}
        </div>
      </OverlayPreview>

      <OverlayOutput title="聊天室輸出" />

      <OverlayEditor family={FAMILY} title="聊天室設定" hint="儲存後即時生效">
        <form className="stack" onSubmit={(e) => e.preventDefault()}>
          <SettingsTabs family={FAMILY} tabs={TABS} active={tab} onChange={setTab} label="聊天室設定分類" />

          <SettingsTabPanel family={FAMILY} tabKey="basic" active={tab}>
            <SettingsCard family={FAMILY} title="基本">
              <div className="chat-settings-switch">
                <span className="setting-switch-copy">
                  <strong>啟用聊天室</strong>
                  <span className="setting-switch-state">{settings?.enabled ? "開啟中" : "已關閉"}</span>
                  <span className="settings-note">在直播畫面中顯示聊天室疊加層。</span>
                </span>
                <span className="setting-switch-control">
                  <CreatorSwitch
                    checked={!!settings?.enabled}
                    onChange={(v) => update({ enabled: v })}
                    label="啟用聊天室"
                  />
                </span>
              </div>

              <div className="chat-settings-grid">
                <label className="field">
                  <span>顯示主題</span>
                  <select value={theme} onChange={(e) => update({ theme: e.target.value })}>
                    <option value="dark">深色主題</option>
                    <option value="light">淺色主題</option>
                    <option value="transparent">透明主題</option>
                  </select>
                </label>
                <label className="field">
                  <span>顯示訊息數量</span>
                  <select value={settings?.maxMessages ?? "最近 50 則"} onChange={(e) => update({ maxMessages: e.target.value })}>
                    <option>最近 30 則</option>
                    <option>最近 50 則</option>
                    <option>最近 100 則</option>
                  </select>
                </label>
              </div>
            </SettingsCard>
          </SettingsTabPanel>

          <SettingsTabPanel family={FAMILY} tabKey="style" active={tab}>
            <SettingsCard family={FAMILY} title="字體與動畫">
              <div className="chat-settings-grid">
                <label className="field">
                  <span>字型大小</span>
                  <select value={settings?.fontSize ?? "中"} onChange={(e) => update({ fontSize: e.target.value })}>
                    <option>小</option>
                    <option>中</option>
                    <option>大</option>
                  </select>
                </label>
                <label className="field">
                  <span>訊息淡入時間</span>
                  <select defaultValue="中">
                    <option>關閉</option>
                    <option>短</option>
                    <option>中</option>
                    <option>長</option>
                  </select>
                </label>
              </div>
            </SettingsCard>
          </SettingsTabPanel>

          <SettingsTabPanel family={FAMILY} tabKey="filter" active={tab}>
            <SettingsCard family={FAMILY} title="訊息過濾">
              <div className="chat-settings-choices">
                {["隱藏只有表情符號", "隱藏重複訊息", "隱藏包含連結的訊息", "隱藏第一字為「/` 的指令"].map(
                  (rule, i) => (
                    <label key={rule} className="chat-settings-choice">
                      <input type="checkbox" defaultChecked={i < 2} />
                      <span>
                        <strong>{rule}</strong>
                      </span>
                    </label>
                  )
                )}
              </div>
              <p className="chat-settings-info">
                過濾只影響顯示，不會影響聊天室互動。不過濾的設定尚未串接各平台 API，目前為介面選項。
              </p>
            </SettingsCard>
          </SettingsTabPanel>

          <SettingsTabPanel family={FAMILY} tabKey="account" active={tab}>
            <SettingsCard family={FAMILY} title="平台串接">
              <div className="chat-settings-connections">
                {CONNECTIONS.map((c) => (
                  <div key={c.key} className="chat-settings-connection">
                    <span>
                      <strong>{c.label}</strong>
                      <span className="settings-note">{connections[c.key]?.channelName ?? c.note}</span>
                    </span>
                    <span className={`status-pill${connections[c.key]?.connected ? " status-ok" : ""}`}>
                      {connections[c.key]?.connected ? "已串接" : "未串接"}
                    </span>
                  </div>
                ))}
              </div>
              <a href="/dashboard/connections">前往平台授權</a>
            </SettingsCard>
          </SettingsTabPanel>

          <footer className="chat-settings-actions">
            <span className="settings-note">所有設定會即時套用到疊加層</span>
          </footer>
        </form>
      </OverlayEditor>
    </OverlaySettingsPage>
  );
}

/** Matches livio's `.setting-switch-*` markup rather than the shared Toggle. */
function CreatorSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center" }}>
      <input
        className="setting-switch-input"
        type="checkbox"
        role="switch"
        checked={checked}
        aria-label={label}
        onChange={(e) => onChange(e.target.checked)}
        style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
      />
      <span className="setting-switch-track" aria-hidden="true">
        <span className="setting-switch-thumb" />
      </span>
    </span>
  );
}
