import React from 'react';
import {
  TrendingUp, MousePointerClick, Package, Radio, Zap,
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
import Badge from '../components/Badge';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { Avatar } from '../components/ui/Avatar';
import { useUser } from '../context/UserContext';
import { ErrorState } from '../components/ui/ErrorState';
import ProductImage from '../components/shared/ProductImage';

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#101827] rounded-xl border border-white/10 shadow-2xl p-3">
        <p className="text-xs font-semibold text-[#F8FAFC] mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-[#94A3B8]">{p.name}:</span>
            <span className="font-semibold text-[#F8FAFC]">{p.value.toLocaleString('pt-BR')}</span>
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

  const COLORS = ['#7C3AED', '#ec4899', '#3b82f6', '#10b981'];

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

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-slide-up pb-8">
      {/* Welcome Header */}
      <PageHeader
        title={`Olá, ${getFirstName()}! 👋`}
        description="Veja como estão as suas vendas e engajamento multicanal hoje."
      >

        <div className="flex items-center gap-2 text-[10px] font-bold text-[#94A3B8] bg-[#101827] border border-white/5 rounded-xl px-3 py-2 shadow-sm">
          <Clock className="w-3.5 h-3.5 text-[#64748B]" />
          <span>Atualizado agora</span>
        </div>
      </PageHeader>

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Bento Grid de Métricas do SaaS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Cliques Hoje */}
        <Card className="p-5 flex flex-col justify-between hover:border-white/10 transition-all">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Cliques Hoje</span>
            <Activity className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-[#F8FAFC] tracking-tight">{totalClicksToday}</h3>
            <p className="text-[10px] text-[#64748B] font-medium mt-1">Acessos recebidos nas últimas 24h.</p>
          </div>
        </Card>

        {/* Cliques 7d */}
        <Card className="p-5 flex flex-col justify-between hover:border-white/10 transition-all">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Últimos 7 dias</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-[#F8FAFC] tracking-tight">{totalClicks7d}</h3>
            <p className="text-[10px] text-[#64748B] font-medium mt-1">Cliques gerados na semana.</p>
          </div>
        </Card>

        {/* Cliques 30d */}
        <Card className="p-5 flex flex-col justify-between hover:border-white/10 transition-all">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Últimos 30 dias</span>
            <MousePointerClick className="w-4 h-4 text-pink-400" />
          </div>
          <div className="mt-4">
            <h3 className="text-2xl font-black text-[#F8FAFC] tracking-tight">{totalClicks30d}</h3>
            <p className="text-[10px] text-[#64748B] font-medium mt-1">Cliques no mês corrente.</p>
          </div>
        </Card>

        {/* Ofertas Ativas vs Limites */}
        <Card className="p-5 flex flex-col justify-between hover:border-white/10 transition-all">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Ofertas Ativas</span>
            <Package className="w-4 h-4 text-purple-400" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-[#F8FAFC] tracking-tight">{activeOffers}</h3>
              <span className="text-[10px] font-bold text-[#64748B]">
                / {limits.maxOffers === Infinity ? '∞' : limits.maxOffers}
              </span>
            </div>
            {limits.maxOffers !== Infinity && (
              <div className="w-full bg-[#070A12] h-1.5 rounded-full overflow-hidden mt-1.5">
                <div 
                  className="h-full bg-purple-600 rounded-full transition-all"
                  style={{ width: `${Math.min((activeOffers / limits.maxOffers) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        </Card>

        {/* Canais Conectados vs Limites */}
        <Card className="p-5 flex flex-col justify-between hover:border-white/10 transition-all">
          <div className="flex items-center justify-between text-[#64748B]">
            <span className="text-[11px] font-bold uppercase tracking-wider">Canais Conectados</span>
            <Radio className="w-4 h-4 text-sky-400" />
          </div>
          <div className="mt-4">
            <div className="flex items-baseline gap-1.5">
              <h3 className="text-2xl font-black text-[#F8FAFC] tracking-tight">{connectedChannels}</h3>
              <span className="text-[10px] font-bold text-[#64748B]">
                / {limits.maxChannels === Infinity ? '∞' : limits.maxChannels}
              </span>
            </div>
            {limits.maxChannels !== Infinity && (
              <div className="w-full bg-[#070A12] h-1.5 rounded-full overflow-hidden mt-1.5">
                <div 
                  className="h-full bg-sky-600 rounded-full transition-all"
                  style={{ width: `${Math.min((connectedChannels / limits.maxChannels) * 100, 100)}%` }}
                />
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Grid de Seções Avançadas */}
      <div className="grid grid-cols-12 gap-4">
        {/* Gráfico de Cliques Diários (Esquerda) */}
        <Card className="col-span-12 lg:col-span-8 p-6 flex flex-col relative overflow-hidden min-h-[340px]">
          <div className="flex items-start justify-between mb-5">
            <div>
              <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Cliques por Dia</h2>
              <p className="text-[11px] font-medium text-[#94A3B8] mt-0.5">Visitas acumuladas nos últimos 7 dias</p>
            </div>
            <div className="flex items-center gap-1.5 bg-[#070A12] border border-white/5 rounded-full px-2.5 py-1 text-[10px] font-bold text-[#94A3B8]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
              </span>
              AO VIVO
            </div>
          </div>

          {/* Gráfico principal */}
          {totalClicks30d === 0 ? (
            <div className="flex-grow flex flex-col items-center justify-center py-10 text-center">
              <EmptyState
                icon={BarChart3}
                title="Sem cliques para exibir"
                description="Crie sua primeira oferta e conecte um canal para começar a acompanhar seus resultados."
              />
            </div>
          ) : (
            <div className="flex-grow w-full min-h-[230px]">
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={clicksByDay} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorCliques" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#7C3AED" strokeWidth={2.5} fill="url(#colorCliques)" activeDot={{ r: 5, fill: '#7C3AED' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Origem dos Cliques e Canal Destaque (Direita) */}
        <Card className="col-span-12 lg:col-span-4 p-6 flex flex-col justify-between relative overflow-hidden min-h-[340px]">
          <div>
            <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Melhor Origem de Tráfego</h2>
            <p className="text-[11px] font-medium text-[#94A3B8] mt-0.5">Desempenho de cliques agrupado por mídia</p>
          </div>

          {/* Ocultar ou Desfocar se for Plano Free (Analytics Completo) */}
          {!limits.advancedAnalytics && (
            <div className="absolute inset-0 bg-[#101827]/90 backdrop-blur-[4px] z-20 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 text-indigo-400 flex items-center justify-center shadow-lg mb-3">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <h4 className="text-xs font-bold text-[#F8FAFC]">Analytics Completo no Starter! 🚀</h4>
              <p className="text-[10px] text-[#94A3B8] font-medium leading-relaxed max-w-[200px] mt-1">
                Faça o upgrade do plano para visualizar cliques por canal e origem de tráfego.
              </p>
              <button 
                onClick={() => navigate('/settings')}
                className="mt-4 bg-[#7C3AED] hover:bg-[#8b5cf6] text-white font-bold py-2 px-4 rounded-xl text-[10px] shadow-lg shadow-indigo-950/20 transition-colors"
              >
                Fazer Upgrade
              </button>
            </div>
          )}

          {totalClicks30d === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-xs text-[#64748B] italic">Sem dados de origem disponíveis.</p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col justify-center gap-4 py-4">
              <div className="space-y-3">
                {clicksBySource.map((item: any, index: number) => (
                  <div key={item.name} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#94A3B8]">{item.name}</span>
                      <span className="font-bold text-[#F8FAFC]">{item.value} cliques</span>
                    </div>
                    <div className="w-full bg-[#070A12] h-2 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${Math.min((item.value / totalClicks30d) * 100, 100)}%`,
                          backgroundColor: COLORS[index % COLORS.length] 
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                <div className="text-left">
                  <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">Destaque</p>
                  <p className="text-xs font-black text-indigo-400 capitalize mt-0.5">
                    {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider">Marketplace</p>
                  <p className="text-xs font-black text-purple-400 capitalize mt-0.5">
                    {topMarketplace.toUpperCase()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Insights Automáticos */}
        {insights.length > 0 && (
          <Card className="col-span-12 p-5 bg-indigo-950/10 border-indigo-500/10 flex flex-col sm:flex-row sm:items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#162033] border border-white/5 flex items-center justify-center text-indigo-400 flex-shrink-0">
              <Lightbulb className="w-5 h-5 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Insights Inteligentes do Link Oferta</h4>
              <ul className="space-y-1.5">
                {insights.map((insight: string, idx: number) => (
                  <li key={idx} className="text-xs text-[#94A3B8] font-medium flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7C3AED] flex-shrink-0" />
                    <span>{insight}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        )}

        {/* Bento Grid: Top Ofertas por Cliques (Esquerda) */}
        <Card className="col-span-12 lg:col-span-8 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Top Ofertas por Cliques</h2>
            <button onClick={() => navigate('/offers')} className="text-[11px] font-bold text-[#7C3AED] hover:text-[#8b5cf6] flex items-center gap-0.5">
              Ver Ofertas <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2">
            {topOffers.length === 0 ? (
              <p className="text-xs text-[#64748B] italic text-center py-6">Nenhuma oferta cadastrada.</p>
            ) : topOffers.map((offer: any, idx: number) => (
              <div key={offer.id} className="flex items-center gap-3 p-2.5 rounded-xl border border-white/5 bg-[#162033]/30 hover:border-white/10 transition-all group">
                <div className="w-6 h-6 rounded-md bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-indigo-400">{idx + 1}</span>
                </div>
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-slate-950 flex-shrink-0">
                  <ProductImage src={offer.image} alt={offer.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#F8FAFC] truncate">{offer.name}</p>
                  <p className="text-[10px] font-semibold text-[#64748B] uppercase tracking-wider">{offer.marketplace}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-[#7C3AED]">{(offer.clicks || 0).toLocaleString('pt-BR')}</p>
                  <p className="text-[9px] font-bold text-[#64748B] uppercase">cliques</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Bento Grid: Atividade Recente (Direita) */}
        <Card className="col-span-12 lg:col-span-4 p-6 flex flex-col">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-[#F8FAFC] tracking-tight">Disparos Recentes</h2>
            <button onClick={() => navigate('/history')} className="text-[11px] font-bold text-[#7C3AED] hover:text-[#8b5cf6] flex items-center gap-0.5">
              Ver Todos <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 flex-1">
            {recentHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <p className="text-xs text-[#64748B] italic py-6">Nenhum disparo efetuado ainda.</p>
              </div>
            ) : recentHistory.slice(0, 4).map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-xs">
                <div className="w-8 h-8 rounded-lg bg-[#162033] border border-white/5 flex items-center justify-center flex-shrink-0 shadow-sm text-sm">
                  {h.successful_channels?.[0]?.toLowerCase().includes('whatsapp') ? '💬' :
                   h.successful_channels?.[0]?.toLowerCase().includes('telegram') ? '✈️' : '🎮'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[#F8FAFC] truncate">{h.offer_name}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-[#64748B] font-medium mt-0.5">
                    <span>{h.channel_count} canal(is)</span>
                    <span>•</span>
                    <span>{new Date(h.sent_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[9px] font-bold flex-shrink-0 ${
                  h.status === 'sent' || h.status === 'success' ? 'bg-emerald-500/10 text-emerald-450' :
                  h.status === 'partial' ? 'bg-amber-500/10 text-amber-450' : 'bg-red-500/10 text-red-450'
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
