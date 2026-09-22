import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { User as AuthUser } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { resolveAccountPlan, type Subscription } from '../lib/subscription';
import type { User } from '../types';

interface UserContextType {
  user: User | null;
  authUser: AuthUser | null;
  loading: boolean;
  isAdmin: boolean;
  profileError: Error | null;
  profileLoadFailed: boolean;
  refreshProfile: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
  subscription: Subscription | null;
  subscriptionLoading: boolean;
  subscriptionError: Error | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);
const asError = (error: unknown) => error instanceof Error ? error : new Error('Não foi possível atualizar os dados da conta.');

export const UserProvider: React.FC<{
  children: React.ReactNode;
  onBootError?: (error: Error) => void;
}> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [subscriptionError, setSubscriptionError] = useState<Error | null>(null);
  const [subscriptionLoading, setSubscriptionLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);
  const userId = authUser?.id;
  const email = authUser?.email || '';

  useEffect(() => {
    let active = true;
    let authEventReceived = false;
    // Do not await Supabase queries in this callback: it holds the auth lock.
    const { data: { subscription: listener } } = supabase.auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (!active) return;
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) setProfileError(asError(error));
      setAuthUser(data.session?.user ?? null);
      setAuthLoading(false);
    }).catch(error => {
      if (!active || authEventReceived) return;
      setProfileError(asError(error));
      setAuthLoading(false);
    });
    return () => { active = false; listener.unsubscribe(); };
  }, []);

  const createMinimalProfile = async (userId: string, email: string): Promise<User | null> => {
    // Remove pontos/sinais de e-mail (nome.sobrenome+tag@...) antes de virar
    // sugestão de slug público -- "joao.silva" vira "joaosilva", não fica com
    // cara de endereço de e-mail truncado na vitrine pública.
    const defaultUsername = (email.split('@')[0] || 'usuario').replace(/[.+]/g, '');
    const uniqueUsername = `${defaultUsername}_${userId.substring(0, 4)}`;
    const minimalPayload = {
      id: userId,
      email: email,
      full_name: 'Usuário',
      preferred_name: 'Usuário',
      username: uniqueUsername.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
      public_url: uniqueUsername.toLowerCase().replace(/[^a-z0-9._-]/g, ''),
      is_public_active: false,
      public_page_created: false,
      public_theme: 'default',
      onboarded: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    console.log(`[BOOT][UserContext] Criando perfil mínimo para o usuário ID: ${userId}`);
    const { data, error } = await supabase
      .from('profiles')
      .insert(minimalPayload)
      .select()
      .single();

    if (error) {
      console.error('[BOOT][UserContext] Erro ao criar perfil mínimo:', error);
      throw error;
    }

    if (data) {
      console.log('[BOOT][UserContext] Perfil mínimo criado com sucesso.');
      return {
        id: data.id,
        full_name: data.full_name || 'Usuário',
        email: email,
        avatar_url: data.avatar_url,
        username: data.username || '',
        plan: (data.plan || 'free') as any,
        publicUrl: data.public_url || data.username || '',
        bio: data.bio || '',
        joinedAt: data.created_at || data.joined_at || new Date().toISOString(),
        onboarded: data.onboarded ?? false,
        accountStatus: data.account_status ?? undefined,
        trialEndsAt: data.trial_ends_at ?? undefined,
        isPublicActive: data.is_public_active ?? false,
        publicName: data.public_name || data.full_name || 'Usuário',
        publicAvatarUrl: data.public_avatar_url || data.avatar_url,
        public_page_active: data.public_page_active ?? true,
        public_page_created: data.public_page_created ?? false,
        public_display_name: data.public_display_name || '',
        public_avatar_url: data.public_avatar_url || '',
        public_theme: data.public_theme || 'default',
        preferred_name: data.preferred_name || '',
        phone: data.phone || '',
        whatsapp_group_url: data.whatsapp_group_url || '',
        telegram_group_url: data.telegram_group_url || '',
        discord_group_url: data.discord_group_url || '',
      } as User;
    }
    return null;
  };


  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const [profileResult, subscriptionResult, adminResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).abortSignal(controller.signal).maybeSingle(),
        supabase.from('subscriptions').select('*').eq('user_id', userId)
          .in('status', ['active', 'past_due']).order('created_at', { ascending: false })
          .limit(1).abortSignal(controller.signal).maybeSingle(),
        supabase.rpc('is_current_user_admin').abortSignal(controller.signal),
      ]);
      if (requestRef.current !== controller) return;
      if (profileResult.error) throw profileResult.error;
      const profile = profileResult.data;
      if (!profile) {
        const created = await createMinimalProfile(userId, email);
        if (requestRef.current !== controller) return;
        if (!created) throw new Error('Seu perfil ainda não está disponível. Tente novamente.');
        setUser(created);
        setProfileError(null);
        setSubscriptionError(null);
        return;
      }
      // A failed request is not evidence that the account has no subscription.
      if (subscriptionResult.error) throw subscriptionResult.error;
      const nextSubscription = subscriptionResult.data as Subscription | null;
      const account = resolveAccountPlan(profile, nextSubscription);
      const nextUser: User = {
        id: profile.id, email,
        full_name: profile.full_name || 'Usuário',
        avatar_url: profile.avatar_url,
        username: profile.username || '',
        plan: account.plan,
        accountStatus: account.accountStatus,
        trialEndsAt: profile.trial_ends_at ?? undefined,
        publicUrl: profile.public_url || profile.username || '',
        bio: profile.bio || '',
        joinedAt: profile.created_at || profile.joined_at || '',
        onboarded: profile.onboarded ?? false,
        isPublicActive: profile.is_public_active ?? false,
        publicName: profile.public_name || profile.full_name || 'Usuário',
        publicAvatarUrl: profile.public_avatar_url || profile.avatar_url,
        public_page_active: profile.public_page_active ?? true,
        public_page_created: profile.public_page_created ?? false,
        public_display_name: profile.public_display_name || '',
        public_avatar_url: profile.public_avatar_url || '',
        public_theme: profile.public_theme || 'default',
        preferred_name: profile.preferred_name || '',
        phone: profile.phone || '',
        whatsapp_group_url: profile.whatsapp_group_url || '',
        telegram_group_url: profile.telegram_group_url || '',
        discord_group_url: profile.discord_group_url || '',
      };
      setUser(previous => JSON.stringify(previous) === JSON.stringify(nextUser) ? previous : nextUser);
      setSubscription(nextSubscription);
      setIsAdmin(!adminResult.error && !!adminResult.data);
      setProfileError(null);
      setSubscriptionError(null);
    } catch (error) {
      if (requestRef.current !== controller) return;
      setProfileError(asError(error));
      setSubscriptionError(asError(error));
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        setLoading(false);
        setSubscriptionLoading(false);
      }
    }
  }, [userId, email]);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setUser(null);
    setSubscription(null);
    setIsAdmin(false);
    setProfileError(null);
    setSubscriptionError(null);
    setLoading(!!userId);
    setSubscriptionLoading(!!userId);
    if (!userId) return;
    void refreshProfile();
    const channel = supabase.channel('account-' + userId + '-' + crypto.randomUUID())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: 'id=eq.' + userId }, refreshProfile)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscriptions', filter: 'user_id=eq.' + userId }, refreshProfile)
      .subscribe();
    const refreshVisible = () => { if (document.visibilityState === 'visible') void refreshProfile(); };
    window.addEventListener('focus', refreshVisible);
    window.addEventListener('online', refreshVisible);
    document.addEventListener('visibilitychange', refreshVisible);
    // Reconcile webhooks even if Realtime is unavailable or disconnected.
    const interval = window.setInterval(refreshVisible, 30_000);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
      void supabase.removeChannel(channel);
      window.clearInterval(interval);
      window.removeEventListener('focus', refreshVisible);
      window.removeEventListener('online', refreshVisible);
      document.removeEventListener('visibilitychange', refreshVisible);
    };
  }, [userId, refreshProfile]);

  const currentUser = user?.id === userId ? user : null;
  return (
    <UserContext.Provider value={{
      user: currentUser, authUser, loading: authLoading || loading,
      isAdmin, profileError, profileLoadFailed: !!profileError && !currentUser,
      refreshProfile, setUser, subscription: subscription?.user_id === userId ? subscription : null,
      subscriptionLoading: authLoading || subscriptionLoading, subscriptionError,
    }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within a UserProvider');
  return context;
};
