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
  // loading so e verdadeiro ate a primeira carga concluir; recargas (foco,
  // refresh) atualizam os dados sem voltar a loading, evitando desmontar a UI.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const hasLoadedRef = useRef(false);
  // Cada chamada de load recebe um numero; so a mais recente pode gravar estado.
  // O cleanup do effect incrementa o contador, invalidando cargas em voo ao
  // desmontar ou trocar de usuario.
  const requestRef = useRef(0);

  const resetData = useCallback(() => {
    setBotConfig(null);
    setConnectedChannels(0);
    setSuccessfulDispatches(0);
    setAutomaticDispatches(0);
    setError(false);
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;

    if (!userId) {
      hasLoadedRef.current = false;
      resetData();
      setLoading(false);
      return;
    }

    try {
      // allSettled: uma consulta que rejeita (ou falha) nao afeta as outras.
      // history.origin pode nao existir ainda (migration nao aplicada); nesse
      // caso o marco "oferta automatica" fica pendente, sem sinalizar erro.
      const [bot, channels, success, automatic] = await Promise.allSettled([
        supabase.from('bot_configs')
          .select('status, grupos_origem, amazon_tag, mercadolivre_tag, shopee_app_id')
          .eq('user_id', userId).maybeSingle(),
        supabase.from('channels').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).in('status', ['connected', 'active']),
        supabase.from('history').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).in('status', SUCCESS_STATUSES),
        supabase.from('history').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('origin', 'automation').in('status', SUCCESS_STATUSES),
      ]);

      if (requestId !== requestRef.current) return;

      const botFailure = bot.status === 'rejected' ? bot.reason : bot.value.error;
      const channelsFailure = channels.status === 'rejected' ? channels.reason : channels.value.error;
      const successFailure = success.status === 'rejected' ? success.reason : success.value.error;
      const automaticFailure = automatic.status === 'rejected' ? automatic.reason : automatic.value.error;

      if (botFailure) console.error('[useActivation] bot_configs:', botFailure);
      if (channelsFailure) console.error('[useActivation] channels:', channelsFailure);
      if (successFailure) console.error('[useActivation] history:', successFailure);
      if (automaticFailure) console.warn('[useActivation] history.origin indisponivel:', automaticFailure);

      const botOk = bot.status === 'fulfilled' && !bot.value.error ? bot.value : null;
      const channelsOk = channels.status === 'fulfilled' && !channels.value.error ? channels.value : null;
      const successOk = success.status === 'fulfilled' && !success.value.error ? success.value : null;
      const automaticOk = automatic.status === 'fulfilled' && !automatic.value.error ? automatic.value : null;

      setBotConfig(botOk ? (botOk.data as ActivationBotConfig | null) ?? null : null);
      setConnectedChannels(channelsOk?.count ?? 0);
      setSuccessfulDispatches(successOk?.count ?? 0);
      setAutomaticDispatches(automaticOk?.count ?? 0);
      setError(!botOk || !channelsOk || !successOk);
    } finally {
      if (requestId === requestRef.current) {
        hasLoadedRef.current = true;
        setLoading(false);
      }
    }
  }, [userId, resetData]);

  const invalidateRequests = useCallback(() => {
    requestRef.current++;
  }, []);

  useEffect(() => {
    // Montagem ou troca de usuario: zera dados antigos e volta ao estado de
    // primeira carga antes de buscar.
    hasLoadedRef.current = false;
    resetData();
    setLoading(true);
    load();
    const onFocus = () => { load(); };
    window.addEventListener('focus', onFocus);
    return () => {
      invalidateRequests();
      window.removeEventListener('focus', onFocus);
    };
  }, [load, resetData, invalidateRequests]);

  const state = useMemo(
    () => deriveActivation({ botConfig, connectedChannels, successfulDispatches, automaticDispatches }),
    [botConfig, connectedChannels, successfulDispatches, automaticDispatches],
  );

  return { state, loading, error, refresh: load };
}
