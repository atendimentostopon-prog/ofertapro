import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthService } from './services/AuthService';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Offers from './pages/Offers';
import NewOfferPage from './pages/NewOfferPage';
import Channels from './pages/Channels';
import History from './pages/History';
import Settings from './pages/Settings';
import Feedbacks from './pages/Feedbacks';
import PublicPage from './pages/PublicPage';
import RedirectPage from './pages/RedirectPage';
import ProtectedRoute from './components/ProtectedRoute';
import AdminDashboard from './pages/AdminDashboard';
import { UserProvider } from './context/UserContext';
import { ToastProvider } from './context/ToastContext';
import { supabase } from './lib/supabase';
import DebugSupabase from './pages/DebugSupabase';
import PoliticaPrivacidade from './pages/PoliticaPrivacidade';
import TermosUso from './pages/TermosUso';
import PoliticaCookies from './pages/PoliticaCookies';
import CookieBanner from './components/CookieBanner';
import FullPageLoader from './components/FullPageLoader';

const isPublicRoute = () => {
  const path = window.location.pathname;
  const privatePaths = ['/dashboard', '/offers', '/channels', '/history', '/settings', '/feedbacks'];
  return !privatePaths.some(p => path === p || path.startsWith(p + '/'));
};

/**
 * Limpa todas as chaves de sessão do Supabase do localStorage.
 * Chamado automaticamente quando detectamos sessão corrompida/inválida.
 */
const clearSupabaseStorage = () => {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('sb-') ||
        key.startsWith('supabase') ||
        key.includes('linkoferta') ||
        key.includes('ofertapro')
      )) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.warn('[BOOT] Storage Supabase limpo automaticamente.');
  } catch (e) {
    console.error('[BOOT] Erro ao limpar storage:', e);
  }
};

