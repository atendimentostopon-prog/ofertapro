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

    const daysLeft =
      trialEndsAt && trialEndsAt.getTime() > now
        ? Math.ceil((trialEndsAt.getTime() - now) / 86_400_000)
        : 0;

    return {
      status,
      hasAccess,
      isTrialing: status === 'trialing',
      isExpired: status === 'expired' || status === 'canceled',
      daysLeft,
      trialEndsAt,
    };
  }, [user?.accountStatus, user?.trialEndsAt]);
}
