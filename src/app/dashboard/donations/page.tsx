"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, Plus, Target, Trash2, Pencil, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { Loading, ErrorBox } from "@/components/ui";
import { OverlayOutput, OverlayTokenProvider } from "@/components/overlay-settings";

/**
 * Donation goal settings.
 *
 * Markup follows livio's `.donation-goal-*` family: a management workspace
 * (goal list + sticky preview) and a create form, using the shared
 * `.panel`, `.field`, `.action-row` and `.setting-switch-*` primitives the
 * stylesheet defines for this page.
 */

type Goal = { id: string; title: string; goal: number; current: number; emoji: string };

const emptyNew = { title: "", goal: 10000, emoji: "🎯" };

export default function DonationsPage() {
  return (
    <OverlayTokenProvider overlayKey="donation-goal">
      <DonationsInner />
    </OverlayTokenProvider>
  );
}

function DonationsInner() {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", goal: 0, emoji: "🎯" });
  const [adding, setAdding] = useState(false);
  const [newForm, setNewForm] = useState(emptyNew);
  const [simAmount, setSimAmount] = useState("");

  const refresh = useCallback(async () => {
    try {
      setState(await api.getDonations());
    } catch {
      setError("載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const guard = async (fn: () => Promise<unknown>, failMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch {
      setError(failMessage);
    } finally {
      setBusy(false);
    }
  };

  const addGoal = () => {
    if (!newForm.title.trim() || newForm.goal <= 0) return;
    void guard(async () => {
      await api.addGoal(newForm);
      setNewForm(emptyNew);
      setAdding(false);
    }, "新增目標失敗");
  };

  const startEdit = (g: Goal) => {
    setEditingId(g.id);
    setEditForm({ title: g.title, goal: g.goal, emoji: g.emoji });
  };

  const saveEdit = (id: string) => {
    if (!editForm.title.trim() || editForm.goal <= 0) return;
    void guard(async () => {
      await api.updateGoal({ id, ...editForm });
      setEditingId(null);
    }, "儲存失敗");
  };

  const simulate = () => {
    const amount = parseInt(simAmount, 10);
    if (!Number.isFinite(amount) || amount <= 0) return;
    void guard(async () => {
      await api.simulateDonation(amount);
      setSimAmount("");
    }, "模擬斗內失敗");
  };

  const updateMeta = (partial: Record<string, unknown>) => {
    const merged = { ...state, ...partial };
    setState(merged);
    void api.updateDonationMeta(merged).catch(() => setError("儲存失敗"));
  };

  if (loading) return <Loading />;

  const goals: Goal[] = state?.goals ?? [];
  const totalReceived = state?.totalReceived ?? 0;
  const donorCount = state?.donorCount ?? 0;

  return (
    <div className="stack donation-goal-settings-stack">
      <div className="panel-head">
        <div>
          <div className="mini-label">目標管理</div>
          <h2>斗內進度</h2>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={() => setAdding((v) => !v)}
          disabled={busy}
        >
          <Plus size={15} /> {adding ? "收起" : "新增目標"}
        </button>
      </div>

      {error && <ErrorBox message={error} />}

      {adding && (
        <div className="donation-goal-create-form">
          <div className="donation-goal-create-head">
            <strong>新增斗內目標</strong>
            <button type="button" className="ghost-button" onClick={() => setAdding(false)} aria-label="關閉">
              <X size={15} />
            </button>
          </div>
          <div className="donation-goal-create-grid form-grid">
            <label className="field">
              <span>目標名稱</span>
              <input
                value={newForm.title}
                onChange={(e) => setNewForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="例如：新麥克風基金"
              />
            </label>
            <label className="field">
              <span>目標金額 (ZXC)</span>
              <input
                type="number"
                value={newForm.goal}
                onChange={(e) => setNewForm((f) => ({ ...f, goal: parseInt(e.target.value, 10) || 0 }))}
              />
            </label>
          </div>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={addGoal} disabled={busy || !newForm.title.trim()}>
              <Check size={15} /> 建立目標
            </button>
            <span className="settings-note">目標建立後會立刻出現在 OBS 疊加層可選項目中。</span>
          </div>
        </div>
      )}

      <div className="donation-goal-management-workspace">
        {/* ---------------------------------------------- goal list */}
        <div className="stack">
          <div className="panel">
            <div className="donation-goal-panel-head">
              <div>
                <div className="mini-label">斗內目標</div>
                <h2>{goals.length ? `${goals.length} 個目標` : "尚無目標"}</h2>
              </div>
            </div>

            {goals.length === 0 ? (
              <div className="commerce-admin-empty">
                <h2>還沒有斗內目標</h2>
                <p>按右上角「新增目標」建立第一個。</p>
              </div>
            ) : (
              <div className="donation-goal-management-list">
                {goals.map((g) => {
                  const pct = g.goal > 0 ? Math.min(100, Math.round((g.current / g.goal) * 100)) : 0;
                  return (
                    <div key={g.id} className="donation-goal-target-row">
                      {editingId === g.id ? (
                        <div className="donation-goal-create-grid form-grid">
                          <label className="field">
                            <span>名稱</span>
                            <input value={editForm.title} onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))} />
                          </label>
                          <label className="field">
                            <span>目標金額</span>
                            <input
                              type="number"
                              value={editForm.goal}
                              onChange={(e) => setEditForm((f) => ({ ...f, goal: parseInt(e.target.value, 10) || 0 }))}
                            />
                          </label>
                          <div className="action-row commerce-admin-wide">
                            <button type="button" className="primary-button" onClick={() => saveEdit(g.id)} disabled={busy}>
                              <Check size={14} /> 儲存
                            </button>
                            <button type="button" className="ghost-button" onClick={() => setEditingId(null)}>
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <span className="donation-goal-target-main">
                            <strong>
                              {g.emoji} {g.title}
                            </strong>
                            <span className="donation-goal-target-meta">
                              <span>ZXC {g.current.toLocaleString()}</span>
                              <span>目標 ZXC {g.goal.toLocaleString()}</span>
                            </span>
                            <span className="donation-goal-target-progress">
                              <span style={{ width: `${pct}%` }} />
                            </span>
                          </span>
                          <span className="action-row donation-goal-target-actions">
                            <span className={`commerce-admin-status ${pct >= 100 ? "status-active" : "status-archived"}`}>
                              <Target size={13} /> {pct}%
                            </span>
                            <button
                              type="button"
                              className="donation-goal-target-action is-edit"
                              onClick={() => startEdit(g)}
                              disabled={busy}
                            >
                              <Pencil size={14} /> 編輯
                            </button>
                            <button
                              type="button"
                              className="donation-goal-target-action is-delete"
                              onClick={() => void guard(() => api.deleteGoal(g.id), "刪除失敗")}
                              disabled={busy}
                            >
                              <Trash2 size={14} /> 刪除
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="panel">
            <div className="donation-goal-panel-head">
              <div>
                <div className="mini-label">測試</div>
                <h2>模擬斗內</h2>
              </div>
            </div>
            <p className="settings-note">
              會寫入一筆真實斗內紀錄並更新進度，用於上架前確認疊加層顯示正常。測試紀錄不會自動刪除。
            </p>
            <div className="action-row">
              <input
                type="number"
                value={simAmount}
                onChange={(e) => setSimAmount(e.target.value)}
                placeholder="輸入金額…"
                aria-label="模擬斗內金額"
              />
              <button type="button" className="primary-button" onClick={simulate} disabled={busy}>
                <Heart size={15} /> 捐！
              </button>
            </div>
          </div>
        </div>

        {/* ---------------------------------------------- preview + stats */}
        <div className="stack">
          <div className="panel donation-goal-management-preview-panel">
            <div className="donation-goal-panel-head">
              <div>
                <div className="mini-label">預覽</div>
                <h2>進度條外觀</h2>
              </div>
            </div>
            <div className="donation-goal-management-preview-stage">
              {goals.length === 0 ? (
                <div className="commerce-admin-empty">
                  <p>建立目標後這裡會顯示進度條外觀。</p>
                </div>
              ) : (
                <GoalCapsule goal={goals[0]} />
              )}
            </div>
            <p className="donation-goal-preview-percent">
              <span>
                {goals.length && goals[0].goal > 0
                  ? Math.min(100, Math.round((goals[0].current / goals[0].goal) * 100))
                  : 0}
                %
              </span>
              <small>第一個目標的目前進度</small>
            </p>
          </div>

          <div className="panel">
            <div className="donation-goal-panel-head">
              <div>
                <div className="mini-label">統計</div>
                <h2>本月斗內</h2>
              </div>
            </div>
            <dl className="donation-goal-amount-grid">
              <div>
                <dt className="mini-label">已收到</dt>
                <dd className="mini-value">ZXC {totalReceived.toLocaleString()}</dd>
              </div>
              <div>
                <dt className="mini-label">贊助者</dt>
                <dd className="mini-value">{donorCount}</dd>
              </div>
              <label className="field">
                <span>最低斗內金額</span>
                <input
                  type="number"
                  value={state?.minAmount ?? 0}
                  onChange={(e) => updateMeta({ minAmount: parseInt(e.target.value, 10) || 0 })}
                />
              </label>
            </dl>
          </div>

          <OverlayOutput title="斗內進度輸出" />
        </div>
      </div>
    </div>
  );
}

/** Mirrors the capsule the overlay draws, driven by CSS variables. */
function GoalCapsule({ goal }: { goal: Goal }) {
  const pct = goal.goal > 0 ? Math.min(100, Math.round((goal.current / goal.goal) * 100)) : 0;
  return (
    <div
      className="donation-goal-preview-capsule donation-goal-management-preview"
      style={{ ["--goal-management-progress" as string]: `${pct}%` }}
    >
      <span className="donation-goal-preview-fill" />
      <span className="donation-goal-preview-title">
        {goal.emoji} {goal.title}
      </span>
      <span className="donation-goal-preview-amount">
        ZXC {goal.current.toLocaleString()} / {goal.goal.toLocaleString()}
      </span>
    </div>
  );
}
