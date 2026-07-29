"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastType = "info" | "success" | "error" | "warning";
interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

const ToastContext = createContext<{
  toast: (message: string, type?: ToastType) => void;
} | null>(null);

let toastId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = ++toastId;
    setItems((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((i) => i.id !== id));
    }, 3000);
  }, []);

  const colors: Record<ToastType, string> = {
    info: "var(--win-accent)",
    success: "var(--win-success)",
    error: "var(--win-danger)",
    warning: "var(--win-warning)",
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 100,
          display: "flex",
          flexDirection: "column",
          gap: 8,
          alignItems: "center",
          pointerEvents: "none",
        }}
      >
        {items.map((item) => (
          <div
            key={item.id}
            className="win-card"
            style={{
              padding: "10px 16px",
              minWidth: 240,
              maxWidth: 480,
              borderLeft: `3px solid ${colors[item.type]}`,
              animation: "toast-in 0.2s ease",
              pointerEvents: "auto",
            }}
          >
            <span style={{ fontSize: 14, color: "var(--win-text)" }}>{item.message}</span>
          </div>
        ))}
      </div>
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast 必须在 ToastProvider 内使用");
  return ctx.toast;
}
