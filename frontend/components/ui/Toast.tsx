"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  push: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const iconFor: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success-fg" aria-hidden="true" />,
  error: <AlertCircle className="h-4 w-4 text-critical-fg" aria-hidden="true" />,
  info: <Info className="h-4 w-4 text-info-fg" aria-hidden="true" />,
};

const borderFor: Record<ToastKind, string> = {
  success: "border-success-border",
  error: "border-critical-border",
  info: "border-info-border",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-2.5 rounded-md border bg-surface-raised px-4 py-3 text-sm text-text-primary shadow-lg min-w-[260px] max-w-sm",
              borderFor[t.kind],
            )}
            role="status"
          >
            {iconFor[t.kind]}
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((cur) => cur.filter((x) => x.id !== t.id))}
              aria-label="Dismiss notification"
              className="text-text-tertiary hover:text-text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