const App: React.FC = () => {
  console.log("[BOOT] main render");
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<any>(null);

  useEffect(() => {
    console.time("[BOOT] total");
    console.log("[BOOT] App mounted");
    console.log("[BOOT] Checking Supabase session...");

    let active = true;

    // Timeout de 5 segundos para a verificação de sessão inicial
    const timeoutId = setTimeout(() => {
      if (active && loading) {
        console.warn("[BOOT] getSession timeout reached! Forcing loading to false.");
        try { console.timeEnd("[BOOT] getSession"); } catch {}
        try { console.timeEnd("[BOOT] total"); } catch {}
        if (!isPublicRoute()) {
          setBootError(new Error("Falha ao verificar sessão."));
        }
        setLoading(false);
      }
    }, 5000);

    const initAuth = async () => {
      try {
        console.time("[BOOT] getSession");
        console.log("[BOOT] before getSession");

        const sessionResult = await Promise.race([
          AuthService.getSession(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Timeout em getSession")), 5000)
          )
        ]);

        try { console.timeEnd("[BOOT] getSession"); } catch {}
        console.log("[BOOT] after getSession", { hasSession: !!sessionResult });

        if (active) {
          clearTimeout(timeoutId);
          setSession(sessionResult);
          setLoading(false);
        }
      } catch (err: any) {
        console.error("[BOOT] Error fetching session:", err);
        try { console.timeEnd("[BOOT] getSession"); } catch {}
        try { console.timeEnd("[BOOT] total"); } catch {}

        if (active) {
          clearTimeout(timeoutId);

          // Detectar sessão corrompida e limpar automático
          const isCorruptSession =
            err?.message?.includes('Timeout') ||
            err?.message?.includes('token') ||
            err?.message?.includes('JWT') ||
            err?.name === 'AuthRetryableFetchError' ||
            err?.status === 401;

          if (isCorruptSession) {
            console.warn('[BOOT] Sessão corrompida detectada — limpando storage...');
            try { await supabase.auth.signOut(); } catch {}
            clearSupabaseStorage();
            setSession(null);
            setLoading(false);
            // Não redireciona automaticamente — deixa o UserContext/Router lidar
            return;
          }

          if (!isPublicRoute()) {
            setBootError(new Error("Falha ao verificar sessão."));
          }
          setLoading(false);
        }
      }
    };

    initAuth();

    let subscription: any;
    try {
      subscription = AuthService.onAuthStateChange(sessionResult => {
        console.log("[BOOT] Auth state changed, new session:", !!sessionResult);
        if (active) {
          setSession(sessionResult);
          // Se o Supabase emitir SIGNED_OUT, garante que loading termina
          if (!sessionResult) {
            setLoading(false);
          }
        }
      });
    } catch (err) {
      console.error("[BOOT] Error subscribing to auth state changes:", err);
    }

    return () => {
      active = false;
      clearTimeout(timeoutId);
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
      }
    };
  }, []);


  const handleLogout = async () => {
    await AuthService.signOut();
  };

  if (bootError && !isPublicRoute()) {

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#070A12] p-6 text-center animate-fade-in text-[#F8FAFC]">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6 text-red-400 shadow-lg text-2xl font-bold">
          ⚠️
        </div>
        <h2 className="text-xl font-bold text-white tracking-tight">Não foi possível carregar o Link Oferta</h2>
        <p className="text-sm text-[#94A3B8] mt-2 max-w-sm leading-relaxed">
          {bootError.message || "O carregamento demorou mais que o esperado. Você pode tentar novamente ou limpar a sessão local."}
        </p>
        <p className="text-xs text-[#64748B] mt-2 max-w-xs leading-normal">
          Você pode tentar novamente ou redefinir suas credenciais para tentar destravar o aplicativo.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            onClick={() => window.location.reload()}
            className="btn-gradient px-6 py-2.5 font-bold text-sm"
          >
            Tentar novamente
          </button>
          <button
            onClick={async () => {
              try {
                await supabase.auth.signOut();
              } catch (e) {
                console.error("[BOOT] Erro ao deslogar:", e);
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
              window.location.href = '/login';
            }}
            className="btn-secondary px-6 py-2.5 font-semibold text-sm"
          >
            Sair e ir para Login
          </button>
        </div>
      </div>
    );
  }
  if (loading) {
    return (
      <FullPageLoader message="Verificando sessão com o servidor..." />
    );
  }

  const isLoggedIn = !!session;

  return (
    <ToastProvider>
      <UserProvider onBootError={(err) => setBootError(err)}>
        <BrowserRouter>
        <Routes>
          {/* Root Redirect */}
          <Route path="/" element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} replace />} />

          {/* Diagnostic route */}
          <Route path="/debug-boot" element={
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#070A12] p-6 text-center text-[#F8FAFC]">
              <h2 className="text-xl font-bold text-white mb-2">React carregou com sucesso.</h2>
              <p className="text-sm text-[#94A3B8]">Esta é uma rota pública de diagnóstico que ignora o Supabase e o UserContext.</p>
            </div>
          } />

          <Route path="/debug-supabase" element={<DebugSupabase />} />

          {/* Legal Pages */}
          <Route path="/politica-de-privacidade" element={<PoliticaPrivacidade />} />
          <Route path="/termos-de-uso" element={<TermosUso />} />
          <Route path="/politica-de-cookies" element={<PoliticaCookies />} />

          {/* Public links */}
          <Route path="/o/:shortCode" element={<RedirectPage />} />
          <Route path="/l/:id" element={<RedirectPage />} />
          <Route path="/r/:id" element={<RedirectPage />} />
          <Route path="/:username" element={<PublicPage />} />
          <Route path="/u/:username" element={<PublicPage />} />

          {/* Auth */}
          <Route
            path="/login"
            element={<Login onLogin={() => {}} />}
          />

          {/* Protected routes */}
          <Route element={<ProtectedRoute isLoggedIn={isLoggedIn} onLogout={handleLogout} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/offers" element={<Offers />} />
            <Route path="/offers/new" element={<NewOfferPage />} />
            <Route path="/channels" element={<Channels />} />
            <Route path="/history" element={<History />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/feedbacks" element={<Feedbacks />} />
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to={isLoggedIn ? '/dashboard' : '/login'} replace />} />
        </Routes>
        <CookieBanner />
        </BrowserRouter>
      </UserProvider>
    </ToastProvider>
  );
};

export default App;
