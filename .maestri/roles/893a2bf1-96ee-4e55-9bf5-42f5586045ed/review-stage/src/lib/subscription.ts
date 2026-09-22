import type { User } from '../types';

export interface Subscription {
  id: string;
  user_id: string;
  provider_subscription_id: string;
  plan_code: 'starter' | 'pro' | 'enterprise';
  billing_cycle: 'monthly' | 'yearly';
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  amount: number;
  installments: number | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  grace_period_ends_at?: string | null;
}

export function hasSubscriptionAccess(subscription: Subscription | null, now = Date.now()): boolean {
  if (!subscription) return false;
  if (subscription.status === 'active') {
    return !subscription.cancel_at_period_end || Date.parse(subscription.current_period_end) > now;
  }
  return subscription.status === 'past_due' &&
    Date.parse(subscription.grace_period_ends_at || subscription.current_period_end) > now;
}

export function resolveAccountPlan(
  profile: { plan?: User['plan']; account_status?: User['accountStatus'] },
  subscription: Subscription | null,
) {
  if (hasSubscriptionAccess(subscription)) {
    return { plan: subscription!.plan_code, accountStatus: 'active' as const };
  }
  return { plan: profile.plan || 'free', accountStatus: profile.account_status };
}
