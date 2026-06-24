import React from 'react';
import {
  TrendingUp, MousePointerClick, Package, Radio, Zap,
  Activity, Clock, ArrowUpRight, Lightbulb, BarChart3, Sparkles, Send
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboardStats';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist';
import { getPlanLimits } from '../config/plans';
import Badge from '../components/Badge';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { Avatar } from '../components/ui/Avatar';
import { useUser } from '../context/UserContext';
import { ErrorState } from '../components/ui/ErrorState';
import ProductImage from '../components/shared/ProductImage';
import ChannelLogo from '../components/ui/ChannelLogo';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-2 rounded-xl border border-white/[0.08] shadow-xl p-3">
        <p className="text-xs font-medium text-slate-100 mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-400">{p.name}:</span>
            <span className="font-semibold text-slate-100">{p.value.toLocaleString('pt-BR')}</span>
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

  const COLORS = ['#6366F1', '#818CF8', '#3B82F6', '#22C55E'];

  const getFirstName = () => {
    if (!user) return 'Usuário';
    
    if (user.preferred_name?.trim()) {
      return user.preferred_name.trim();
    }
    
    if (user.full_name?.trim() && user.full_name !== 'Usuário') {
      return user.full_name.trim().split(' ')[0];
    }
    
    const pName = user.publicName || user.public_display_name;
    if (pName?.trim() && pName !== 'Usuário') {
      return pName.trim().split(' ')[0];
    }
    
    if (user.username?.trim() && !user.username.includes('_temp')) {
      return user.username.trim();
    }
    
    if (user.email?.trim()) {
      return user.email.split('@')[0];
    }
    
    return 'Usuário';
  };

  // Helper to detect channel type for icons
  const getChannelIcon = (channelName: string) => {
    const lower = channelName?.toLowerCase() || '';
    if (lower.includes('telegram')) return 'telegram';
    if (lower.includes('discord')) return 'discord';
    return 'whatsapp';
  };

  // Metric cards data
  const metricCards = [
    { label: 'Hoje', value: totalClicksToday, sub: 'cliques recebidos', icon: Activity, color: 'text-brand-400' },
    { label: '7 dias', value: totalClicks7d, sub: 'cliques na semana', icon: TrendingUp, color: 'text-emerald-400' },
    { label: '30 dias', value: totalClicks30d, sub: 'cliques no mês', icon: MousePointerClick, color: 'text-blue-400' },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-slide-up pb-8">
      {/* Welcome Header */}
      <PageHeader
        title={`Olá, ${getFirstName()}!`}
        description="Acompanhe suas métricas de vendas e engajamento."
      >
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 bg-surface-2 border border-white/[0.04] rounded-lg px-2.5 py-1.5">
          <Clock className="w-3 h-3 text-slate-500" />
          <span>Atualizado agora</span>
        </div>
      </PageHeader>

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Click Metrics */}
        {metricCards.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label} variant="metric" className="p-4 flex flex-col justify-between group hover:border-white/[0.08] transition-all">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{m.label}</span>
                <Icon className={`w-4 h-4 ${m.color} opacity-60 group-hover:opacity-100 transition-opacity`} />
              </div>
              <div className="mt-3">
                <h3 className="text-2xl font-bold text-slate-100 tracking-tight tabular-nums">{m.value}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5">{m.sub}</p>
              </div>
            </Card>
          );
        })}

        {/* Ofertas Ativas vs Limites */}
        <Card variant="metric" className="p-4 flex flex-col justify-between group hover:border-white/[0.08] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Ofertas</span>
            <Package className="w-4 h-4 text-purple-400 opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <h3 className="text-2xl font-bold text-slate-100 tracking-tight tabular-nums">{activeOffers}</h3>
              <span className="text-[10px] font-medium text-slate-500">
                / {limits.maxOffers === Infinity ? '∞' : limits.maxOffers}
              </span>
            </div>
            {limits.maxOffers !== Infinity && (
              <div className="w-full bg-surface-0 h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500/60 to-purple-400/80 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((activeOffers / limits.maxOffers) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Canais Conectados vs Limites */}
        <Card variant="metric" className="p-4 flex flex-col justify-between col-span-1 xs:col-span-2 sm:col-span-1 group hover:border-white/[0.08] transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Canais</span>
            <Radio className="w-4 h-4 text-sky-400 opacity-60 group-hover:opacity-100 transition-opacity" />
          </div>
          <div className="mt-3">
            <div className="flex items-baseline gap-1">
              <h3 className="text-2xl font-bold text-slate-100 tracking-tight tabular-nums">{connectedChannels}</h3>
              <span className="text-[10px] font-medium text-slate-500">
                / {limits.maxChannels === Infinity ? '∞' : limits.maxChannels}
              </span>
            </div>
            {limits.maxChannels !== Infinity && (
              <div className="w-full bg-surface-0 h-1.5 rounded-full overflow-hidden mt-2">
                <div 
                  className="h-full bg-gradient-to-r from-sky-500/60 to-sky-400/80 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((connectedChannels / limits.maxChannels) * 100, 100)}%` }}
                />
              </div>
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
              <h2 className="text-sm font-semibold text-slate-100 tracking-tight">Cliques por Dia</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">Últimos 7 dias</p>
            </div>
            <div className="flex items-center gap-1.5 bg-surface-1 border border-white/[0.04] rounded-full px-2.5 py-1 text-[10px] font-medium text-slate-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-500"></span>
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
                      <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#6366F1" strokeWidth={2} fill="url(#colorCliques)" activeDot={{ r: 5, fill: '#6366F1', stroke: '#0F1629', strokeWidth: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Origem dos Cliques */}
        <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col justify-between relative overflow-hidden min-h-[300px]">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 tracking-tight">Origem de Tráfego</h2>
            <p className="text-[11px] text-slate-400 mt-0.5">Cliques por canal</p>
          </div>

          {/* Paywall overlay */}
          {!limits.advancedAnalytics && (
            <div className="absolute inset-0 bg-surface-2/90 backdrop-blur-[3px] z-20 flex flex-col items-center justify-center p-6 text-center rounded-2xl">
              <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.06] text-brand-400 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h4 className="text-sm font-semibold text-slate-100 mb-1">Analytics Completo</h4>
              <p className="text-xs text-slate-400 leading-relaxed max-w-[200px]">
                Faça upgrade para visualizar cliques por canal e origem.
              </p>
              <button 
                onClick={() => navigate('/settings')}
                className="mt-4 btn-gradient py-2 px-5 text-xs font-semibold cursor-pointer"
              >
                Fazer Upgrade
              </button>
            </div>
          )}

          {totalClicks30d === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-xs text-slate-500">Sem dados disponíveis.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-3 py-3">
              <div className="space-y-3">
                {clicksBySource.map((item: any, index: number) => (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-300">{item.name}</span>
                      <span className="font-semibold text-slate-100 tabular-nums">{item.value}</span>
                    </div>
                    <div className="w-full bg-surface-0 h-1.5 rounded-full overflow-hidden">
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

              <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                <div className="text-left">
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Destaque</p>
                  <p className="text-xs font-semibold text-brand-400 capitalize mt-0.5">
                    {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wider">Marketplace</p>
                  <p className="text-xs font-semibold text-purple-400 capitalize mt-0.5">
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
            <div className="w-10 h-10 rounded-xl bg-brand-500/8 border border-brand-500/12 flex items-center justify-center text-brand-400 flex-shrink-0">
              <Lightbulb className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <h4 className="text-xs font-semibold text-brand-400 uppercase tracking-wider">Insights</h4>
              <ul className="space-y-1.5">
                {insights.map((insight: string, idx: number) => (
                  <li key={idx} className="text-xs text-slate-400 flex items-center gap-2 leading-relaxed">
                    <span className="w-1 h-1 rounded-full bg-brand-500 flex-shrink-0" />
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
            <h2 className="text-sm font-semibold text-slate-100 tracking-tight">Top Ofertas por Cliques</h2>
            <button onClick={() => navigate('/offers')} className="text-[11px] font-medium text-brand-400 hover:text-brand-300 flex items-center gap-0.5 cursor-pointer transition-colors">
              Ver Ofertas <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {topOffers.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">Nenhuma oferta cadastrada.</p>
            ) : topOffers.map((offer: any, idx: number) => (
              <div key={offer.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-3/30 hover:bg-surface-3/50 transition-all group">
                <div className="w-6 h-6 rounded-lg bg-brand-500/10 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-brand-400">{idx + 1}</span>
                </div>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-0 flex-shrink-0">
                  <ProductImage src={offer.image} alt={offer.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-100 truncate">{offer.name}</p>
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider">{offer.marketplace}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-brand-400 tabular-nums">{(offer.clicks || 0).toLocaleString('pt-BR')}</p>
                  <p className="text-[9px] text-slate-500 uppercase">cliques</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Disparos Recentes */}
        <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-100 tracking-tight">Disparos Recentes</h2>
            <button onClick={() => navigate('/history')} className="text-[11px] font-medium text-brand-400 hover:text-brand-300 flex items-center gap-0.5 cursor-pointer transition-colors">
              Ver Todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5 flex-1">
            {recentHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <p className="text-xs text-slate-500 py-6">Nenhum disparo efetuado ainda.</p>
              </div>
            ) : recentHistory.slice(0, 4).map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-xs p-2 rounded-lg hover:bg-surface-3/30 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-surface-3 border border-white/[0.04] flex items-center justify-center flex-shrink-0">
                  <ChannelLogo name={h.successful_channels?.[0] || 'telegram'} size="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-100 truncate">{h.offer_name}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-0.5">
                    <span>{h.channel_count} canal(is)</span>
                    <span className="text-slate-600">·</span>
                    <span>{new Date(h.sent_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded-md text-[9px] font-semibold flex-shrink-0 ${
                  h.status === 'sent' || h.status === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                  h.status === 'partial' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
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
