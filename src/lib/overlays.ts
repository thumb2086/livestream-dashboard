/**
 * Overlay catalogue.
 *
 * One source of truth for every OBS Browser Source this app can issue:
 * the route it serves, its display name, and whether it is on by default.
 * The settings pages, the OBS output page and the token API all read this so a
 * new overlay only has to be registered here.
 */

export type OverlayDef = {
  /** Stable key stored on OBSSource.sourceKey. */
  key: string;
  /** Display name used in the dashboard. */
  name: string;
  /** Path segment under /overlay. */
  path: string;
  /** Enabled the first time the token is issued. */
  defaultEnabled: boolean;
  /** True once an /overlay/<path>/[token] route exists. */
  hasRoute: boolean;
};

export const OVERLAYS: OverlayDef[] = [
  { key: "chat", name: "聊天室", path: "chat", defaultEnabled: true, hasRoute: true },
  { key: "captions", name: "即時字幕", path: "subtitles", defaultEnabled: true, hasRoute: true },
  { key: "donation-goal", name: "斗內進度條", path: "donations", defaultEnabled: true, hasRoute: true },
  { key: "donation-alert", name: "斗內通知", path: "alerts", defaultEnabled: true, hasRoute: true },
  { key: "channel-stats", name: "頻道數據", path: "stats", defaultEnabled: true, hasRoute: true },
  { key: "live-viewers", name: "同時觀看人數", path: "live-viewers", defaultEnabled: false, hasRoute: true },
  { key: "scoreboard", name: "即時比分板", path: "scoreboard", defaultEnabled: false, hasRoute: true },
  { key: "follower-alert", name: "追隨與訂閱提醒", path: "follower-alert", defaultEnabled: false, hasRoute: true },
  { key: "donation-ticker", name: "斗內跑馬燈", path: "donation-ticker", defaultEnabled: false, hasRoute: true },
  { key: "donation-cards", name: "斗內卡牌", path: "donation-cards", defaultEnabled: false, hasRoute: true },
  { key: "donation-video", name: "斗內影片", path: "donation-video", defaultEnabled: false, hasRoute: true },
];

export const overlayByKey = (key: string) => OVERLAYS.find((o) => o.key === key);

/** Absolute Browser Source URL for a token. */
export function overlayUrl(origin: string, path: string, token: string) {
  return `${origin}/overlay/${path}/${token}`;
}

export function newOverlayToken() {
  return (
    crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8)
  );
}