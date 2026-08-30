import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callAdminApi, AdminApiError } from '../lib/admin-api';
import { nextPhaseFromAal, type AuthPhase } from '../lib/auth-state';

type Identity = { adminId: string; email: string; roleKeys: string[]; permissions: string[] };
type Ctx = {
  phase: AuthPhase;
  identity: Identity | null;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('resolving');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const resolve = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPhase('anon'); setIdentity(null); return; }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const outcome = nextPhaseFromAal(true, {
        currentLevel: (aal?.currentLevel as 'aal1' | 'aal2' | null) ?? null,
        nextLevel: (aal?.nextLevel as 'aal1' | 'aal2' | null) ?? null,
      });
      if (outcome === 'needs_mfa_enroll') { setPhase('needs_mfa_enroll'); return; }
      if (outcome === 'needs_mfa_challenge') { setPhase('needs_mfa_challenge'); return; }
      try {
        const who = await callAdminApi<Identity>('session', 'whoami');
        setIdentity(who);
        setPhase('ready');
      } catch (e) {
        if (e instanceof AdminApiError && (e.code === 'forbidden' || e.code === 'unauthenticated')) {
          setIdentity(null);
          setPhase('not_admin');
        } else {
          setError(e instanceof Error ? e.message : 'Erro ao validar acesso.');
          setPhase('not_admin');
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    resolve();
    const { data } = supabase.auth.onAuthStateChange(() => { resolve(); });
    return () => data.subscription.unsubscribe();
  }, [resolve]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIdentity(null);
    setPhase('anon');
  }, []);

  return (
    <AdminAuthContext.Provider value={{ phase, identity, error, refresh: resolve, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): Ctx {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth fora do AdminAuthProvider');
  return ctx;
}
