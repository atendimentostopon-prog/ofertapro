// src/hooks/useInstagram.ts
import { useCallback, useEffect, useState } from 'react';
import { InstagramService } from '../services/InstagramService';
import type { IgAccount, IgAutomation, IgAutomationStatus } from '../types/instagram';

export function useInstagram() {
  const [accounts, setAccounts] = useState<IgAccount[]>([]);
  const [automations, setAutomations] = useState<IgAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [a, b] = await Promise.all([
        InstagramService.getAccounts(),
        InstagramService.getAutomations(),
      ]);
      setAccounts(a);
      setAutomations(b);
    } catch (e) {
      console.error('[useInstagram] falha ao carregar', e);
      setError('Não foi possível carregar suas automações de Instagram.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setStatus = useCallback(async (id: string, status: IgAutomationStatus) => {
    await InstagramService.setStatus(id, status);
    await refresh();
  }, [refresh]);

  const remove = useCallback(async (id: string) => {
    await InstagramService.deleteAutomation(id);
    await refresh();
  }, [refresh]);

  const disconnect = useCallback(async (accountId: string) => {
    await InstagramService.disconnect(accountId);
    await refresh();
  }, [refresh]);

  const completeConnect = useCallback(async (pendingId: string) => {
    const result = await InstagramService.completeConnect(pendingId);
    await refresh();
    return result;
  }, [refresh]);

  return {
    accounts, automations, loading, error, refresh,
    startConnect: InstagramService.startConnect,
    completeConnect,
    disconnect, setStatus, remove,
  };
}
