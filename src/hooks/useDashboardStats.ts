import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { getPlanLimits } from '../config/plans';

export function useDashboardStats() {
  const { user } = useUser();
  const [stats, setStats] = useState<any>({
    totalClicksToday: 0,
    totalClicks7d: 0,
    totalClicks30d: 0,
    activeOffers: 0,
    connectedChannels: 0,
    topOffers: [],
    topMarketplace: 'Nenhum',
    topSource: 'Nenhuma',
    clicksByDay: [],
    clicksBySource: [],
    recentHistory: [],
    insights: [],
    loading: true,
    error: null
  });

  const loadStats = useCallback(async () => {
    if (!user?.id) {
      setStats(prev => ({ ...prev, loading: false }));
      return;
    }
    
    try {
      setStats(prev => ({ ...prev, loading: true, error: null }));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const todayStr = new Date().toISOString().split('T')[0];

      // Função helper para lidar com erros individuais de tabelas, timeouts e garantir fallback
      const fetchWithFallback = async (queryPromise: any, tableName: string, timeoutMs = 4000) => {
        try {
          const res = await Promise.race([
            Promise.resolve(queryPromise),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout ao obter dados da tabela ${tableName}`)), timeoutMs))
          ]);
          if (res.error) {
            console.error(`[DASHBOARD_STATS_ERROR] Erro ao buscar dados da tabela ${tableName}:`, res.error);
            return { data: [], error: res.error, isFallback: true };
          }
          return { data: res.data || [], error: null, isFallback: false };
        } catch (e: any) {
          console.error(`[DASHBOARD_STATS_ERROR] Exceção ou timeout na busca da tabela ${tableName}:`, e);
          return { data: [], error: e, isFallback: true };
        }
      };

      // Buscar ofertas, canais, histórico recente e cliques dos últimos 30 dias em paralelo com timeouts individuais
      const [offersRes, channelsRes, historyRes, clicksRes] = await Promise.all([
        fetchWithFallback(supabase.from('offers').select('*').eq('user_id', user.id), 'offers', 4000),
        fetchWithFallback(supabase.from('channels').select('*').eq('user_id', user.id), 'channels', 4000),
        fetchWithFallback(supabase.from('history').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5), 'history', 4000),
        // Otimização crucial: selecionar apenas as colunas necessárias para reduzir tamanho de dados na rede
        fetchWithFallback(supabase.from('clicks').select('created_at, source').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()), 'clicks', 4000)
      ]);

      // Se todas as consultas falharem catastróficamente (ex: erro de rede global), exibe o erro geral
      const allFailed = offersRes.isFallback && channelsRes.isFallback && historyRes.isFallback && clicksRes.isFallback;
      if (allFailed) {
        const firstError = offersRes.error || channelsRes.error || historyRes.error || clicksRes.error;
        throw new Error(firstError?.message || 'Falha catastrófica ao carregar métricas do banco de dados.');
      }

      // Não dar throw em erros individuais para evitar quebras no dashboard
      const offers = offersRes.data || [];
      const channels = channelsRes.data || [];
      const recentHistory = historyRes.data || [];
      const clicks = clicksRes.data || [];

      // 1. Contagens Básicas
      const activeOffersCount = offers.filter(o => o.status === 'active').length;
      const connectedChannelsCount = channels.filter(c => c.status === 'connected' || c.status === 'active').length;

      // 2. Cliques por Período
      const totalClicksToday = clicks.filter(c => c.created_at.startsWith(todayStr)).length;
      const totalClicks7d = clicks.filter(c => new Date(c.created_at) >= sevenDaysAgo).length;
      const totalClicks30d = clicks.length;

      // 3. Top 5 Ofertas
      const sortedOffers = [...offers]
        .sort((a, b) => (b.clicks || 0) - (a.clicks || 0))
        .slice(0, 5)
        .map(o => ({
          id: o.id,
          name: o.name,
          image: o.image,
          clicks: o.clicks || 0,
          marketplace: o.marketplace
        }));

      // 4. Melhor Marketplace (com base nas ofertas criadas)
      const marketplaceClicks: Record<string, number> = {};
      offers.forEach(o => {
        const mp = o.marketplace || 'Outros';
        marketplaceClicks[mp] = (marketplaceClicks[mp] || 0) + (o.clicks || 0);
      });
      let topMarketplace = 'Nenhum';
      let maxMarketplaceClicks = 0;
      Object.entries(marketplaceClicks).forEach(([mp, count]) => {
        if (count > maxMarketplaceClicks) {
          maxMarketplaceClicks = count;
          topMarketplace = mp;
        }
      });

      // 5. Cliques por Origem (Source) e Top Source
      const sourceClicks: Record<string, number> = {};
      clicks.forEach(c => {
        const src = c.source || 'direct';
        sourceClicks[src] = (sourceClicks[src] || 0) + 1;
      });
      let topSource = 'Nenhuma';
      let maxSourceClicks = 0;
      Object.entries(sourceClicks).forEach(([src, count]) => {
        if (count > maxSourceClicks) {
          maxSourceClicks = count;
          topSource = src;
        }
      });

      const clicksBySource = Object.entries(sourceClicks).map(([name, value]) => ({
        name: name === 'direct' ? 'Direto/Vitrine' : name.toUpperCase(),
        value
      }));

      // 6. Cliques nos Últimos 7 Dias ( clicksByDay )
      const clicksByDay = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const dayStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
        const dateISO = date.toISOString().split('T')[0];

        const count = clicks.filter(c => c.created_at.startsWith(dateISO)).length;
        return {
          date: dayStr,
          cliques: count
        };
      });

      // 7. Geração de Insights Automáticos Inteligentes
      const insights: string[] = [];

      if (connectedChannelsCount === 0) {
        insights.push("Você ainda não conectou nenhum canal. Integre o Discord, WhatsApp ou Telegram para disparar ofertas.");
      }

      if (totalClicks30d === 0) {
        insights.push("Ainda não recebemos cliques nas suas ofertas. Divulgue seus links nos canais para gerar as primeiras visitas.");
      } else {
        // Oferta mais clicada
        const bestOffer = sortedOffers[0];
        if (bestOffer && bestOffer.clicks > 0) {
          insights.push(`Sua oferta mais clicada é "${bestOffer.name.substring(0, 30)}..." com ${bestOffer.clicks} cliques. Continue compartilhando ela!`);
        }

        // Melhor canal
        if (topSource !== 'Nenhuma' && maxSourceClicks > 0) {
          const formattedSource = topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase();
          insights.push(`Seu melhor canal de conversão é o ${formattedSource}, gerando um total de ${maxSourceClicks} cliques.`);
        }

        // Melhor marketplace
        if (topMarketplace !== 'Nenhum' && maxMarketplaceClicks > 0) {
          insights.push(`O marketplace preferido do seu público é o ${topMarketplace.toUpperCase()} com ${maxMarketplaceClicks} cliques acumulados.`);
        }
      }

      setStats({
        totalClicksToday,
        totalClicks7d,
        totalClicks30d,
        activeOffers: activeOffersCount,
        connectedChannels: connectedChannelsCount,
        topOffers: sortedOffers,
        topMarketplace,
        topSource,
        clicksByDay,
        clicksBySource,
        recentHistory,
        insights,
        profile: user, // Expor dados de perfil para o Dashboard consumir os planos e informações corretos
        loading: false,
        error: null
      });

    } catch (err: any) {
      console.error('Erro ao calcular estatísticas do Dashboard:', err);
      setStats(prev => ({ 
        ...prev, 
        profile: user,
        loading: false, 
        error: err.message || 'Erro ao carregar estatísticas.' 
      }));
    }
  }, [user]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);


  return { ...stats, refresh: loadStats };
}
