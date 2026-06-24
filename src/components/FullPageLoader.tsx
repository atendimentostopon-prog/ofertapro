import React, { useState, useEffect } from 'react';
import { Zap, AlertCircle, RefreshCw, LogOut } from 'lucide-react';
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-0 text-slate-100 p-6 relative overflow-hidden">
      {/* Background Glows — ultra subtle */}
      <div className="absolute top-0 left-0 w-[400px] h-[400px] bg-brand-500/[0.02] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[400px] h-[400px] bg-brand-600/[0.02] rounded-full blur-[120px] pointer-events-none" />

      <div className="z-10 flex flex-col items-center max-w-sm w-full text-center space-y-6">
        
        {/* Brand Logo */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-md">
            <Zap className="w-6 h-6 text-white fill-white" />
          </div>
          <div>
            <span className="text-base font-bold text-white tracking-tight">Link Oferta</span>
          </div>
        </div>

        {/* Status Loading */}
        {!showTimeoutWarning ? (
          <div className="space-y-4">
            <div className="flex justify-center py-2">
              <div className="w-7 h-7 border-[3px] border-brand-500/15 border-t-brand-500 rounded-full animate-spin" />
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              {message}
            </p>
          </div>
        ) : (
          <div className="space-y-4 p-5 bg-surface-2 border border-white/[0.06] rounded-2xl animate-fade-in">
            <div className="flex justify-center text-amber-400">
              <AlertCircle className="w-7 h-7" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white tracking-tight">Está demorando mais que o esperado</h3>
              <p className="text-[11px] text-slate-400 leading-relaxed">
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
                className="w-full px-4 py-2.5 rounded-lg border border-white/[0.06] bg-surface-1 text-xs font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-200 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
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
