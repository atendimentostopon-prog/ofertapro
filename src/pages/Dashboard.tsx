import React from 'react';
import { ArrowUpRight, Lightbulb, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useBotStatus } from '../hooks/useBotStatus';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist';
import { getPlanLimits } from '../config/plans';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { Card } from '../components/ui/Card';
import ProductImage from '../components/shared/ProductImage';
import ChannelLogo from '../components/ui/ChannelLogo';
import { useUser } from '../context/UserContext';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { pluralize, toDisplayName } from '../lib/format';
import { LockedNumber } from '../components/billing/LockedNumber';
import { BotStatusCard } from '../components/dashboard/BotStatusCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { OperationalMetrics } from '../components/dashboard/OperationalMetrics';
import { AnalyticsZone } from '../components/dashboard/AnalyticsZone';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const stats = useDashboardStats();
  const bot = useBotStatus();
  const { user } = useUser();
  const access = useAccountAccess();

  const {
    totalClicksToday, totalClicks7d, totalClicks30d,
    dispatches30d, connectedChannels, activeOffers,
    topOffers, topMarketplace, topSource,
    clicksByDay, clicksBySource, recentHistory, insights,
    loading, error,
  } = stats;

  if (loading) {
    return <LoadingState type="spinner" />;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <ErrorState
          title="Não conseguimos atualizar as métricas agora"
          message="Você pode continuar usando o sistema. Tente atualizar as estatísticas novamente."
          onRetry={stats.refresh}
        />
      </div>
    );
  }

  const plan = stats.profile?.plan || user?.plan || 'free';
  const limits = getPlanLimits(plan);
  const showClicks = limits.advancedAnalytics;

  const channelLimit = limits.maxWhatsappConnections + limits.maxTelegramConnections;
  const channelLimited = limits.maxWhatsappConnections !== Infinity && channelLimit > 0;
  const channelsAtLimit = channelLimited && connectedChannels >= channelLimit;

  const getFirstName = () => {
    if (!user) return 'Usuário';
    if (user.preferred_name?.trim()) return user.preferred_name.trim();
    if (user.full_name?.trim() && user.full_name !== 'Usuário') return user.full_name.trim().split(' ')[0];
    const pName = user.publicName || user.public_display_name;
    if (pName?.trim() && pName !== 'Usuário') return pName.trim().split(' ')[0];
    if (user.username?.trim() && !user.username.includes('_temp')) return user.username.trim();
    if (user.email?.trim()) return user.email.split('@')[0];
    return 'Usuário';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-slide-up pb-8">
      <PageHeader
        title={`Olá, ${toDisplayName(getFirstName())}!`}
        description="Acompanhe seus disparos e o que o bot está fazendo."
      >
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-secondary bg-surface-0 border border-line rounded-md px-2.5 py-1.5">
          <Clock className="w-3 h-3 text-ink-tertiary" />
          <span>Atualizado agora</span>
        </div>
      </PageHeader>

      {access.isExpired && (
        <div className="rounded-2xl border border-danger/25 bg-danger-bg/40 p-5 sm:p-6 flex flex-col sm:flex-row gap-4">
          <div className="w-11 h-11 rounded-xl bg-danger-bg text-danger-ink flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-ink font-display">Seu acesso expirou</h3>
            <p className="text-sm text-ink-secondary mt-1 max-w-2xl">
              O teste grátis de 7 dias terminou e o bot parou de monitorar seus grupos. Suas ofertas,
              canais, grupos de origem e templates continuam salvos. Assine um plano e tudo volta a
              funcionar exatamente como estava.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => navigate('/pricing')} className="btn-gradient px-5 py-2 text-xs font-semibold cursor-pointer">
                Ver planos
              </button>
              <button onClick={() => navigate('/feedbacks')} className="btn-secondary px-5 py-2 text-xs font-semibold cursor-pointer">
                Falar com o suporte
              </button>
            </div>
          </div>
        </div>
      )}

      {access.isTrialing && (
        <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
          access.daysLeft <= 1 ? 'border-warning/30 bg-warning-bg/50' : 'border-mint-200 bg-ice/60'
        }`}>
          <Clock className={`w-4 h-4 flex-shrink-0 ${access.daysLeft <= 1 ? 'text-warning-ink' : 'text-mint-700'}`} />
          <p className={`text-xs font-medium flex-1 ${access.daysLeft <= 1 ? 'text-warning-ink' : 'text-mint-800'}`}>
            {access.daysLeft <= 1
              ? 'Último dia do teste grátis. Amanhã o bot para de monitorar e disparar até você assinar.'
              : `Teste grátis. Faltam ${access.daysLeft} dias. Depois disso o bot pausa até você assinar.`}
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer flex-shrink-0 ${
              access.daysLeft <= 1 ? 'bg-warning-ink text-white' : 'bg-mint-600 text-white hover:bg-mint-700'
            }`}
          >
            Assinar agora
          </button>
        </div>
      )}

      <OnboardingChecklist />

      <BotStatusCard
        view={bot.view}
        groupsCount={bot.groupsCount}
        errorMessage={bot.errorMessage}
        lastDispatchAt={recentHistory[0]?.sent_at ?? null}
        toggling={bot.toggling}
        onToggle={bot.setMonitoring}
        isExpired={access.isExpired}
        isLoading={bot.loading}
      />

      <QuickActions />

      <OperationalMetrics
        dispatches30d={dispatches30d}
        connectedChannels={connectedChannels}
        channelLimit={channelLimit}
        channelLimited={channelLimited}
        channelsAtLimit={channelsAtLimit}
        activeOffers={activeOffers}
        groupsMonitored={bot.groupsCount}
      />

      <AnalyticsZone
        showAnalytics={showClicks}
        totalClicksToday={totalClicksToday}
        totalClicks7d={totalClicks7d}
        totalClicks30d={totalClicks30d}
        clicksByDay={clicksByDay}
        clicksBySource={clicksBySource}
        topSource={topSource}
        topMarketplace={topMarketplace}
      />

      {insights.length > 0 && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-ice border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <h4 className="text-xs font-semibold text-mint-800 uppercase tracking-wider">Insights</h4>
            <ul className="space-y-1.5">
              {insights.map((insight: string, idx: number) => (
                <li key={idx} className="text-xs text-ink-secondary flex items-center gap-2 leading-relaxed">
                  <span className="w-1 h-1 rounded-full bg-mint-500 flex-shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-8 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Top Ofertas por Cliques</h2>
            <button onClick={() => navigate('/offers')} className="text-[11px] font-semibold text-mint-800 hover:text-mint-900 flex items-center gap-0.5 cursor-pointer transition-colors">
              Ver Ofertas <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {topOffers.length === 0 ? (
              <p className="text-xs text-ink-tertiary text-center py-6">Nenhuma oferta cadastrada.</p>
            ) : topOffers.map((offer: any, idx: number) => (
              <div key={offer.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 hover:bg-surface-2 transition-all group border border-line-subtle">
                <div className="w-6 h-6 rounded-md bg-ice border border-mint-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-mint-800">{idx + 1}</span>
                </div>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-0 border border-line flex-shrink-0">
                  <ProductImage src={offer.image} alt={offer.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{offer.name}</p>
                  <p className="text-[10px] text-ink-tertiary uppercase tracking-wider">{offer.marketplace}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-ink tabular-nums">
                    {showClicks
                      ? (offer.clicks || 0).toLocaleString('pt-BR')
                      : <LockedNumber>{(offer.clicks || 0).toLocaleString('pt-BR')}</LockedNumber>}
                  </p>
                  <p className="text-[9px] text-ink-tertiary uppercase">cliques</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Disparos Recentes</h2>
            <button onClick={() => navigate('/history')} className="text-[11px] font-semibold text-mint-800 hover:text-mint-900 flex items-center gap-0.5 cursor-pointer transition-colors">
              Ver Todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5 flex-1">
            {recentHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <p className="text-xs text-ink-tertiary py-6">Nenhum disparo efetuado ainda.</p>
              </div>
            ) : recentHistory.slice(0, 4).map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-xs p-2 rounded-md hover:bg-surface-1 transition-colors">
                <div className="w-9 h-9 rounded-md bg-surface-1 border border-line flex items-center justify-center flex-shrink-0">
                  <ChannelLogo name={h.successful_channels?.[0] || 'telegram'} size="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{h.offer_name}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-tertiary mt-0.5">
                    <span>{pluralize(h.channel_count || 0, 'canal', 'canais')}</span>
                    <span className="text-ink-disabled">·</span>
                    <span>{new Date(h.sent_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded-md text-[9px] font-semibold flex-shrink-0 ${
                  h.status === 'sent' || h.status === 'success' ? 'bg-success-bg text-success-ink' :
                  h.status === 'partial' ? 'bg-warning-bg text-warning-ink' : 'bg-danger-bg text-danger-ink'
                }`}>
                  {h.status === 'sent' || h.status === 'success' ? 'Sucesso' :
                   h.status === 'partial' ? 'Parcial' : 'Falhou'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
