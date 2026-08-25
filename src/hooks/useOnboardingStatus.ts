import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Radar, Send, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

export type OnboardingStepId = 'telegram_bot' | 'grupo_origem' | 'canal_destino' | 'primeira_oferta';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  route: string;
  icon: React.ElementType;
  done: boolean;
}

interface OnboardingStatusState {
  steps: OnboardingStep[];
  allDone: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
}

const CONNECTED_CHANNEL_STATUSES = new Set(['connected', 'active']);

export const useOnboardingStatus = (): OnboardingStatusState => {
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [botActive, setBotActive] = useState(false);
  const [gruposCount, setGruposCount] = useState(0);
  const [hasConnectedChannel, setHasConnectedChannel] = useState(false);
  const [hasOffer, setHasOffer] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [botRes, channelsRes, offersRes] = await Promise.all([
        supabase
          .from('bot_configs')
          .select('status, grupos_origem')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase
          .from('channels')
          .select('status')
          .eq('user_id', user.id),
        supabase
          .from('offers')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
      ]);

      if (!activeRef.current) return;

      const botData = botRes.data as { status?: string | null; grupos_origem?: string[] | null } | null;
      setBotActive(botData?.status === 'active');
      setGruposCount(Array.isArray(botData?.grupos_origem) ? botData.grupos_origem.length : 0);

      const channels = (channelsRes.data || []) as Array<{ status?: string | null }>;
      setHasConnectedChannel(channels.some(c => c.status && CONNECTED_CHANNEL_STATUSES.has(c.status)));

      setHasOffer((offersRes.count ?? 0) > 0);
    } catch (err) {
      console.error('[useOnboardingStatus] erro ao carregar status:', err);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => {
      activeRef.current = false;
    };
  }, [load]);

  const steps: OnboardingStep[] = [
    {
      id: 'telegram_bot',
      title: 'Conectar o bot do Telegram',
      description: 'Faça login com seu número no Telegram para o bot monitorar suas fontes.',
      route: '/integrations',
      icon: Bot,
      done: botActive,
    },
    {
      id: 'grupo_origem',
      title: 'Adicionar um grupo de origem',
      description: 'Informe pelo menos um grupo do Telegram para o bot monitorar em busca de ofertas.',
      route: '/integrations',
      icon: Radar,
      done: gruposCount >= 1,
    },
    {
      id: 'canal_destino',
      title: 'Conectar um canal de destino',
      description: 'Conecte ao menos um canal (Telegram, WhatsApp ou Discord) que vai receber os disparos.',
      route: '/channels',
      icon: Send,
      done: hasConnectedChannel,
    },
    {
      id: 'primeira_oferta',
      title: 'Criar sua primeira oferta',
      description: 'Cadastre um produto com link de afiliado pra começar a disparar.',
      route: '/offers/new',
      icon: Package,
      done: hasOffer,
    },
  ];

  const allDone = steps.every(s => s.done);

  return { steps, allDone, loading, refresh: load };
};
