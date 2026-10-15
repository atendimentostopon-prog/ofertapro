import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import {
  deriveActivation,
  type ActivationBotConfig,
  type ActivationState,
} from '../lib/activationMilestones';

const SUCCESS_STATUSES = ['success', 'partial', 'sent'];

export interface UseActivation {
  state: ActivationState;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<void>;
}

export function useActivation(): UseActivation {
  const { user } = useUser();
  const userId = user?.id;
  const [botConfig, setBotConfig] = useState<ActivationBotConfig | null>(null);
  const [connectedChannels, setConnectedChannels] = useState(0);
  const [successfulDispatches, setSuccessfulDispatches] = useState(0);
  const [automaticDispatches, setAutomaticDispatches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId) { setLoading(false); return; }
    setLoading(true);

    // Cada consulta falha sozinha: um erro em uma delas nao derruba o painel.
    // history.origin pode nao existir ainda (migration nao aplicada); nesse
    // caso o marco "oferta automatica" fica pendente, sem sinalizar erro.
    const [bot, channels, success, automatic] = await Promise.all([
      supabase.from('bot_configs')
        .select('telegram_session, status, grupos_origem, amazon_tag, mercadolivre_tag')
        .eq('user_id', userId).maybeSingle(),
      supabase.from('channels').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).in('status', ['connected', 'active']),
      supabase.from('history').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).in('status', SUCCESS_STATUSES),
      supabase.from('history').select('id', { count: 'exact', head: true })
        .eq('user_id', userId).eq('origin', 'automation').in('status', SUCCESS_STATUSES),
    ]);

    if (!activeRef.current) return;

    if (bot.error) console.error('[useActivation] bot_configs:', bot.error);
    if (channels.error) console.error('[useActivation] channels:', channels.error);
    if (success.error) console.error('[useActivation] history:', success.error);
    if (automatic.error) console.warn('[useActivation] history.origin indisponivel:', automatic.error);

    setBotConfig(bot.error ? null : (bot.data as ActivationBotConfig | null) ?? null);
    setConnectedChannels(channels.error ? 0 : channels.count ?? 0);
    setSuccessfulDispatches(success.error ? 0 : success.count ?? 0);
    setAutomaticDispatches(automatic.error ? 0 : automatic.count ?? 0);
    setError(Boolean(bot.error || channels.error || success.error));
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    activeRef.current = true;
    load();
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => {
      activeRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  const state = useMemo(
    () => deriveActivation({ botConfig, connectedChannels, successfulDispatches, automaticDispatches }),
    [botConfig, connectedChannels, successfulDispatches, automaticDispatches],
  );

  return { state, loading, error, refresh: load };
}
