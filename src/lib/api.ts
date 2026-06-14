const BASE = "/api/v1";

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
  return res.json();
}

export const api = {
  seed: () => req<{ ok: boolean; userId: string }>("/seed", { method: "POST" }),

  getUser: () => req<any>("/user"),
  updateUser: (data: any) => req<any>("/user", { method: "PATCH", body: JSON.stringify(data) }),

  getChat: () => req<any>("/chat"),
  saveChat: (data: any) => req<any>("/chat", { method: "PUT", body: JSON.stringify(data) }),

  getSubtitles: () => req<any>("/subtitles"),
  saveSubtitles: (data: any) => req<any>("/subtitles", { method: "PUT", body: JSON.stringify(data) }),

  getDonations: () => req<any>("/donations"),
  addGoal: (data: any) => req<any>("/donations", { method: "POST", body: JSON.stringify({ _meta: "addGoal", ...data }) }),
  updateGoal: (data: any) => req<any>("/donations", { method: "POST", body: JSON.stringify({ _meta: "updateGoal", ...data }) }),
  deleteGoal: (id: string) => req<any>("/donations", { method: "POST", body: JSON.stringify({ _meta: "deleteGoal", id }) }),
  updateDonationMeta: (data: any) => req<any>("/donations", { method: "POST", body: JSON.stringify({ _meta: "updateUser", ...data }) }),
  simulateDonation: (amount: number) => req<any>("/donations", { method: "POST", body: JSON.stringify({ _meta: "simulate", amount }) }),

  getOBS: () => req<{ sources: any[] }>("/obs"),
  toggleOBS: (id: string, enabled: boolean) => req<{ sources: any[] }>("/obs", { method: "POST", body: JSON.stringify({ _meta: "toggle", id, enabled }) }),
  regenerateOBS: (id: string) => req<{ sources: any[] }>("/obs", { method: "POST", body: JSON.stringify({ _meta: "regenerate", id }) }),

  getStats: () => req<any>("/stats"),
  addSession: (data: any) => req<any>("/stats", { method: "POST", body: JSON.stringify({ _meta: "add", ...data }) }),
  deleteSession: (id: string) => req<any>("/stats", { method: "POST", body: JSON.stringify({ _meta: "delete", id }) }),

  getConnections: () => req<Record<string, { connected: boolean; channelName: string | null; channelAvatar: string | null }>>("/connections"),
  toggleConnection: (platform: string, connected: boolean) => req<Record<string, { connected: boolean; channelName: string | null; channelAvatar: string | null }>>("/connections", { method: "POST", body: JSON.stringify({ _meta: "toggle", platform, connected }) }),
  refreshConnection: (platform: string) => req<Record<string, { connected: boolean; channelName: string | null; channelAvatar: string | null }>>("/connections", { method: "POST", body: JSON.stringify({ _meta: "refresh", platform }) }),

  getOnboard: () => req<any>("/onboard"),
  saveOnboard: (data: any) => req<any>("/onboard", { method: "POST", body: JSON.stringify(data) }),
};
