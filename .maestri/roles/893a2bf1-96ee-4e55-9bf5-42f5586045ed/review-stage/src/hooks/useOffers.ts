import { useState, useEffect, useCallback, useRef } from 'react';
import { OfferService } from '../services/OfferService';
import { useUser } from '../context/UserContext';
import { useDataRefresh } from './useDataRefresh';

export function useOffers() {
  const { user } = useUser();
  const userId = user?.id;
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const requestVersion = useRef(0);

  const loadOffers = useCallback(async () => {
    if (!userId) return;
    const version = ++requestVersion.current;
    try {
      const data = await OfferService.getOffers(userId);
      if (version !== requestVersion.current) return;
      setOffers(data || []);
      setError(null);
    } catch (err) {
      if (version === requestVersion.current) setError(err);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    setOffers([]);
    setError(null);
    setLoading(!!userId);
    void loadOffers();
    return () => { requestVersion.current++; };
  }, [userId, loadOffers]);

  useDataRefresh(userId, ['offers'], loadOffers);

  const deleteOffer = async (id: string) => {
    await OfferService.deleteOffer(id);
    setOffers(previous => previous.filter(offer => offer.id !== id));
  };
  const deleteAllOffers = async (ids: string[]) => {
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const batch = ids.slice(i, i + 10);
        const results = await Promise.allSettled(batch.map(id => OfferService.deleteOffer(id)));
        const deleted = batch.filter((_, index) => results[index].status === 'fulfilled');
        setOffers(previous => previous.filter(offer => !deleted.includes(offer.id)));
        const failure = results.find(result => result.status === 'rejected');
        if (failure?.status === 'rejected') throw failure.reason;
      }
    } finally {
      await loadOffers();
    }
  };
  const toggleStatus = async (id: string, currentStatus: string) => {
    const status = await OfferService.toggleStatus(id, currentStatus);
    setOffers(previous => previous.map(offer => offer.id === id ? { ...offer, status } : offer));
  };
  return { offers, loading, error, refresh: loadOffers, deleteOffer, deleteAllOffers, toggleStatus };
}
