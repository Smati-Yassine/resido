"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Icon } from "./Icon";
import { useI18n } from "./I18nProvider";

export type ToastTone = "success" | "danger" | "info";

interface ToastInput {
  tone: ToastTone;
  text: string;
  /** Optional inline action, e.g. "Undo" after archiving. */
  action?: { label: string; run: () => void };
}

interface Toast extends ToastInput {
  id: number;
}

const TOAST_MS = 4500;
const ICON = { success: "check", danger: "alert", info: "info" } as const;

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

/** Bottom-right toast stack. Every action in the app reports its outcome here. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((x) => x.id !== id)), []);

  const push = useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setToasts((list) => [...list.slice(-3), { ...toast, id }]);
      setTimeout(() => dismiss(id), TOAST_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <span className="toast-icon">
              <Icon name={ICON[toast.tone]} size={16} strokeWidth={2.4} />
            </span>
            <span className="toast-text">{toast.text}</span>
            {toast.action && (
              <button
                type="button"
                className="btn btn-sm btn-link"
                onClick={() => {
                  dismiss(toast.id);
                  toast.action!.run();
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button
              type="button"
              className="icon-btn icon-btn-bare"
              aria-label={t.dismiss}
              onClick={() => dismiss(toast.id)}
            >
              <Icon name="close" size={14} strokeWidth={2.4} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error("useToast must be used inside <ToastProvider>");
  return push;
}
