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
      // Limpar localStorage para evitar travamento de estados
      localStorage.clear();
      sessionStorage.clear();
    } catch (e) {
      console.error(e);
    }
    window.location.href = '/login';
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#070A12] text-[#F8FAFC] p-6 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#7C3AED]/5 rounded-full blur-3xl opacity-50 transform -translate-x-1/4 -translate-y-1/4 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#6366F1]/5 rounded-full blur-3xl opacity-40 transform translate-x-1/4 translate-y-1/4 pointer-events-none" />

      <div className="z-10 flex flex-col items-center max-w-sm w-full text-center space-y-6">
        
        {/* Brand Logo Animation */}
        <div className="flex flex-col items-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#7C3AED] via-purple-650 to-pink-500 flex items-center justify-center shadow-xl shadow-indigo-950/20 animate-pulse">
            <Zap className="w-7 h-7 text-white fill-white" />
          </div>
          <div>
            <span className="text-lg font-bold text-white tracking-tight">Link Oferta</span>
            <p className="text-[9px] text-[#64748B] font-black uppercase tracking-widest mt-0.5">SaaS de Afiliados</p>
          </div>
        </div>

        {/* Status Loading */}
        {!showTimeoutWarning ? (
          <div className="space-y-4">
            {/* Smooth spinner */}
            <div className="flex justify-center py-2">
              <div className="w-9 h-9 border-3 border-indigo-500/10 border-t-[#7C3AED] rounded-full animate-spin" />
            </div>
            <p className="text-xs font-semibold text-[#94A3B8] leading-relaxed animate-pulse">
              {message}
            </p>
          </div>
        ) : (
          <div className="space-y-5 p-5 bg-[#101827]/60 border border-white/[0.06] rounded-3xl animate-scale-up">
            <div className="flex justify-center text-amber-500">
              <AlertCircle className="w-8 h-8" />
            </div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white tracking-tight">Está demorando mais que o esperado</h3>
              <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                A resposta do servidor do Supabase ou a sua conexão está instável. Deseja tentar novamente ou voltar ao login?
              </p>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleDefaultRetry}
                className="w-full btn-gradient flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Tentar novamente
              </button>
              
              <button
                onClick={handleSignOut}
                className="w-full px-4 py-2.5 rounded-xl border border-white/5 bg-[#070A12] text-xs font-bold text-[#94A3B8] hover:bg-white/5 hover:text-white transition-all flex items-center justify-center gap-1.5"
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
