import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import Layout from './Layout';
import { useUser } from '../context/UserContext';
import FullPageLoader from './FullPageLoader';
import { supabase } from '../lib/supabase';
import { useSubscription } from '../hooks/useSubscription';

interface ProtectedRouteProps {
  isLoggedIn: boolean;
  children?: React.ReactNode;
  onLogout: () => void;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ isLoggedIn, children, onLogout }) => {
  const { user, loading, authUser, profileLoadFailed, refreshProfile, isAdmin } = useUser();
  const { data: subscription, loading: subLoading } = useSubscription();
  const location = useLocation();
  const [retrying, setRetrying] = React.useState(false);

  // 1. Se o App.tsx ou o UserContext identificou falta de sessão do Supabase, redireciona imediatamente
  if (!isLoggedIn && !loading && !authUser) {
    console.log("[ProtectedRoute] Sem sessão ativa no App.tsx, redirecionando para login");
    return <Navigate to="/login" replace />;
  }

  // 2. Se o contexto de usuário ainda está carregando o perfil do banco de dados
  if (loading || retrying) {
    console.log("[ProtectedRoute] Perfil de usuário carregando no UserContext...");
    return (
      <FullPageLoader message="Carregando perfil e preferências do usuário..." />
    );
  }

  // 3. Gate de paywall: free sem subscription e sem admin → /pricing
  // /integrations ficava liberada aqui antes -- deixava o Bot (WhatsApp/
  // Telegram) e as chaves de API acessíveis pra qualquer conta sem plano,
  // sem nenhum enforcement por trás (bug real reportado em 2026-08-27: conta
  // nova sem assinatura conseguia ver e usar a aba de conectar bot).
  //
  // Exceção: contas com trial expirado/cancelado (accountStatus 'expired' ou
  // 'canceled') NÃO são redirecionadas. O sistema de trial agora é o dono da
  // mensagem de estado expirado dentro do app (card no Dashboard, barra no
  // Layout) e os dados continuam visíveis e editáveis; um redirect duro pra
  // /pricing deixaria essa UI inalcançável.
  const ALLOWED_WHEN_UNPAID = ['/pricing', '/settings', '/auth/callback'];
  const isAllowedRoute = ALLOWED_WHEN_UNPAID.some(r => location.pathname.startsWith(r));
  const trialExpired = user?.accountStatus === 'expired' || user?.accountStatus === 'canceled';

  if (
    !subLoading &&
    !isAdmin &&
    user?.plan === 'free' &&
    !subscription &&
    !isAllowedRoute &&
    !trialExpired
  ) {
    return <Navigate to="/pricing" replace />;
  }

  // 4. Se existe sessão do auth, mas o perfil falhou ou não carregou
  if ((isLoggedIn || authUser) && (profileLoadFailed || !user)) {
    console.warn("[ProtectedRoute] Usuário autenticado mas falha ao carregar perfil do banco.");
    
    const handleRetry = async () => {
      setRetrying(true);
      try {
        await refreshProfile();
      } catch (e) {
        console.error("Erro ao tentar refresh do perfil:", e);
      } finally {
        setRetrying(false);
      }
    };

    const handleSignOut = async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error("Erro no signOut:", e);
      }
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('ofertapro') || key.includes('linkoferta'))) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
      } catch (e) {
        console.error(e);
      }
      localStorage.clear();
      sessionStorage.clear();
      onLogout();
    };

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-surface-1 p-6 text-center text-ink">
        <div className="w-16 h-16 rounded-2xl bg-danger-bg border border-danger/25 flex items-center justify-center mb-6 text-danger-ink shadow-sm text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-ink tracking-tight font-display">Erro ao carregar seu perfil</h2>
        <p className="text-sm text-ink-secondary mt-2 max-w-sm leading-relaxed">
          Não conseguimos carregar as informações do seu perfil do banco de dados. Verifique sua conexão.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            onClick={handleRetry}
            className="btn-gradient px-6 py-2.5 font-bold text-sm"
          >
            Tentar novamente
          </button>
          <button
            onClick={handleSignOut}
            className="btn-secondary px-6 py-2.5 font-semibold text-sm"
          >
            Sair e entrar novamente
          </button>
        </div>
      </div>
    );
  }

  // 5. Fluxo normal: renderiza o layout com o dashboard ou outra página privada
  return (
    <Layout onLogout={onLogout}>
      <Outlet />
    </Layout>
  );
};

export default ProtectedRoute;
