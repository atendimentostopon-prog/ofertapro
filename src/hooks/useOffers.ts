import { useState, useEffect, useCallback, useRef } from 'react';
import { OfferService } from '../services/OfferService';
import { useUser } from '../context/UserContext';

export function useOffers() {
  const { user } = useUser();
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<any>(null);
  const lastLoadedUserIdRef = useRef<string | null>(null);

  const loadOffers = useCallback(async (force = false) => {
    if (!user || !user.id) {
      setLoading(false);
      return;
    }

    // Se já carregou para este mesmo usuário e não for um force refresh, ignora para evitar loops
    if (!force && lastLoadedUserIdRef.current === user.id && offers.length > 0) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      const data = await OfferService.getOffers(user.id);
      setOffers(data || []);
      lastLoadedUserIdRef.current = user.id;
    } catch (err) {
      console.error('[useOffers] Erro ao carregar ofertas:', err);
      setError(err);
      lastLoadedUserIdRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [user, offers.length]);

  useEffect(() => {
    if (user && user.id) {
      loadOffers();
    } else if (!user) {
      setLoading(false);
    }
  }, [user, loadOffers]);

  const deleteOffer = async (id: string) => {
    try {
      await OfferService.deleteOffer(id);
      setOffers(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      console.error('[useOffers] Erro ao deletar oferta:', err);
      throw err;
    }
  };

  const toggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = await OfferService.toggleStatus(id, currentStatus);
      setOffers(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    } catch (err) {
      console.error('[useOffers] Erro ao alternar status da oferta:', err);
      throw err;
    }
  };

  return { 
    offers, 
    loading, 
    error, 
    refresh: () => loadOffers(true), 
    deleteOffer, 
    toggleStatus 
  };
}
