import React, { useState, useEffect } from 'react';
import { AlertCircle, RefreshCw, LogOut } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FullPageLoaderProps {
  message?: string;
  timeoutMs?: number;
  onRetry?: () => void;
}

export const FullPageLoader: React.FC<FullPageLoaderProps> = ({
  message = "Carregando informações da plataforma...",
  timeoutMs = 8000,
  onRetry
}) => {
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowTimeoutWarning(true);
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [timeoutMs]);

  const handleDefaultRetry = () => {
    if (onRetry) {
      onRetry();
    } else {
      window.location.reload();
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.error("[FullPageLoader] Erro ao deslogar:", e);
    }
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-1 text-ink p-6 relative overflow-hidden">
      <div className="z-10 flex flex-col items-center max-w-sm w-full text-center space-y-6">

        {/* Brand Logo */}
        <div className="flex flex-col items-center">
          <img
            src="/brand/logo-primary.png"
            alt="Aflyo"
            className="h-9 w-auto select-none"
            draggable={false}
          />
        </div>

        {/* Status Loading */}
        {!showTimeoutWarning ? (
          <div className="space-y-4">
            <div className="flex justify-center py-2">
              <div className="w-7 h-7 border-[3px] border-line border-t-mint-500 rounded-full animate-spin" />
            </div>
            <p className="text-xs text-ink-secondary leading-relaxed">
              {message}
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-5 bg-surface-0 border border-line rounded-2xl shadow-md animate-fade-in">
            <div className="flex justify-center text-warning-ink">
              <AlertCircle className="w-7 h-7" />
            </div>

            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-ink tracking-tight">Está demorando mais que o esperado</h3>
              <p className="text-[11px] text-ink-secondary leading-relaxed">
                A conexão com o servidor está instável. Você pode tentar novamente ou voltar ao login.
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={handleDefaultRetry}
                className="w-full btn-gradient flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>

              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 rounded-md border border-line bg-surface-0 text-xs font-medium text-ink-secondary hover:bg-surface-1 hover:text-ink transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Sair e voltar ao Login
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FullPageLoader;
