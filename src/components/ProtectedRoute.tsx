import React from 'react';
import { Navigate } from 'react-router-dom';
import Layout from './Layout';
import { useUser } from '../context/UserContext';

interface ProtectedRouteProps {
  isLoggedIn: boolean;
  children: React.ReactNode;
  onLogout: () => void;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ isLoggedIn, children, onLogout }) => {
  const { user, loading } = useUser();

  // 1. Se o App.tsx já identificou falta de sessão do Supabase, redireciona imediatamente
  if (!isLoggedIn) {
    console.log("[ProtectedRoute] Sem sessão ativa no App.tsx, redirecionando para login");
    return <Navigate to="/login" replace />;
  }

  // 2. Se o contexto de usuário ainda está carregando o perfil do banco de dados
  if (loading) {
    console.log("[ProtectedRoute] Perfil de usuário carregando no UserContext...");
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#070A12]">
        <div className="w-8 h-8 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  // 3. Se o carregamento acabou e não temos o usuário resolvido (nem mesmo o fallback)
  if (!user) {
    console.warn("[ProtectedRoute] Carregamento concluído mas nenhum usuário/fallback resolvido. Indo para login.");
    return <Navigate to="/login" replace />;
  }

  // 4. Fluxo normal: renderiza o layout com o dashboard ou outra página privada
  return (
    <Layout onLogout={onLogout}>
      {children}
    </Layout>
  );
};

export default ProtectedRoute;
