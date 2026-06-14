"use client";

import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";

type ToastType = "success" | "error" | "info";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastCtx {
  show: (message: string, type?: ToastType) => void;
}

const Ctx = createContext<ToastCtx>({ show: () => {} });
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  let nextId = 0;

  const show = useCallback((message: string, type: ToastType = "success") => {
    const id = ++nextId;
    setItems(prev => [...prev, { id, type, message }]);
    setTimeout(() => setItems(prev => prev.filter(i => i.id !== id)), 3500);
  }, []);

  const remove = (id: number) => setItems(prev => prev.filter(i => i.id !== id));

  const iconMap = { success: CheckCircle2, error: XCircle, info: CheckCircle2 };
  const colorMap = { success: "border-green-200 bg-green-50 text-green-700", error: "border-red-200 bg-red-50 text-red-600", info: "border-blue-200 bg-blue-50 text-blue-700" };

  return (
    <Ctx.Provider value={{ show }}>
      {children}
      <div style={{ position: "fixed", top: "16px", right: "16px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px", pointerEvents: "none" }}>
        {items.map(item => {
          const Icon = iconMap[item.type];
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "center", gap: "10px", padding: "12px 16px",
              borderRadius: "10px", border: "1px solid", boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
              background: "#fff", pointerEvents: "auto", animation: "slideIn 0.3s ease",
              minWidth: "280px", maxWidth: "420px",
            }} className={colorMap[item.type]}>
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="flex-1 text-[14px] font-[500]">{item.message}</span>
              <button onClick={() => remove(item.id)} className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
    </Ctx.Provider>
  );
}
