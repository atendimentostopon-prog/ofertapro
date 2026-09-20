import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { DATA_CHANGED, type AccountResource } from '../lib/dataEvents';

// Local mutations update mounted views without depending on Realtime delivery.
export function useDataRefresh(userId: string | undefined, resources: AccountResource[], refresh: () => unknown) {
  const callback = useRef(refresh);
  useEffect(() => { callback.current = refresh; }, [refresh]);
  const tables = resources.join(',');
  useEffect(() => {
    if (!userId) return;
    const names = tables.split(',');
    const reload = () => { void callback.current(); };
    const onChange = (event: Event) => {
      if (names.includes((event as CustomEvent<string>).detail)) reload();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') reload(); };
    const channel = supabase.channel('data-' + userId + '-' + crypto.randomUUID());
    for (const table of names) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: 'user_id=eq.' + userId }, reload);
    }
    channel.subscribe();
    window.addEventListener(DATA_CHANGED, onChange);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener(DATA_CHANGED, onChange);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId, tables]);
}
