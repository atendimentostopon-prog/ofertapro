import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

interface UserContextType {
  user: User | null;
  authUser: any | null;
  loading: boolean;
  isAdmin: boolean;
  profileError: Error | null;
  profileLoadFailed: boolean;
  refreshProfile: () => Promise<void>;
  setUser: React.Dispatch<React.SetStateAction<User | null>>;
}

interface UserProviderProps {
  children: React.ReactNode;
  onBootError?: (error: Error) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const UserProvider: React.FC<UserProviderProps> = ({ children, onBootError }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authUser, setAuthUser] = useState<any | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState<Error | null>(null);
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);

  const checkAdminStatus = async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc('is_current_user_admin');
      if (error) return false;
      return !!data;
    } catch {
      return false;
    }
  };

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

  const activeFetchPromiseRef = React.useRef<Promise<User | null> | null>(null);
  const fetchedUserIdRef = React.useRef<string | null>(null);
  const hasLoadedRef = React.useRef(false);
  const retryTimeoutRef = React.useRef<any>(null);

  const fetchProfile = async (userId: string, email: string): Promise<User | null> => {
    // Se já houver um fetch idêntico em andamento para o mesmo usuário, compartilha a Promise
    if (activeFetchPromiseRef.current && fetchedUserIdRef.current === userId) {
      console.log(`[BOOT][UserContext] Reutilizando busca de perfil em andamento para ID: ${userId}`);
      return activeFetchPromiseRef.current;
    }

    console.log("[USER] loading profile start for ID:", userId);
    fetchedUserIdRef.current = userId;

    const runFetch = async (attempt = 1): Promise<User | null> => {
      try {
        console.log(`[BOOT][UserContext] Buscando perfil e assinatura do Supabase (tentativa ${attempt}) para ID: ${userId}`);
        
        // Busca perfil e assinatura ativa em paralelo com timeout de 8s
        const fetchPromise = Promise.allSettled([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase
            .from('subscriptions')
            .select('plan_code, status, current_period_end')
            .eq('user_id', userId)
            .in('status', ['active', 'past_due'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        ]);

        const [profileRes, subRes] = (await Promise.race([
          fetchPromise,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout ao obter perfil")), 8000))
        ])) as any;

        const profileData = profileRes.status === 'fulfilled' ? profileRes.value.data : null;
        const profileError = profileRes.status === 'fulfilled' ? profileRes.value.error : profileRes.reason;
        
        const subData = subRes.status === 'fulfilled' ? subRes.value.data : null;

        if (profileError) {
          console.error('[USER] loading profile error', profileError);
          if (attempt < 2) {
            console.log('[USER] Tentando novamente buscar perfil em 1s...');
            await new Promise(r => setTimeout(r, 1000));
            return runFetch(attempt + 1);
          }
          throw profileError;
        }

        if (profileData) {
          console.log('[USER] loading profile success');
          
          // Sincronização inteligente de plano:
          // Se tiver assinatura ativa na tabela subscriptions, ela prevalece sobre profiles.plan caso profiles esteja como 'free'
          let effectivePlan = (profileData.plan || 'free') as any;
          let effectiveAccountStatus = profileData.account_status ?? undefined;

          if (subData?.plan_code && subData?.status === 'active') {
            if (effectivePlan === 'free') {
              console.log(`[BOOT][UserContext] Assinatura ativa detectada (${subData.plan_code}). Promovendo plano de 'free' para '${subData.plan_code}'.`);
              effectivePlan = subData.plan_code;
              effectiveAccountStatus = 'active';
            }
          }

          return {
            id: profileData.id,
            full_name: profileData.full_name || 'Usuário',
            email: email,
            avatar_url: profileData.avatar_url,
            username: profileData.username || '',
            plan: effectivePlan,
            publicUrl: profileData.public_url || profileData.username || '',
            bio: profileData.bio || '',
            joinedAt: profileData.created_at || profileData.joined_at || new Date().toISOString(),
            onboarded: profileData.onboarded ?? false,
            accountStatus: effectiveAccountStatus,
            trialEndsAt: profileData.trial_ends_at ?? undefined,
            isPublicActive: profileData.is_public_active ?? false,
            publicName: profileData.public_name || profileData.full_name || 'Usuário',
            publicAvatarUrl: profileData.public_avatar_url || profileData.avatar_url,
            public_page_active: profileData.public_page_active ?? true,
            public_page_created: profileData.public_page_created ?? false,
            public_display_name: profileData.public_display_name || '',
            public_avatar_url: profileData.public_avatar_url || '',
            public_theme: profileData.public_theme || 'default',
            preferred_name: profileData.preferred_name || '',
            phone: profileData.phone || '',
            whatsapp_group_url: profileData.whatsapp_group_url || '',
            telegram_group_url: profileData.telegram_group_url || '',
            discord_group_url: profileData.discord_group_url || '',
          } as User;
        }

        console.warn('[BOOT][UserContext] Perfil não encontrado na tabela public.profiles. Tentando criar perfil mínimo...');
        const minimalProfile = await createMinimalProfile(userId, email);
        if (minimalProfile) {
          return minimalProfile;
        }
        throw new Error('Perfil não encontrado e falha ao criar perfil mínimo.');
      } catch (err) {
        console.error('[USER] loading profile error in fetchProfile:', err);
        throw err;
      } finally {
        activeFetchPromiseRef.current = null;
        console.log("[USER] loading profile finally");
      }
    };

    const promise = runFetch();
    activeFetchPromiseRef.current = promise;
    return promise;
  };


  const refreshProfile = async () => {
    try {
      console.log('[BOOT][UserContext] refreshProfile iniciado');
      if (!hasLoadedRef.current) {
        setLoading(true);
      }
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        console.error('[BOOT][UserContext] Erro ao obter sessão em refreshProfile:', sessionError);
        const isJwtError =
          sessionError.message?.includes('JWT') ||
          sessionError.message?.includes('token') ||
          sessionError.status === 401;
        if (isJwtError) {
          console.warn('[BOOT][UserContext] JWT inválido detectado — fazendo logout automático.');
          try { await supabase.auth.signOut(); } catch {}
        }
        setUser(null);
        setAuthUser(null);
        setProfileError(sessionError);
        setProfileLoadFailed(true);
        return;
      }

      if (session?.user) {
        setAuthUser(session.user);
        try {
          const [profile, adminStatus] = await Promise.all([
            fetchProfile(session.user.id, session.user.email || ''),
            checkAdminStatus()
          ]);
          setIsAdmin(adminStatus);
          
          if (profile) {
            setUser(profile);
            setProfileError(null);
            setProfileLoadFailed(false);
          } else {
            throw new Error("Perfil retornado vazio");
          }
        } catch (err: any) {
          console.error('[BOOT][UserContext] Falha ao carregar perfil do Supabase em refreshProfile:', err);
          
          // Se já temos um perfil carregado anteriormente, mantemos e ignoramos a falha temporária
          if (user) {
            console.warn('[BOOT][UserContext] Mantendo perfil anterior em cache apesar da falha temporária.');
            setProfileError(null);
            setProfileLoadFailed(false);
            return;
          }

          // Se a busca real do banco falhou mas temos a sessão válida com metadados, criamos um perfil em memória temporário
          // e agendamos um retry automático em background para não deixar o usuário travado
          const defaultUsername = session.user.email?.split('@')[0] || 'usuario';
          const memoryProfile: User = {
            id: session.user.id,
            full_name: session.user.user_metadata?.full_name || 'Usuário',
            email: session.user.email || '',
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultUsername}`,
            username: defaultUsername,
            plan: 'starter', // Inicia com starter temporário para não bloquear funções básicas antes do retry
            publicUrl: defaultUsername,
            bio: '',
            joinedAt: session.user.created_at || new Date().toISOString(),
            onboarded: true,
            accountStatus: 'active',
            trialEndsAt: undefined,
            isPublicActive: true,
            publicName: session.user.user_metadata?.full_name || 'Usuário',
            publicAvatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultUsername}`,
            public_page_active: true,
            public_page_created: true,
            public_theme: 'default',
            preferred_name: '',
            phone: '',
            whatsapp_group_url: '',
            telegram_group_url: '',
            discord_group_url: '',
          };

          console.warn('[BOOT][UserContext] Iniciando com perfil temporário em memória e agendando retry.');
          setUser(memoryProfile);
          setProfileError(null);
          setProfileLoadFailed(false);

          // Retry automático em background
          if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
          retryTimeoutRef.current = setTimeout(() => {
            console.log('[BOOT][UserContext] Executando retry automático de perfil em background...');
            refreshProfile().catch(() => {});
          }, 3000);
        }
      } else {
        console.log('[BOOT][UserContext] Nenhuma sessão ativa em refreshProfile');
        setUser(null);
        setAuthUser(null);
        setIsAdmin(false);
        setProfileError(null);
        setProfileLoadFailed(false);
      }
    } catch (err: any) {
      console.error('[BOOT][UserContext] Erro inesperado em refreshProfile:', err);
      setProfileError(err);
      setProfileLoadFailed(true);
      setUser(null);
      setAuthUser(null);
    } finally {
      hasLoadedRef.current = true;
      setLoading(false);
      console.log('[BOOT][UserContext] refreshProfile finalizado. loading = false');
    }
  };

  useEffect(() => {
    console.log('[USER] provider mounted');
    
    const isPublicRoute = () => {
      const path = window.location.pathname;
      const privatePaths = ['/dashboard', '/offers', '/channels', '/history', '/settings', '/feedbacks'];
      return !privatePaths.some(p => path === p || path.startsWith(p + '/'));
    };

    // Timeout de segurança de 6 segundos para o carregamento do perfil
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn("[USER] Security timeout reached! Forcing loading do profile para false.");
        if (onBootError && !isPublicRoute()) {
          onBootError(new Error("Falha ao carregar perfil do usuário."));
        }
        setLoading(false);
      }
    }, 6000);

    refreshProfile().then(() => {
      clearTimeout(timeoutId);
    });

    let authSubscription: any = null;
    let realtimeChannel: any = null;

    try {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`[BOOT][UserContext] onAuthStateChange disparado: ${event}`);

        // SIGNED_OUT: limpar estado imediatamente
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setAuthUser(null);
          setIsAdmin(false);
          setProfileError(null);
          setProfileLoadFailed(false);
          hasLoadedRef.current = false;
          setLoading(false);
          if (realtimeChannel) {
            supabase.removeChannel(realtimeChannel);
            realtimeChannel = null;
          }
          return;
        }

        // TOKEN_REFRESHED: apenas atualizar authUser se já temos dados
        if (event === 'TOKEN_REFRESHED' && hasLoadedRef.current) {
          console.log('[BOOT][UserContext] Token atualizado — sem necessidade de recarregar perfil.');
          if (session?.user) {
            setAuthUser(session.user);
          }
          return;
        }

        if (session?.user) {
          setAuthUser(session.user);

          // Configurar inscrição Realtime para atualizar o perfil e assinatura automaticamente
          if (!realtimeChannel) {
            const channelId = `user-profile-sync-${session.user.id}`;
            realtimeChannel = supabase
              .channel(channelId)
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` },
                () => {
                  console.log('[REALTIME][UserContext] Alteração detectada na tabela profiles. Atualizando perfil...');
                  refreshProfile().catch(() => {});
                }
              )
              .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${session.user.id}` },
                () => {
                  console.log('[REALTIME][UserContext] Alteração detectada na tabela subscriptions. Atualizando perfil...');
                  refreshProfile().catch(() => {});
                }
              )
              .subscribe();
          }

          if (!hasLoadedRef.current) {
            setLoading(true);
          }

          try {
            console.log('[BOOT][UserContext] Carregando perfil do usuário após mudança de estado...');
            const [profile, adminStatus] = await Promise.all([
              fetchProfile(session.user.id, session.user.email || ''),
              checkAdminStatus()
            ]);
            setIsAdmin(adminStatus);
            if (profile) {
              setUser(profile);
              setProfileError(null);
              setProfileLoadFailed(false);
            }
          } catch (err: any) {
            console.error('[BOOT][UserContext] Erro ao buscar perfil no onAuthStateChange:', err);
            if (!user) {
              const defaultUsername = session.user.email?.split('@')[0] || 'usuario';
              const memoryProfile: User = {
                id: session.user.id,
                full_name: session.user.user_metadata?.full_name || 'Usuário',
                email: session.user.email || '',
                avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultUsername}`,
                username: defaultUsername,
                plan: 'starter',
                publicUrl: defaultUsername,
                bio: '',
                joinedAt: session.user.created_at || new Date().toISOString(),
                onboarded: true,
                accountStatus: 'active',
                trialEndsAt: undefined,
                isPublicActive: true,
                publicName: session.user.user_metadata?.full_name || 'Usuário',
                publicAvatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultUsername}`,
                public_page_active: true,
                public_page_created: true,
                public_theme: 'default',
                preferred_name: '',
                phone: '',
                whatsapp_group_url: '',
                telegram_group_url: '',
                discord_group_url: '',
              };
              setUser(memoryProfile);
            }
          } finally {
            hasLoadedRef.current = true;
            setLoading(false);
          }
        } else {
          setUser(null);
          setAuthUser(null);
          setIsAdmin(false);
          setProfileError(null);
          setProfileLoadFailed(false);
          hasLoadedRef.current = false;
          setLoading(false);
        }
      });
      authSubscription = data?.subscription;
    } catch (err) {
      console.error('[BOOT][UserContext] Falha ao assinar onAuthStateChange:', err);
      setLoading(false);
    }

    return () => {
      clearTimeout(timeoutId);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      if (authSubscription && typeof authSubscription.unsubscribe === 'function') {
        authSubscription.unsubscribe();
      }
      if (realtimeChannel) {
        supabase.removeChannel(realtimeChannel);
      }
    };
  }, []);

  return (
    <UserContext.Provider value={{ user, authUser, loading, isAdmin, profileError, profileLoadFailed, refreshProfile, setUser }}>
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};
