import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, KeyRound, Radio, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

export type OnboardingStepId = 'telegram_session' | 'marketplaces' | 'telegram_source' | 'destinations';

export interface OnboardingStep {
  id: OnboardingStepId;
  title: string;
  description: string;
  route: string;
  icon: React.ElementType;
  done: boolean;
  locked: boolean;
  validatedAt: string | null;
}

interface ProgressRow {
  current_step: number;
  completed_at: string | null;
  step_1_validated_at: string | null;
  step_2_validated_at: string | null;
  step_3_validated_at: string | null;
  step_4_validated_at: string | null;
}

const EMPTY: ProgressRow = {
  current_step: 1, completed_at: null, step_1_validated_at: null,
  step_2_validated_at: null, step_3_validated_at: null, step_4_validated_at: null,
};

export const useOnboardingStatus = () => {
  const { user } = useUser();
  const userId = user?.id;
  const [progress, setProgress] = useState<ProgressRow>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!userId) { setProgress(EMPTY); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const result = await supabase.from('onboarding_progress')
        .select('current_step, completed_at, step_1_validated_at, step_2_validated_at, step_3_validated_at, step_4_validated_at')
        .eq('user_id', userId).maybeSingle();
      if (result.error) throw result.error;
      let nextProgress = result.data as ProgressRow | null;
      if (!nextProgress) {
        const created = await supabase.from('onboarding_progress')
          .insert({ user_id: userId })
          .select('current_step, completed_at, step_1_validated_at, step_2_validated_at, step_3_validated_at, step_4_validated_at')
          .single();
        if (created.error) throw created.error;
        nextProgress = created.data as ProgressRow;
      }
      if (activeRef.current) setProgress(nextProgress);
    } catch (loadError) {
      console.error('[useOnboardingStatus] erro ao carregar progresso:', loadError);
      if (activeRef.current) setError('Não foi possível carregar o progresso do onboarding. Tente novamente.');
    } finally { if (activeRef.current) setLoading(false); }
  }, [userId]);

  useEffect(() => {
    activeRef.current = true; load();
    return () => { activeRef.current = false; };
  }, [load]);

  const validated = [progress.step_1_validated_at, progress.step_2_validated_at,
    progress.step_3_validated_at, progress.step_4_validated_at];
  const firstPending = validated.findIndex(value => !value);
  const currentStep = firstPending === -1 ? 4 : firstPending + 1;
  const definitions = [
    { id: 'telegram_session' as const, title: 'Conectar sua conta do Telegram', description: 'Autentique a sessão pessoal e confirme que ela consegue listar seus canais.', route: '/integrations?tab=bot', icon: Bot },
    { id: 'marketplaces' as const, title: 'Configurar marketplaces', description: 'Configure Amazon, Shopee e Mercado Livre conforme o modo de uso escolhido.', route: '/integrations?tab=bot', icon: KeyRound },
    { id: 'telegram_source' as const, title: 'Conectar o canal de origem', description: 'Escolha um canal e confirme a leitura de uma mensagem recente.', route: '/integrations?tab=bot', icon: Radio },
    { id: 'destinations' as const, title: 'Conectar canais de destino', description: 'Configure os destinos e conclua com um disparo de teste real.', route: '/channels', icon: Send },
  ];
  const steps: OnboardingStep[] = definitions.map((definition, index) => ({
    ...definition, done: Boolean(validated[index]), locked: index + 1 > currentStep, validatedAt: validated[index],
  }));

  return { steps, currentStep, allDone: Boolean(progress.completed_at) && validated.every(Boolean), loading, error, refresh: load };
};
