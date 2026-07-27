import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const timeout = setTimeout(() => {
      if (!active) return;
      setError('Tempo esgotado ao concluir o login. Tente novamente.');
    }, 6000);

    const tryFinish = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        if (session) {
          clearTimeout(timeout);
          navigate('/dashboard', { replace: true });
        }
      } catch (err: any) {
        console.error('Erro no callback OAuth:', err);
        if (!active) return;
        clearTimeout(timeout);
        setError(err.message || 'Erro ao processar login.');
      }
    };

    tryFinish();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === 'SIGNED_IN' && session) {
        clearTimeout(timeout);
        navigate('/dashboard', { replace: true });
      }
    });

    return () => {
      active = false;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [navigate]);

  return (
    <AuthLayout
      title="Concluindo o login…"
      description="Verificando suas credenciais e preparando seu painel."
      showFloatingDecor={false}
      showFeatureHighlights={false}
    >
      {error ? (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-red-400" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-white">Não foi possível concluir</h3>
            <p className="text-xs text-slate-400 leading-relaxed">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { replace: true })}
            className="btn-gradient px-5 py-2 text-xs font-semibold"
          >
            Voltar ao login
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-[3px] border-brand-500/25 border-t-brand-500 rounded-full animate-spin" />
        </div>
      )}
    </AuthLayout>
  );
};

export default AuthCallback;
