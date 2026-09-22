import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

export interface OnboardingSteps {
  profileCompleted: boolean;
  offerCreated: boolean;
  channelConnected: boolean;
  firstDispatch: boolean;
  clicksReceived: boolean;
}

// Função auxiliar para quebrar email
function splitEmail(email: string): string {
  if (!email) return '';
  return email.split('@')[0];
}

export function useOnboarding() {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [steps, setSteps] = useState<OnboardingSteps>({
    profileCompleted: false,
    offerCreated: false,
    channelConnected: false,
    firstDispatch: false,
    clicksReceived: false
  });

  const checkProgress = useCallback(async () => {
    if (!user?.id) return;
    try {
      setLoading(true);

      const fetchWithFallback = async (queryPromise: Promise<any> | PromiseLike<any>, defaultValue: any = 0) => {
        try {
          const res = await queryPromise;
          if (res.error) {
            console.error('[ONBOARDING_PROGRESS_ERROR]', res.error);
            return defaultValue;
          }
          return res.count !== undefined ? res.count : (res.data || defaultValue);
        } catch (e) {
          console.error('[ONBOARDING_PROGRESS_EXCEPTION]', e);
          return defaultValue;
        }
      };

      const [profileData, offersCount, channelsCount, historyCount, clicksCount] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single().then(res => res.data),
        fetchWithFallback(supabase.from('offers').select('id', { count: 'exact', head: true }).eq('user_id', user.id), 0),
        fetchWithFallback(supabase.from('channels').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['connected', 'active']), 0),
        fetchWithFallback(supabase.from('history').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('status', ['success', 'partial', 'sent']), 0),
        fetchWithFallback(supabase.from('clicks').select('id', { count: 'exact', head: true }).eq('user_id', user.id), 0)
      ]);

      const profile = profileData;

      // Critério Perfil: se preencheu bio, avatar, public_name ou customizou o username
      const defaultUsernameRegex = /_[a-f0-9]{4}$/;
      const isDefaultUsername = profile?.username ? defaultUsernameRegex.test(profile.username) : true;
      const profileCompleted = !!profile && (
        !!profile.bio || 
        !!profile.avatar_url || 
        !!profile.public_name ||
        !!profile.public_display_name ||
        (!isDefaultUsername && profile.username !== splitEmail(profile.email)) ||
        profile.full_name !== 'Usuário'
      );

      const offerCreated = offersCount > 0;
      const channelConnected = channelsCount > 0;
      const firstDispatch = historyCount > 0;
      const clicksReceived = clicksCount > 0;

      setSteps({
        profileCompleted,
        offerCreated,
        channelConnected,
        firstDispatch,
        clicksReceived
      });
    } catch (err) {
      console.error('Erro ao verificar progresso de onboarding:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    checkProgress();

    // Recalcular missões quando a janela receber foco novamente
    window.addEventListener('focus', checkProgress);
    return () => {
      window.removeEventListener('focus', checkProgress);
    };
  }, [checkProgress]);

  // Percentual de progresso
  const totalSteps = 5;
  const completedCount = Object.values(steps).filter(Boolean).length;
  const percentCompleted = Math.round((completedCount / totalSteps) * 100);
  const allCompleted = completedCount === totalSteps;

  return {
    steps,
    percentCompleted,
    allCompleted,
    loading,
    refresh: checkProgress
  };
}
