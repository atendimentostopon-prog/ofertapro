import { useUser } from '../context/UserContext';
export type { Subscription } from '../lib/subscription';

// One snapshot, request and Realtime channel shared by every consumer.
export function useSubscription() {
  const { subscription, subscriptionLoading, subscriptionError, refreshProfile } = useUser();
  return { data: subscription, loading: subscriptionLoading, error: subscriptionError, refresh: refreshProfile };
}
