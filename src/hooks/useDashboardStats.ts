import { useDataRefresh } from './useDataRefresh';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';

// Brasil não tem múltiplos fusos relevantes pro produto; fixamos America/Sao_Paulo
// em vez de usar o fuso do navegador (toISOString é UTC, toLocaleDateString depende
// do SO do usuário) pra "hoje" e o gráfico baterem sempre com o horário de Brasília.
const TIMEZONE = 'America/Sao_Paulo';

function toSPDateString(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // en-CA formata como YYYY-MM-DD, igual ao formato usado nos timestamps ISO
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(d);
}

function toSPDayMonth(date: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: TIMEZONE, day: '2-digit', month: '2-digit' }).format(date);
}

export function useDashboardStats() {
  const { user } = useUser();
  const requestVersion = useRef(0);
  const [stats, setStats] = useState<any>({
    totalClicksToday: 0,
    totalClicks7d: 0,
    totalClicks30d: 0,
    dispatches30d: 0,
    activeOffers: 0,
    connectedChannels: 0,
    connectedWhatsappChannels: 0,
    connectedTelegramChannels: 0,
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
    const version = ++requestVersion.current;
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

      const todayStr = toSPDateString(new Date());

      // Função helper para lidar com erros individuais de tabelas, timeouts e garantir fallback
      const fetchWithFallback = async (queryPromise: any, tableName: string, timeoutMs = 10000) => {
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          const res = await Promise.race([
            Promise.resolve(queryPromise),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error(`Timeout ao obter dados da tabela ${tableName}`)), timeoutMs);
            })
          ]);
          if (timeoutId) clearTimeout(timeoutId);
          if (res.error) {
            console.error(`[DASHBOARD_STATS_ERROR] Erro ao buscar dados da tabela ${tableName}:`, res.error);
            return { data: [], error: res.error, isFallback: true, count: 0 };
          }
          return { data: res.data || [], error: null, isFallback: false, count: res.count ?? 0 };
        } catch (e: any) {
          if (timeoutId) clearTimeout(timeoutId);
          console.error(`[DASHBOARD_STATS_ERROR] Exceção ou timeout na busca da tabela ${tableName}:`, e);
          return { data: [], error: e, isFallback: true, count: 0 };
        }
      };

      // Buscar ofertas, canais, histórico recente e cliques dos últimos 30 dias em paralelo com timeouts individuais
      const [offersRes, channelsRes, historyRes, dispatchCountRes, clicksRes] = await Promise.all([
        fetchWithFallback(supabase.from('offers').select('*').eq('user_id', user.id), 'offers'),
        fetchWithFallback(supabase.from('channels').select('*').eq('user_id', user.id), 'channels'),
        fetchWithFallback(supabase.from('history').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5), 'history'),
        fetchWithFallback(supabase.from('history').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('sent_at', thirtyDaysAgo.toISOString()), 'history_count'),
        // offer_id incluído pra poder ranquear "produtos mais clicados" a partir
        // do evento real em vez do contador denormalizado offers.clicks (ver nota
        // abaixo) -- ainda leve, mesma tabela/período já buscados.
        fetchWithFallback(supabase.from('clicks').select('created_at, source, offer_id').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()), 'clicks')
      ]);

      if (version !== requestVersion.current) return;

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
      const connectedWhatsappChannels = channels.filter(c =>
        (c.type === 'whatsapp' || c.type === 'whatsapp_group') && (c.status === 'connected' || c.status === 'active')
      ).length;
      const connectedTelegramChannels = channels.filter(c =>
        (c.type === 'telegram' || c.type === 'telegram_group') && (c.status === 'connected' || c.status === 'active')
      ).length;

      // 2. Cliques por Período
      const totalClicksToday = clicks.filter(c => toSPDateString(c.created_at) === todayStr).length;
      const totalClicks7d = clicks.filter(c => new Date(c.created_at) >= sevenDaysAgo).length;
      const totalClicks30d = clicks.length;

      // 3. Top 5 Ofertas (últimos 30 dias)
      // Ranqueia pelos eventos reais da tabela `clicks` em vez do contador
      // denormalizado `offers.clicks` -- esse contador depende de um trigger
      // (`handle_new_click`, supabase_clicks_schema.sql) pra ficar em sincronia,
      // e cliques apareciam nos gráficos de cliques/dia (que já liam `clicks`
      // direto) sem refletir aqui. Somando o evento real elimina essa classe de
      // bug de vez, sem depender do trigger estar de fato aplicado em produção.
      const clicksByOffer: Record<string, number> = {};
      clicks.forEach((c: { offer_id: string }) => {
        clicksByOffer[c.offer_id] = (clicksByOffer[c.offer_id] || 0) + 1;
      });
      const sortedOffers = [...offers]
        .map(o => ({
          id: o.id,
          name: o.name,
          image: o.image,
          clicks: clicksByOffer[o.id] || 0,
          marketplace: o.marketplace
        }))
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5);

      // 4. Melhor Marketplace (com base nos cliques reais, mesmo motivo do item 3)
      const marketplaceClicks: Record<string, number> = {};
      offers.forEach(o => {
        const mp = o.marketplace || 'Outros';
        marketplaceClicks[mp] = (marketplaceClicks[mp] || 0) + (clicksByOffer[o.id] || 0);
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
        name: name === 'direct' || name === 'public_page' ? 'Vitrine' : name.toUpperCase(),
        value
      }));

      // 6. Cliques nos Últimos 7 Dias ( clicksByDay )
      const clicksByDay = Array.from({ length: 7 }).map((_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        const dayStr = toSPDayMonth(date);
        const dateISO = toSPDateString(date);

        const count = clicks.filter(c => toSPDateString(c.created_at) === dateISO).length;
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
        dispatches30d: dispatchCountRes.count,
        activeOffers: activeOffersCount,
        connectedChannels: connectedChannelsCount,
        connectedWhatsappChannels,
        connectedTelegramChannels,
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
      if (version !== requestVersion.current) return;
      console.error('Erro ao calcular estatísticas do Dashboard:', err);
      setStats(prev => ({ 
        ...prev, 
        profile: user,
        loading: false, 
        error: err.message || 'Erro ao carregar estatísticas.' 
      }));
    }
  }, [user]);

  const invalidateRequests = useCallback(() => {
    requestVersion.current++;
  }, []);

  useEffect(() => {
    void loadStats();
    return invalidateRequests;
  }, [loadStats, invalidateRequests]);


  useDataRefresh(user?.id, ['offers', 'channels', 'history', 'clicks'], loadStats);
  return { ...stats, refresh: loadStats };
}
