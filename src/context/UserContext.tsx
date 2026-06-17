import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '../types';

interface UserContextType {
  user: User | null;
  loading: boolean;
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
  const [loading, setLoading] = useState(true);

  const getFallbackProfile = (userId: string, email: string): User => {
    const defaultUsername = email.split('@')[0] || 'usuario';
    console.warn(`[BOOT][UserContext] Usando perfil de fallback para o usuário ${userId}`);
    return {
      id: userId,
      full_name: 'Usuário',
      email: email,
      username: `${defaultUsername}_temp`,
      plan: 'free',
      publicUrl: `${defaultUsername}_temp`,
      bio: '',
      joinedAt: new Date().toISOString(),
      onboarded: false,
      isPublicActive: false,
      publicName: 'Usuário',
      publicAvatarUrl: undefined,
      avatar_url: undefined,
      public_page_active: true,
      public_page_created: false,
      public_display_name: '',
      public_avatar_url: '',
      public_theme: 'default',
      preferred_name: '',
      phone: '',
      whatsapp_group_url: '',
      telegram_group_url: '',
      discord_group_url: '',
    };
  };

  const fetchProfile = async (userId: string, email: string): Promise<User | null> => {
    console.log("[USER] loading profile start");
    try {
      console.log(`[BOOT][UserContext] Buscando perfil do Supabase para o usuário ID: ${userId}`);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        console.error('[USER] loading profile error', error);
        return null;
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

      console.warn('[BOOT][UserContext] Perfil não encontrado na tabela public.profiles');
      return getFallbackProfile(userId, email);
    } catch (err) {
      console.error('[USER] loading profile error', err);
      return null;
    } finally {
      console.log("[USER] loading profile finally");
    }
  };

  const refreshProfile = async () => {
    try {
      console.log('[BOOT][UserContext] refreshProfile iniciado');
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('[BOOT][UserContext] Erro ao obter sessão em refreshProfile:', sessionError);
        setUser(null);
        return;
      }

      if (session?.user) {
        console.log('[BOOT][UserContext] Sessão ativa encontrada, carregando perfil...');
        console.time("[BOOT] loadProfile");
        const profile = await fetchProfile(session.user.id, session.user.email || '');
        console.timeEnd("[BOOT] loadProfile");
        if (profile) {
          setUser(profile);
        } else {
          setUser(prev => {
            if (prev) {
              console.warn('[BOOT][UserContext] Falha ao atualizar perfil do banco. Mantendo o perfil local em cache para evitar resets.');
              return prev;
            }
            return getFallbackProfile(session.user.id, session.user.email || '');
          });
        }
      } else {
        console.log('[BOOT][UserContext] Nenhuma sessão ativa em refreshProfile');
        setUser(null);
      }
    } catch (err) {
      console.error('[BOOT][UserContext] Erro inesperado em refreshProfile:', err);
      setUser(null);
    } finally {
      setLoading(false);
      try {
        console.timeEnd("[BOOT] total");
      } catch (e) {
        // ignore timer end error
      }
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

    // Timeout de segurança de 4 segundos para o carregamento do perfil
    const timeoutId = setTimeout(() => {
      if (loading) {
        console.warn("[USER] Security timeout reached! Forcing loading do profile para false.");
        if (onBootError && !isPublicRoute()) {
          onBootError(new Error("Falha ao carregar perfil do usuário."));
        }
        setLoading(false);
      }
    }, 4000);

    refreshProfile().then(() => {
      clearTimeout(timeoutId);
    });

    let subscription: any = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        console.log(`[BOOT][UserContext] onAuthStateChange disparado: ${event}`);
        try {
          if (session?.user) {
            console.log('[BOOT][UserContext] Carregando perfil do usuário após mudança de estado...');
            console.time("[BOOT] loadProfile");
            const profile = await fetchProfile(session.user.id, session.user.email || '');
            console.timeEnd("[BOOT] loadProfile");
            if (profile) {
              setUser(profile);
            } else {
              setUser(prev => {
                if (prev) return prev;
                return getFallbackProfile(session.user.id, session.user.email || '');
              });
            }
          } else {
            console.log('[BOOT][UserContext] Limpando perfil (usuário deslogado/sem sessão)');
            setUser(null);
          }
        } catch (err) {
          console.error('[BOOT][UserContext] Erro interno no onAuthStateChange callback:', err);
        } finally {
          setLoading(false);
          try {
            console.timeEnd("[BOOT] total");
          } catch (e) {
            // ignore timer end error
          }
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
    <UserContext.Provider value={{ user, loading, refreshProfile, setUser }}>
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
