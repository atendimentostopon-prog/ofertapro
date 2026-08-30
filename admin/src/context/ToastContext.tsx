import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: string; message: string; kind: ToastKind };

// useToast() devolve a funcao toast(message, kind) direto (ver plano Task 11).
const ToastContext = createContext<((message: string, kind?: ToastKind) => void) | undefined>(undefined);

const DISMISS_MS = 4000;

const KIND_STYLES: Record<ToastKind, string> = {
  success: 'border-success/25 bg-success-bg text-success-ink',
  error: 'border-danger/25 bg-danger-bg text-danger-ink',
  info: 'border-info/20 bg-info-bg text-info-ink',
};

function genId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, kind: ToastKind = 'success') => {
    const id = genId();
    setToasts((prev) => [...prev, { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex w-[calc(100%-48px)] max-w-sm flex-col gap-3"
        role="region"
        aria-label="Notificacoes"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`rounded-xl border p-4 text-xs font-semibold leading-normal shadow-lg ${KIND_STYLES[t.kind]}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (message: string, kind?: ToastKind) => void {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast fora do ToastProvider');
  return ctx;
}
