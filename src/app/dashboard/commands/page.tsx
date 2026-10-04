"use client";

import { useState, useEffect } from "react";
import { Terminal, Plus, Trash2, Check, X, Pencil } from "lucide-react";
import { api } from "@/lib/api";

export default function CommandsPage() {
  const [commands, setCommands] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");
  const [response, setResponse] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ trigger: "", response: "" });

  const refresh = async () => {
    try {
      const r = await api.getCommands();
      setCommands(r.commands || []);
    } catch {
      setError("載入失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  const add = async () => {
    setError(null);
    try {
      const r = await api.addCommand({ trigger, response });
      setCommands(r.commands || []);
      setTrigger("");
      setResponse("");
    } catch (e: any) {
      setError(e?.message || "新增失敗（指令需為 !開頭英數，例如 !help）");
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    const r = await api.toggleCommand(id, !enabled).catch(() => null);
    if (r) setCommands(r.commands || []);
  };

  const remove = async (id: string) => {
    const r = await api.deleteCommand(id).catch(() => null);
    if (r) setCommands(r.commands || []);
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setEditForm({ trigger: c.trigger, response: c.response });
  };

  const saveEdit = async (id: string) => {
    setError(null);
    try {
      const r = await api.updateCommand({ id, ...editForm });
      setCommands(r.commands || []);
      setEditingId(null);
    } catch {
      setError("儲存失敗");
    }
  };

  if (loading) return <div className="p-8 text-center text-[var(--ic-ink-muted)]">載入中...</div>;

  return (
    <div className="max-w-[1080px]">
      <div className="mb-4 text-[13px] text-[var(--ic-ink-subtle)]">
        <a href="/dashboard" className="text-[var(--ic-primary)] no-underline">控制中心</a>
        <span className="mx-2 text-[var(--ic-ink-muted)]">/</span>
        <span className="text-[var(--ic-ink-muted)]">直播指令</span>
      </div>
      <div className="mb-6 grid gap-2">
        <h1 className="text-[34px] font-[500] leading-[1.12] text-[var(--ic-ink)]">直播指令</h1>
        <p className="max-w-[520px] text-[14px] leading-[1.6] text-[var(--ic-ink-muted)]">設定觀眾輸入指令時的自動回覆。僅保留基本觸發與回覆，不含抽獎與複雜流程。</p>
      </div>
      {error && <div className="mb-4 rounded-[var(--ic-radius-md)] border border-red-200 bg-red-50 p-3 text-[13px] text-red-600">{error}</div>}
      <div className="grid gap-3.5 rounded-[var(--ic-radius-lg)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-6">
        <div className="grid grid-cols-[180px_1fr_auto] gap-2 max-md:grid-cols-1">
          <input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="!help" className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none" />
          <input value={response} onChange={(e) => setResponse(e.target.value)} placeholder="回覆內容（最多500字）" className="rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] px-3 py-2.5 text-[14px] text-[var(--ic-ink)] outline-none" />
          <button onClick={add} className="flex min-h-[36px] items-center gap-1.5 rounded-[var(--ic-radius-md)] border border-transparent bg-[var(--ic-primary)] px-3.5 text-[13px] font-[500] text-white"><Plus className="h-4 w-4" /> 新增</button>
        </div>
        <div className="grid gap-2">
          {commands.length === 0 && <p className="py-6 text-center text-[14px] text-[var(--ic-ink-muted)]">尚無指令</p>}
          {commands.map((c: any) => (
            <div key={c.id} className="flex items-center gap-3 rounded-[var(--ic-radius-md)] border border-[var(--ic-hairline)] bg-[var(--ic-surface-1)] p-3">
              <Terminal className="h-4 w-4 flex-shrink-0 text-[var(--ic-ink-tertiary)]" />
              {editingId === c.id ? (
                <>
                  <input value={editForm.trigger} onChange={(e) => setEditForm((f) => ({ ...f, trigger: e.target.value }))} className="w-32 rounded border border-[var(--ic-hairline)] px-2 py-1 text-[13px]" />
                  <input value={editForm.response} onChange={(e) => setEditForm((f) => ({ ...f, response: e.target.value }))} className="flex-1 rounded border border-[var(--ic-hairline)] px-2 py-1 text-[13px]" />
                  <button onClick={() => saveEdit(c.id)} className="rounded bg-[var(--ic-primary)] px-2.5 py-1 text-[12px] text-white"><Check className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="rounded border border-[var(--ic-hairline)] px-2.5 py-1 text-[12px]"><X className="h-3.5 w-3.5" /></button>
                </>
              ) : (
                <>
                  <strong className="w-32 flex-shrink-0 text-[13px] text-[var(--ic-ink)]">{c.trigger}</strong>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ic-ink-muted)]">{c.response}</span>
                  <button onClick={() => toggle(c.id, c.enabled)} className={`rounded-full px-2.5 py-0.5 text-[11px] ${c.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.enabled ? "啟用" : "停用"}</button>
                  <button onClick={() => startEdit(c)} className="rounded p-1 text-[var(--ic-ink-tertiary)] hover:text-[var(--ic-ink)]"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(c.id)} className="rounded p-1 text-[var(--ic-ink-tertiary)] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
