"use client";

import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// Helper to safely stringify any message, including FastAPI 422 error arrays/objects
function formatToastMessage(msg: unknown): string {
  if (msg === null || msg === undefined) return "";
  if (typeof msg === "string") return msg;
  if (Array.isArray(msg)) {
    return msg
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const loc = Array.isArray((item as any).loc)
            ? (item as any).loc.filter((x: any) => x !== "body").join(".")
            : "";
          const detail = (item as any).msg || (item as any).message || JSON.stringify(item);
          return loc ? `${loc}: ${detail}` : detail;
        }
        return String(item);
      })
      .join("; ");
  }
  if (typeof msg === "object") {
    if ("detail" in (msg as any)) {
      return formatToastMessage((msg as any).detail);
    }
    if ("message" in (msg as any)) {
      return String((msg as any).message);
    }
    try {
      return JSON.stringify(msg);
    } catch {
      return String(msg);
    }
  }
  return String(msg);
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";

interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  toast: (message: any, type?: ToastType) => void;
  success: (message: any) => void;
  error: (message: any) => void;
  info: (message: any) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────
const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_CONFIG: Record<ToastType, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  success: { icon: <CheckCircle2 size={16} />, color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.3)"  },
  error:   { icon: <AlertCircle  size={16} />, color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "rgba(239,68,68,0.3)"  },
  info:    { icon: <Info         size={16} />, color: "#00f5ff", bg: "rgba(0,245,255,0.08)",   border: "rgba(0,245,255,0.25)" },
};

// ─── Provider ─────────────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback((message: any, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random()}`;
    const safeMessage = formatToastMessage(message);
    setToasts((t) => [...t, { id, type, message: safeMessage }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const success = useCallback((msg: any) => toast(msg, "success"), [toast]);
  const error   = useCallback((msg: any) => toast(msg, "error"),   [toast]);
  const info    = useCallback((msg: any) => toast(msg, "info"),    [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, info }}>
      {children}
      {/* Toast container */}
      <div className="fixed top-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map((t) => {
            const cfg = TOAST_CONFIG[t.type];
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, x: 60, scale: 0.95 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 60, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-2xl pointer-events-auto min-w-72 max-w-sm"
                style={{
                  background: cfg.bg,
                  border: `1px solid ${cfg.border}`,
                  backdropFilter: "blur(20px)",
                  boxShadow: `0 8px 32px rgba(0,0,0,0.3), 0 0 24px ${cfg.color}20`,
                }}
              >
                <span style={{ color: cfg.color }} className="shrink-0">{cfg.icon}</span>
                <span className="text-white/90 text-sm font-medium flex-1">{t.message}</span>
                <button
                  onClick={() => dismiss(t.id)}
                  className="text-white/30 hover:text-white/70 transition-colors shrink-0"
                >
                  <X size={13} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
