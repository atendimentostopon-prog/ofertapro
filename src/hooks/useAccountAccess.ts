import { useMemo } from 'react';
import { useUser } from '../context/UserContext';

export type AccountStatus = 'trialing' | 'active' | 'expired' | 'canceled' | 'unknown';

export interface AccountAccess {
  status: AccountStatus;
  hasAccess: boolean;
  isTrialing: boolean;
  isExpired: boolean;
  daysLeft: number;
  trialEndsAt: Date | null;
}

export function useAccountAccess(): AccountAccess {
  const { user } = useUser();

  return useMemo(() => {
    const status = (user?.accountStatus ?? 'unknown') as AccountStatus;
    const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
    const now = Date.now();

    const trialActive =
      status === 'trialing' && !!trialEndsAt && trialEndsAt.getTime() > now;
    const hasAccess = status === 'active' || trialActive;

    // Janela entre trial_ends_at passar e o cron expire_trials rodar (ate 1h):
    // no banco status ainda e 'trialing', mas o acesso ja acabou e o servidor
    // ja bloqueia. Trata como expirado na UI pra nao mostrar a faixa de trial.
    const trialLapsed =
      status === 'trialing' && !!trialEndsAt && trialEndsAt.getTime() <= now;

    const daysLeft =
      trialEndsAt && trialEndsAt.getTime() > now
        ? Math.ceil((trialEndsAt.getTime() - now) / 86_400_000)
        : 0;

    return {
      status,
      hasAccess,
      isTrialing: status === 'trialing' && !trialLapsed,
      isExpired: status === 'expired' || status === 'canceled' || trialLapsed,
      daysLeft,
      trialEndsAt,
    };
  }, [user?.accountStatus, user?.trialEndsAt]);
}
