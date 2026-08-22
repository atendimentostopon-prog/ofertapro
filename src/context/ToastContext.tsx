import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface ToastContextType {
  toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    
    // Auto-remove após 4 segundos
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast container */}
      <div className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-[calc(100%-40px)] pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl border shadow-lg backdrop-blur-md transition-all duration-300 transform translate-y-0 scale-100 flex-shrink-0 ${
              t.type === 'error'
                ? 'border-danger/30 text-danger-ink bg-danger-bg'
                : t.type === 'success'
                ? 'border-mint-300 text-success-ink bg-success-bg'
                : 'border-line-strong text-ink bg-surface-0'
            }`}
            style={{
              animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
            }}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              {t.type === 'error' ? (
                <AlertCircle className="w-4 h-4 text-danger flex-shrink-0" />
              ) : t.type === 'success' ? (
                <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
              ) : (
                <Info className="w-4 h-4 text-info flex-shrink-0" />
              )}
              <span className="text-[12px] font-semibold leading-normal truncate-2-lines">{t.message}</span>
            </div>
            <button
              onClick={() => removeToast(t.id)}
              className="ml-3 text-ink-tertiary hover:text-ink transition-colors p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
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
