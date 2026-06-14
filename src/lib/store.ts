export function save<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

export function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

/* ── Plan ── */
export interface PlanState { currentPlan: string }
export const DEFAULT_PLAN: PlanState = { currentPlan: "入門" };
const PLAN_KEY = "sf_plan";
export function loadPlan(): PlanState { return load(PLAN_KEY, DEFAULT_PLAN); }
export function savePlan(v: PlanState): void { save(PLAN_KEY, v); }

/* ── Chat ── */
export interface ChatState { enabled: boolean; theme: string; maxMessages: string; fontSize: string }
export const DEFAULT_CHAT: ChatState = { enabled: true, theme: "dark", maxMessages: "最近 50 則", fontSize: "中" };
const CHAT_KEY = "sf_chat";
export function loadChat(): ChatState { return load(CHAT_KEY, DEFAULT_CHAT); }
export function saveChat(v: ChatState): void { save(CHAT_KEY, v); }

/* ── Public ── */
export interface PublicState { enabled: boolean; name: string; username: string }
export const DEFAULT_PUBLIC: PublicState = { enabled: true, name: "創作者名稱", username: "creator" };
const PUBLIC_KEY = "sf_public";
export function loadPublic(): PublicState { return load(PUBLIC_KEY, DEFAULT_PUBLIC); }
export function savePublic(v: PublicState): void { save(PUBLIC_KEY, v); }

/* ── Connections ── */
export interface ConnectionState { twitch: boolean; youtube: boolean }
export const DEFAULT_CONN: ConnectionState = { twitch: false, youtube: true };
const CONN_KEY = "sf_connections";
export function loadConnections(): ConnectionState { return load(CONN_KEY, DEFAULT_CONN); }
export function saveConnections(v: ConnectionState): void { save(CONN_KEY, v); }

/* ── Donations ── */
export interface DonationGoal { id: string; title: string; emoji: string; current: number; goal: number }
export interface DonationState { goals: DonationGoal[]; minAmount: number; soundEffect: string; totalReceived: number; donorCount: number }
export const DEFAULT_DONATIONS: DonationState = { goals: [], minAmount: 30, soundEffect: "預設音效", totalReceived: 0, donorCount: 0 };
const DON_KEY = "sf_donations";
export function loadDonations(): DonationState { return load(DON_KEY, DEFAULT_DONATIONS); }
export function saveDonations(v: DonationState): void { save(DON_KEY, v); }

/* ── Subtitles ── */
export interface SubtitleState { font: string; fontSize: string; textColor: string; bgColor: string; position: string; enabled: boolean }
export const DEFAULT_SUBTITLES: SubtitleState = { font: "預設", fontSize: "中 (24px)", textColor: "#FFFFFF", bgColor: "rgba(0,0,0,0.7)", position: "底部置中", enabled: true };
const SUB_KEY = "sf_subtitles";
export function loadSubtitles(): SubtitleState { return load(SUB_KEY, DEFAULT_SUBTITLES); }
export function saveSubtitles(v: SubtitleState): void { save(SUB_KEY, v); }

/* ── OBS ── */
export interface OBSSource { id: string; name: string; token: string; enabled: boolean }
export interface OBSState { sources: OBSSource[] }
export const DEFAULT_OBS: OBSState = { sources: [] };
const OBS_KEY = "sf_obs";
export function loadOBS(): OBSState { return load(OBS_KEY, DEFAULT_OBS); }
export function saveOBS(v: OBSState): void { save(OBS_KEY, v); }

/* ── Stats ── */
export interface StreamSession { id: string; title: string; date: string; views: number; avgTime: string; msgs: number; donations: number }
export interface StatsState { totalViews: number; followers: number; totalDonations: number; totalMessages: number; sessions: StreamSession[] }
export const DEFAULT_STATS: StatsState = { totalViews: 0, followers: 0, totalDonations: 0, totalMessages: 0, sessions: [] };
const STATS_KEY = "sf_stats";
export function loadStats(): StatsState { return load(STATS_KEY, DEFAULT_STATS); }
export function saveStats(v: StatsState): void { save(STATS_KEY, v); }

/* ── Onboard ── */
export interface OnboardState { completed: boolean[] }
export const DEFAULT_ONBOARD: OnboardState = { completed: [false, false, false, false] };
const ONBOARD_KEY = "sf_onboard";
export function loadOnboard(): OnboardState { return load(ONBOARD_KEY, DEFAULT_ONBOARD); }
export function saveOnboard(v: OnboardState): void { save(ONBOARD_KEY, v); }
