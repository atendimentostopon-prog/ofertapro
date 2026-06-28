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
    const defaultUsername = email.split('@')[0] || 'usuario';
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

  const fetchProfile = async (userId: string, email: string): Promise<User | null> => {
    // Se já houver um fetch idêntico em andamento para o mesmo usuário, compartilha a Promise
    if (activeFetchPromiseRef.current && fetchedUserIdRef.current === userId) {
      console.log(`[BOOT][UserContext] Reutilizando busca de perfil em andamento para ID: ${userId}`);
      return activeFetchPromiseRef.current;
    }

    console.log("[USER] loading profile start for ID:", userId);
    fetchedUserIdRef.current = userId;

    const runFetch = async (): Promise<User | null> => {
      try {
        console.log(`[BOOT][UserContext] Buscando perfil do Supabase para o usuário ID: ${userId}`);
        
        // Corrida com timeout de 8s para evitar travamento em repouso da query
        const result = await Promise.race([
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout ao obter perfil")), 8000))
        ]) as any;

        const { data, error } = result;

        if (error) {
          console.error('[USER] loading profile error', error);
          throw error;
        }

        if (data) {
          console.log('[USER] loading profile success');
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
        // Detectar erro de JWT inválido e limpar sessão corrompida
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
          console.timeEnd("[BOOT] loadProfile");
          setIsAdmin(adminStatus);
          
          if (profile) {
            setUser(profile);
            setProfileError(null);
            setProfileLoadFailed(false);
          } else {
            throw new Error("Perfil retornado vazio");
          }
        } catch (err: any) {
          console.timeEnd("[BOOT] loadProfile");
          console.error('[BOOT][UserContext] Falha ao carregar perfil do Supabase em refreshProfile:', err);
          
          // Se já temos um perfil carregado anteriormente, mantemos e ignoramos a falha temporária
          if (user) {
            console.warn('[BOOT][UserContext] Mantendo perfil anterior em cache apesar da falha temporária.');
            setProfileError(null);
            setProfileLoadFailed(false);
            return;
          }

          // Se a busca real do banco falhou mas temos a sessão válida com metadados, criamos um perfil em memória para não quebrar o login
          const defaultUsername = session.user.email?.split('@')[0] || 'usuario';
          const memoryProfile: User = {
            id: session.user.id,
            full_name: session.user.user_metadata?.full_name || 'Usuário',
            email: session.user.email || '',
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultUsername}`,
            username: defaultUsername,
            plan: 'free',
            publicUrl: defaultUsername,
            bio: '',
            joinedAt: session.user.created_at || new Date().toISOString(),
            onboarded: true,
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

          console.warn('[BOOT][UserContext] Iniciando com perfil temporário em memória para tolerância a falhas do banco.');
          setUser(memoryProfile);
          setProfileError(null);
          setProfileLoadFailed(false);
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
      try { console.timeEnd("[BOOT] total"); } catch {}
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

    let subscription: any = null;
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
          return;
        }

        // TOKEN_REFRESHED: apenas atualizar se já temos sessão
        if (event === 'TOKEN_REFRESHED' && hasLoadedRef.current) {
          console.log('[BOOT][UserContext] Token atualizado — sem necessidade de recarregar perfil.');
          if (session?.user) {
            setAuthUser(session.user);
          }
          return;
        }

        // Ativa loading síncronamente antes da promise assíncrona iniciar se não houver perfil em memória
        if (session?.user && !hasLoadedRef.current) {
          setLoading(true);
        }
        try {
          if (session?.user) {
            setAuthUser(session.user);
            console.log('[BOOT][UserContext] Carregando perfil do usuário após mudança de estado...');
            console.time("[BOOT] loadProfile");
            try {
              const [profile, adminStatus] = await Promise.all([
                fetchProfile(session.user.id, session.user.email || ''),
                checkAdminStatus()
              ]);
              console.timeEnd("[BOOT] loadProfile");
              setIsAdmin(adminStatus);
              if (profile) {
                setUser(profile);
                setProfileError(null);
                setProfileLoadFailed(false);
              } else {
                throw new Error("Perfil retornado vazio");
              }
            } catch (err: any) {
              console.timeEnd("[BOOT] loadProfile");
              console.error('[BOOT][UserContext] Erro ao buscar perfil no onAuthStateChange:', err);
              
              if (user) {
                console.warn('[BOOT][UserContext] Mantendo perfil anterior em cache.');
                setProfileError(null);
                setProfileLoadFailed(false);
                return;
              }

              const defaultUsername = session.user.email?.split('@')[0] || 'usuario';
              const memoryProfile: User = {
                id: session.user.id,
                full_name: session.user.user_metadata?.full_name || 'Usuário',
                email: session.user.email || '',
                avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${defaultUsername}`,
                username: defaultUsername,
                plan: 'free',
                publicUrl: defaultUsername,
                bio: '',
                joinedAt: session.user.created_at || new Date().toISOString(),
                onboarded: true,
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
              console.warn('[BOOT][UserContext] Iniciando com perfil temporário em memória após AuthStateChange.');
              setUser(memoryProfile);
              setProfileError(null);
              setProfileLoadFailed(false);
            }
          } else {
            console.log('[BOOT][UserContext] Limpando perfil (usuário deslogado/sem sessão)');
            setUser(null);
            setAuthUser(null);
            setIsAdmin(false);
            setProfileError(null);
            setProfileLoadFailed(false);
            hasLoadedRef.current = false;
          }
        } catch (err) {
          console.error('[BOOT][UserContext] Erro interno no onAuthStateChange callback:', err);
        } finally {
          hasLoadedRef.current = true;
          setLoading(false);
          try { console.timeEnd("[BOOT] total"); } catch {}
          console.log('[BOOT][UserContext] onAuthStateChange processado. loading = false');
        }
      });
      subscription = data?.subscription;
    } catch (err) {
      console.error('[BOOT][UserContext] Falha ao assinar onAuthStateChange:', err);
      setLoading(false);
    }

    return () => {
      clearTimeout(timeoutId);
      if (subscription && typeof subscription.unsubscribe === 'function') {
        subscription.unsubscribe();
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
