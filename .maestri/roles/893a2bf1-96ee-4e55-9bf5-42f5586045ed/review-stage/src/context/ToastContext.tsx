import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const DEFAULT_TOAST_MS = 4000;

const genId = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};

const TYPE_STYLES: Record<ToastType, { container: string; icon: React.ReactNode }> = {
  success: {
    container: 'border-success/20 text-success-ink bg-success-bg',
    icon: <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />,
  },
  error: {
    container: 'border-danger/25 text-danger-ink bg-danger-bg',
    icon: <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />,
  },
  warning: {
    container: 'border-warning/25 text-warning-ink bg-warning-bg',
    icon: <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />,
  },
  info: {
    container: 'border-info/20 text-info-ink bg-info-bg',
    icon: <Info className="w-4 h-4 text-info flex-shrink-0" />,
  },
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'success'): string => {
    const id = genId();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, DEFAULT_TOAST_MS);
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <div
        className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 max-w-sm w-[calc(100%-48px)] pointer-events-none"
        role="region"
        aria-label="Notificações"
        aria-live="polite"
      >
        {toasts.map(t => {
          const style = TYPE_STYLES[t.type];
          return (
            <div
              key={t.id}
              role={t.type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start justify-between gap-3 p-4 rounded-xl border shadow-lg bg-surface-0 flex-shrink-0 ${style.container}`}
              style={{
                animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              }}
            >
              <div className="flex items-start gap-3 min-w-0 flex-1">
                <span className="mt-0.5">{style.icon}</span>
                <span className="text-xs font-semibold leading-normal line-clamp-2">
                  {t.message}
                </span>
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                className="text-ink-tertiary hover:text-ink transition-colors p-1 -m-1 flex-shrink-0"
                aria-label="Fechar notificação"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast deve ser usado dentro de um ToastProvider');
  }
  return context;
};
