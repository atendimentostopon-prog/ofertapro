import React from 'react';
import {
  TrendingUp, MousePointerClick, Package, Radio,
  Activity, Clock, ArrowUpRight, Lightbulb, BarChart3, Sparkles
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboardStats';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist';
import { getPlanLimits } from '../config/plans';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { useUser } from '../context/UserContext';
import { ErrorState } from '../components/ui/ErrorState';
import ProductImage from '../components/shared/ProductImage';
import ChannelLogo from '../components/ui/ChannelLogo';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { pluralize, toDisplayName } from '../lib/format';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-0 rounded-md border border-line shadow-md p-3">
        <p className="text-xs font-semibold text-ink mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.name}:</span>
            <span className="font-semibold text-ink tabular-nums">{p.value.toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const stats = useDashboardStats();
  const { user } = useUser();
  const access = useAccountAccess();

  const {
    totalClicksToday,
    totalClicks7d,
    totalClicks30d,
    activeOffers,
    connectedChannels,
    topOffers,
    topMarketplace,
    topSource,
    clicksByDay,
    clicksBySource,
    recentHistory,
    insights,
    loading,
    error
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

  const limits = getPlanLimits(stats.profile?.plan || user?.plan || 'free');

  // Paleta Aflyo para o donut/série de canais
  const COLORS = ['#3DD98F', '#22C078', '#199A5F', '#88E5B8'];

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

  const metricCards = [
    { label: 'Hoje',    value: totalClicksToday, sub: 'cliques recebidos', icon: Activity,          accent: 'text-mint-700' },
    { label: '7 dias',  value: totalClicks7d,    sub: 'cliques na semana', icon: TrendingUp,        accent: 'text-success-ink' },
    { label: '30 dias', value: totalClicks30d,   sub: 'cliques no mês',    icon: MousePointerClick, accent: 'text-info-ink' },
  ];

  // Estado de "limite atingido" para os cards de uso (Ofertas / Canais)
  const offersLimited = limits.maxOffers !== Infinity;
  const offersAtLimit = offersLimited && activeOffers >= limits.maxOffers;
  const channelLimit = limits.maxWhatsappConnections + limits.maxTelegramConnections;
  const channelsLimited = limits.maxWhatsappConnections !== Infinity;
  const channelsAtLimit = channelsLimited && connectedChannels >= channelLimit;

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-slide-up pb-8">
      {/* Welcome Header */}
      <PageHeader
        title={`Olá, ${toDisplayName(getFirstName())}!`}
        description="Acompanhe suas métricas de vendas e engajamento."
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
          access.daysLeft <= 1
            ? 'border-warning/30 bg-warning-bg/50'
            : 'border-mint-200 bg-ice/60'
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

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} variant="metric" className="p-4 flex flex-col justify-between group">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">{m.label}</span>
                <Icon className={`w-4 h-4 ${m.accent} opacity-70 group-hover:opacity-100 transition-opacity`} />
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{m.value}</h3>
                <p className="text-[10px] text-ink-tertiary mt-0.5">{m.sub}</p>
              </div>
            </Card>
          );
        })}

        {/* Ofertas Ativas vs Limites */}
        <Card
          variant="metric"
          className="p-4 flex flex-col justify-between group"
          title={offersAtLimit ? 'Você atingiu o limite de ofertas ativas do seu plano. Faça upgrade para criar mais.' : undefined}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Ofertas</span>
            <Package className={`w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity ${offersAtLimit ? 'text-warning-ink' : 'text-ink-secondary'}`} />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{activeOffers}</h3>
              <span className="text-[10px] font-medium text-ink-tertiary">
                / {limits.maxOffers === Infinity ? '∞' : limits.maxOffers}
              </span>
            </div>
            {offersLimited && (
              <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-2 border border-line-subtle">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${offersAtLimit ? 'bg-warning' : 'bg-mint-500'}`}
                  style={{ width: `${Math.min((activeOffers / limits.maxOffers) * 100, 100)}%` }}
                />
              </div>
            )}
            {offersAtLimit && (
              <p className="text-[10px] font-semibold text-warning-ink mt-1.5">Limite atingido</p>
            )}
          </div>
        </Card>

        {/* Canais Conectados vs Limites */}
        <Card
          variant="metric"
          className="p-4 flex flex-col justify-between col-span-1 xs:col-span-2 sm:col-span-1 group"
          title={channelsAtLimit ? 'Você atingiu o limite de canais do seu plano. Faça upgrade para conectar mais.' : undefined}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Canais</span>
            <Radio className={`w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity ${channelsAtLimit ? 'text-warning-ink' : 'text-ink-secondary'}`} />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{connectedChannels}</h3>
              <span className="text-[10px] font-medium text-ink-tertiary">
                / {channelsLimited ? channelLimit : '∞'}
              </span>
            </div>
            {channelsLimited && (
              <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-2 border border-line-subtle">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${channelsAtLimit ? 'bg-warning' : 'bg-mint-500'}`}
                  style={{ width: `${Math.min((connectedChannels / channelLimit) * 100, 100)}%` }}
                />
              </div>
            )}
            {channelsAtLimit && (
              <p className="text-[10px] font-semibold text-warning-ink mt-1.5">Limite atingido</p>
            )}
          </div>
        </Card>
      </div>

      {/* Chart + Traffic Source */}
      <div className="grid grid-cols-12 gap-3">
        {/* Gráfico de Cliques Diários */}
        <Card className="col-span-12 lg:col-span-8 p-5 flex flex-col relative overflow-hidden min-h-[300px]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Cliques por Dia</h2>
              <p className="text-[11px] text-ink-secondary mt-0.5">Últimos 7 dias</p>
            </div>
            <div className="flex items-center gap-1.5 bg-ice border border-mint-200 rounded-full px-2.5 py-1 text-[10px] font-semibold text-mint-800">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-mint-500"></span>
              </span>
              AO VIVO
            </div>
          </div>

          {totalClicks30d === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center py-8 text-center">
              <EmptyState
                icon={BarChart3}
                title="Sem cliques para exibir"
                description="Crie sua primeira oferta e conecte um canal para começar a acompanhar seus resultados."
              />
            </div>
          ) : (
            <div className="flex-grow w-full min-h-[200px]">
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={clicksByDay} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCliques" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3DD98F" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#3DD98F" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 20, 24, 0.06)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#22C078" strokeWidth={2} fill="url(#colorCliques)" activeDot={{ r: 5, fill: '#22C078', stroke: '#FFFFFF', strokeWidth: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Origem dos Cliques */}
        <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col justify-between relative overflow-hidden min-h-[300px]">
          <div>
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Origem de Tráfego</h2>
            <p className="text-[11px] text-ink-secondary mt-0.5">Cliques por canal</p>
          </div>

          {/* Paywall overlay */}
          {!limits.advancedAnalytics && (
            <div className="absolute inset-0 bg-surface-0/85 backdrop-blur-xs z-20 flex flex-col items-center justify-center p-6 text-center rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-ice border border-mint-200 text-mint-700 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-ink mb-1 font-display">Analytics Completo</h4>
              <p className="text-xs text-ink-secondary leading-relaxed max-w-[200px]">
                Faça upgrade para visualizar cliques por canal e origem.
              </p>
              <button
                onClick={() => navigate('/pricing')}
                className="mt-4 btn-gradient py-2 px-5 text-xs font-semibold cursor-pointer"
              >
                Fazer Upgrade
              </button>
            </div>
          )}

          {totalClicks30d === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-xs text-ink-tertiary">Sem dados disponíveis.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-3 py-3">
              <div className="space-y-3">
                {clicksBySource.map((item: any, index: number) => (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-ink">{item.name}</span>
                      <span className="font-semibold text-ink tabular-nums">{item.value}</span>
                    </div>
                    <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden border border-line-subtle">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min((item.value / totalClicks30d) * 100, 100)}%`,
                          backgroundColor: COLORS[index % COLORS.length]
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-between">
                <div className="text-left">
                  <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Destaque</p>
                  <p className="text-xs font-semibold text-mint-800 capitalize mt-0.5">
                    {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Marketplace</p>
                  <p className="text-xs font-semibold text-ink capitalize mt-0.5">
                    {topMarketplace.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Insights */}
        {insights.length > 0 && (
          <Card className="col-span-12 p-4 flex flex-col sm:flex-row sm:items-start gap-3">
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

        {/* Top Ofertas por Cliques */}
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
                  <p className="text-sm font-bold text-ink tabular-nums">{(offer.clicks || 0).toLocaleString('pt-BR')}</p>
                  <p className="text-[9px] text-ink-tertiary uppercase">cliques</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Disparos Recentes */}
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
