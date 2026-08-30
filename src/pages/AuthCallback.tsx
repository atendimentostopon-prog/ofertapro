import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { AuthLayout } from '../components/auth/AuthLayout';

/**
 * Valida que o parâmetro `next` é uma rota interna segura.
 * Evita open redirect (ex: ?next=https://site-malicioso.com).
 */
const getSafeNextPath = (searchParams: URLSearchParams): string => {
  const next = searchParams.get('next');
  if (next && next.startsWith('/') && !next.startsWith('//')) {
    // Rejeitar qualquer coisa que pareça URL absoluta disfarçada
    const disallowed = ['http', 'ftp', 'mailto', 'javascript'];
    if (!disallowed.some(p => next.toLowerCase().startsWith(p))) {
      return next;
    }
  }
  return '/dashboard';
};

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const handleCallback = async () => {
      try {
        const url = new URL(window.location.href);
        const params = url.searchParams;
        const code = params.get('code');
        const errorParam = params.get('error');
        const errorDescription = params.get('error_description');

        // Supabase pode retornar erro diretamente na URL (ex: acesso negado pelo usuário)
        if (errorParam) {
          console.warn('[AuthCallback] Supabase retornou erro na URL:', errorParam, errorDescription);
          if (active) {
            navigate(`/login?error=oauth_cancelled`, { replace: true });
          }
          return;
        }

        // Sem code e sem erro: acesso direto à rota sem parâmetros OAuth
        if (!code) {
          console.warn('[AuthCallback] Nenhum `code` encontrado na URL — redirecionando para login.');
          if (active) {
            navigate('/login?error=missing_oauth_code', { replace: true });
          }
          return;
        }

        // Com code: troca pelo token de sessão via PKCE
        console.log('[AuthCallback] Trocando authorization code por sessão...');
        const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (!active) return;

        if (exchangeError) {
          // Não loga o code completo por segurança
          console.error('[AuthCallback] Erro ao trocar code por sessão:', exchangeError.message);
          navigate('/login?error=oauth_callback', { replace: true });
          return;
        }

        if (data?.session) {
          console.log('[AuthCallback] Sessão criada com sucesso. Redirecionando...');
          const destination = getSafeNextPath(params);
          navigate(destination, { replace: true });
        } else {
          // Caso raro: exchangeCodeForSession não retornou erro mas também não retornou sessão
          // Verificar se o SDK já fez a troca automaticamente (detectSessionInUrl)
          const { data: { session: existingSession } } = await supabase.auth.getSession();
          if (!active) return;
          if (existingSession) {
            const destination = getSafeNextPath(params);
            navigate(destination, { replace: true });
          } else {
            console.error('[AuthCallback] exchangeCodeForSession não retornou sessão nem erro.');
            navigate('/login?error=oauth_callback', { replace: true });
          }
        }
      } catch (err: any) {
        if (!active) return;
        console.error('[AuthCallback] Exceção inesperada no callback:', err?.message);
        navigate('/login?error=oauth_callback', { replace: true });
      }
    };

    handleCallback();

    return () => {
      active = false;
    };
  }, [navigate]);

  return (
    <AuthLayout
      title="Concluindo o login…"
      description="Verificando suas credenciais e preparando seu painel."
      showFeatureHighlights={false}
    >
      {error ? (
        <div className="text-center space-y-4 py-4">
          <div className="w-16 h-16 rounded-2xl bg-danger-bg border border-danger/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-danger-ink" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-ink font-display">Não foi possível concluir</h3>
            <p className="text-xs text-ink-secondary leading-relaxed">{error}</p>
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
          <div className="w-8 h-8 border-[3px] border-mint-200 border-t-mint-500 rounded-full animate-spin" />
        </div>
      )}
    </AuthLayout>
  );
};

export default AuthCallback;
