import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';

export type BotView =
  | 'not_connected'
  | 'error'
  | 'access_revoked'
  | 'paused_by_user'
  | 'monitoring'
  | 'unknown';

interface BotConfigRow {
  status?: string | null;
  ativo?: boolean | null;
  grupos_origem?: string[] | null;
  paused_reason?: string | null;
  last_error?: string | null;
}

interface BotStatusState {
  view: BotView;
  groupsCount: number;
  errorMessage: string | null;
  loading: boolean;
  toggling: boolean;
  setMonitoring: (on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

function deriveView(row: BotConfigRow | null): BotView {
  if (!row || row.status !== 'active') {
    if (row?.status === 'error') return 'error';
    if (row?.status === 'paused') return 'access_revoked';
    return 'not_connected';
  }
  return row.ativo === false ? 'paused_by_user' : 'monitoring';
}

export function useBotStatus(): BotStatusState {
  const { user } = useUser();
  const { toast } = useToast();
  const [row, setRow] = useState<BotConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [errored, setErrored] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('bot_configs')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!activeRef.current) return;
      // maybeSingle() devolve error:null quando simplesmente nao ha linha —
      // isso e "nao conectado", nao falha. So um erro de verdade (RLS, rede,
      // 4xx/5xx) chega aqui com error != null.
      if (error) throw error;
      setRow((data as BotConfigRow) ?? null);
      setErrored(false);
    } catch (err) {
      console.error('[useBotStatus] erro ao carregar:', err);
      if (activeRef.current) setErrored(true);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [user]);

  const setMonitoring = useCallback(async (on: boolean) => {
    if (!user?.id) return;
    setToggling(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({ ativo: on })
        .eq('user_id', user.id);
      if (error) throw error;
      setRow(prev => (prev ? { ...prev, ativo: on } : prev));
      toast(
        on
          ? 'Bot reativado.'
          : 'Bot pausado. Você para de receber novas ofertas até reativar.',
        'success',
      );
    } catch (err: any) {
      toast(err.message || 'Erro ao atualizar o status do bot.', 'error');
    } finally {
      setToggling(false);
    }
  }, [user, toast]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => { activeRef.current = false; };
  }, [load]);

  return {
    view: errored ? 'unknown' : deriveView(row),
    groupsCount: Array.isArray(row?.grupos_origem) ? row!.grupos_origem!.length : 0,
    errorMessage: row?.last_error ?? null,
    loading,
    toggling,
    setMonitoring,
    refresh: load,
  };
}
