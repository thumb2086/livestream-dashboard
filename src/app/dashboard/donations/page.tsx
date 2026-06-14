"use client";

import { useState, useEffect } from "react";
import { Heart, Plus, Target, Trash2, Pencil, Check, X } from "lucide-react";
import { api } from "@/lib/api";

export default function DonationsPage() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", goal: 0, emoji: "🎯" });
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState({ title: "", goal: 10000, emoji: "🎯" });
  const [simAmount, setSimAmount] = useState("");

  useEffect(() => { api.getDonations().then(setState).catch(() => setError("載入失敗")).finally(() => setLoading(false)); }, []);

  const refresh = async () => { const r = await api.getDonations(); setState(r); };

  const addGoal = async () => {
    if (!newForm.title.trim() || newForm.goal <= 0) return;
    setError(null);
    await api.addGoal(newForm).catch((e) => { setError("新增目標失敗"); throw e; }).then(() => refresh());
    setNewForm({ title: "", goal: 10000, emoji: "🎯" });
    setAdding(false);
  };

  const deleteGoal = async (id: string) => { setError(null); await api.deleteGoal(id).catch(() => setError("刪除失敗")).then(() => refresh()); };
  const startEdit = (g: any) => { setEditingId(g.id); setEditForm({ title: g.title, goal: g.goal, emoji: g.emoji }); };
  const saveEdit = async (id: string) => {
    if (!editForm.title.trim() || editForm.goal <= 0) return;
    setError(null);
    await api.updateGoal({ id, ...editForm }).catch(() => setError("儲存失敗")).then(() => refresh());
    setEditingId(null);
  };

  const simulateDonation = async () => {
    const amount = parseInt(simAmount);
    if (isNaN(amount) || amount <= 0) return;
    setError(null);
    await api.simulateDonation(amount).catch(() => setError("模擬失敗")).then(() => refresh());
    setSimAmount("");
  };

  const updateMeta = async (partial: any) => {
    const merged = { ...state, ...partial };
    setState(merged);
    await api.updateDonationMeta(merged).catch(() => setError("儲存失敗"));
  };

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;

  return (
    <div className="max-w-[1080px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">斗內進度</span>
      </div>
      <div className="mb-6 grid gap-2">
        <h1 className="text-[34px] font-[500] leading-[1.12] text-[var(--ic-ink)]">斗內進度</h1>
        <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">設定斗內目標與進度條，在直播中即時顯示贊助進度。</p>
      </div>
      {error && <div className="mb-4 rounded-[var(--ic-radius-md)] border border-red-200 bg-red-50 p-3 text-[13px] text-red-600">{error}</div>}
      <div className="grid grid-cols-[1fr_290px] gap-6 items-start max-lg:grid-cols-1">
        <div className="grid gap-3.5 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">斗內目標</span>
            {state.goals?.length > 0 && (
              <button onClick={() => setAdding(true)} className="flex min-h-[36px] items-center gap-1.5 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-3.5 text-[13px] font-[500] text-white"><Plus className="h-4 w-4" /> 新增目標</button>
            )}
          </div>
          {adding && (
            <div className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-2)] p-4">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">目標名稱</span>
                  <input value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="例如：新麥克風基金" className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none" />
                </div>
                <div className="grid gap-1">
                  <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">目標金額</span>
                  <input type="number" value={newForm.goal} onChange={e => setNewForm(f => ({ ...f, goal: parseInt(e.target.value) || 0 }))} className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={addGoal} className="flex min-h-[36px] items-center gap-1.5 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-3.5 text-[13px] font-[500] text-white"><Check className="h-4 w-4" /> 新增</button>
                <button onClick={() => setAdding(false)} className="flex min-h-[36px] items-center rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3.5 text-[13px] font-[500] text-[var(--ic-ink)]"><X className="h-4 w-4" /></button>
              </div>
            </div>
          )}
          <div className="grid gap-3">
            {(!state.goals || state.goals.length === 0) && !adding && (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <Heart className="h-8 w-8 text-[var(--ic-ink-tertiary)]" />
                <p className="text-[14px] text-[var(--ic-ink-muted)]">尚無斗內目標</p>
                <button onClick={() => setAdding(true)} className="flex min-h-[36px] items-center gap-1.5 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-3.5 text-[13px] font-[500] text-white"><Plus className="h-4 w-4" /> 新增第一個目標</button>
              </div>
            )}
            {state.goals?.map((g: any) => {
              const pct = Math.min(100, Math.round((g.current / g.goal) * 100));
              return (
                <div key={g.id} className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-4">
                  {editingId === g.id ? (
                    <div className="mb-3 grid grid-cols-2 gap-3">
                      <div className="grid gap-1"><span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">名稱</span><input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] px-3 py-2 text-[13px] text-[var(--ic-ink)] outline-none" /></div>
                      <div className="grid gap-1"><span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">目標金額</span><input type="number" value={editForm.goal} onChange={e => setEditForm(f => ({ ...f, goal: parseInt(e.target.value) || 0 }))} className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] px-3 py-2 text-[13px] text-[var(--ic-ink)] outline-none" /></div>
                      <div className="col-span-2 flex gap-2">
                        <button onClick={() => saveEdit(g.id)} className="flex items-center gap-1 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-3 py-1.5 text-[12px] font-[500] text-white"><Check className="h-3.5 w-3.5" /> 儲存</button>
                        <button onClick={() => setEditingId(null)} className="flex items-center rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] px-3 py-1.5 text-[12px] font-[500] text-[var(--ic-ink)]"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2"><span className="text-lg">{g.emoji}</span><strong className="text-[15px] font-[600] text-[var(--ic-ink)]">{g.title}</strong></div>
                      <div className="flex items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-[500] ${pct >= 100 ? "border-[rgba(11,223,80,.32)] bg-[rgba(11,223,80,.12)] text-[#075e28]" : "border-[rgba(255,86,0,.28)] bg-[rgba(255,86,0,.1)] text-[#a53700]"}`}>
                          <Target className="h-3 w-3" /> {pct}%
                        </span>
                        <button onClick={() => startEdit(g)} className="rounded p-1 text-[var(--ic-ink-tertiary)] hover:text-[var(--ic-ink)]"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteGoal(g.id)} className="rounded p-1 text-[var(--ic-ink-tertiary)] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )}
                  <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-[var(--ic-surface-3)]">
                    <div className="h-full rounded-full bg-[var(--ic-fin-orange)] transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-[600] text-[var(--ic-ink)]">ZXC {g.current.toLocaleString()}</span>
                    <span className="text-[var(--ic-ink-muted)]">目標 ZXC {g.goal.toLocaleString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-canvas)] p-4">
            <div className="mb-2 flex items-center gap-2 text-[13px] font-[500] text-[var(--ic-ink-muted)]">
              <Heart className="h-4 w-4" /> 模擬斗內（資料庫即時更新）
            </div>
            <div className="flex gap-2">
              <input type="number" value={simAmount} onChange={e => setSimAmount(e.target.value)} placeholder="輸入金額..." className="flex-1 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none" />
              <button onClick={simulateDonation} className="flex min-h-[36px] items-center gap-1.5 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-fin-orange)] px-3.5 text-[13px] font-[500] text-white"><Heart className="h-4 w-4" /> 捐！</button>
            </div>
          </div>
        </div>
        <div className="sticky top-[82px] grid gap-3.5 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-[22px]">
          <span className="text-[12px] font-[500] uppercase tracking-[0.04em] text-[var(--ic-ink-subtle)]">統計</span>
          <div className="flex items-center gap-2 text-[14px] font-[600] text-[var(--ic-ink)]">
            <Heart className="h-5 w-5 text-[var(--ic-fin-orange)]" /> 本月已收到
          </div>
          <strong className="text-[32px] font-[700] text-[var(--ic-ink)]">ZXC {state.totalReceived?.toLocaleString() || 0}</strong>
          <div className="text-[13px] text-[var(--ic-ink-muted)]">來自 {state.donorCount || 0} 位贊助者</div>
          <div className="border-t border-[var(--ic-hairline-tertiary)] pt-3">
            <span className="text-[12px] font-[500] text-[var(--ic-ink-muted)]">最低斗內金額</span>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[14px] text-[var(--ic-ink)]">ZXC</span>
              <input type="number" value={state.minAmount} onChange={e => updateMeta({ minAmount: parseInt(e.target.value) || 0 })} className="w-20 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] px-2.5 py-1.5 text-[14px] text-[var(--ic-ink)] outline-none" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
