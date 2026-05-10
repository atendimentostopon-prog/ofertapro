import React, { useState } from 'react';
import {
  TrendingUp, MousePointerClick, Package, Radio, Users,
  ArrowUpRight, ArrowDownRight, Plus, Zap, ExternalLink,
  Send, MoreHorizontal, Activity, Clock
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts';
import { mockOffers, mockChannels, mockHistory, mockChartData, mockUser, formatCurrency, formatDateTime, MARKETPLACE_LABELS } from '../data/mock';
import Badge from '../components/Badge';
import { useNavigate } from 'react-router-dom';

const MetricCard = ({
  label, value, change, positive, icon: Icon, gradient
}: {
  label: string; value: string; change: string; positive: boolean;
  icon: React.ElementType; gradient: string;
}) => (
  <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm card-hover">
    <div className="flex items-start justify-between mb-4">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
        positive ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
      }`}>
        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {change}
      </span>
    </div>
    <p className="text-2xl font-bold text-slate-900">{value}</p>
    <p className="text-sm text-slate-500 mt-1">{label}</p>
  </div>
);

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-lg p-3">
        <p className="text-xs font-semibold text-slate-700 mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-slate-500">{p.name}:</span>
            <span className="font-semibold text-slate-800">{p.value.toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [newOfferVisible, setNewOfferVisible] = useState(false);

  const activeOffers = mockOffers.filter(o => o.status === 'active').length;
  const connectedChannels = mockChannels.filter(c => c.status === 'connected').length;
  const totalClicks = mockOffers.reduce((sum, o) => sum + o.clicks, 0);
  const totalMembers = mockChannels.filter(c => c.status === 'connected').reduce((sum, c) => sum + (c.members || 0), 0);

  const metrics = [
    { label: 'Cliques Totais', value: totalClicks.toLocaleString('pt-BR'), change: '+34%', positive: true, icon: MousePointerClick, gradient: 'from-indigo-500 to-indigo-600' },
    { label: 'Ofertas Ativas', value: String(activeOffers), change: '+3', positive: true, icon: Package, gradient: 'from-purple-500 to-purple-600' },
    { label: 'Alcance Estimado', value: totalMembers.toLocaleString('pt-BR'), change: '+12%', positive: true, icon: Users, gradient: 'from-pink-500 to-rose-500' },
    { label: 'Canais Conectados', value: String(connectedChannels), change: 'estável', positive: true, icon: Radio, gradient: 'from-sky-500 to-blue-500' },
  ];

  const channelIcons: Record<string, string> = {
    whatsapp: '💬',
    telegram: '✈️',
    discord: '🎮',
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-slide-up">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Olá, {mockUser.name.split(' ')[0]}! 👋
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Aqui está o resumo do seu desempenho hoje</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400 bg-white border border-slate-200 rounded-xl px-3 py-2">
          <Clock className="w-3.5 h-3.5" />
          <span>Atualizado agora</span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => <MetricCard key={m.label} {...m} />)}
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-4">

        {/* Chart — 8 cols */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-bold text-slate-900">Performance dos Últimos 7 Dias</h2>
              <p className="text-xs text-slate-400 mt-0.5">Cliques e alcance estimado</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Activity className="w-3.5 h-3.5 text-indigo-500" />
                Ao vivo
              </span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={mockChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCliques" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorAlcance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ec4899" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#ec4899" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorCliques)" dot={false} activeDot={{ r: 5, fill: '#6366f1' }} />
              <Area type="monotone" dataKey="alcance" name="Alcance" stroke="#ec4899" strokeWidth={2.5} fill="url(#colorAlcance)" dot={false} activeDot={{ r: 5, fill: '#ec4899' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Channel Status — 4 cols */}
        <div className="col-span-12 lg:col-span-4 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Canais Ativos</h2>
            <button onClick={() => navigate('/channels')} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {mockChannels.slice(0, 4).map(ch => (
              <div key={ch.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <span className="text-xl">{channelIcons[ch.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{ch.name}</p>
                  <p className="text-xs text-slate-400">{ch.members?.toLocaleString('pt-BR')} membros</p>
                </div>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  ch.status === 'connected' ? 'bg-emerald-500' : 'bg-slate-300'
                }`} />
              </div>
            ))}
          </div>
          <button
            onClick={() => navigate('/channels')}
            className="w-full mt-4 py-2.5 rounded-xl border border-dashed border-slate-300 text-xs font-medium text-slate-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50 transition-all flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Conectar novo canal
          </button>
        </div>

        {/* CTA New Offer — 4 cols */}
        <div className="col-span-12 lg:col-span-4">
          <div className="h-full bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 rounded-2xl p-6 text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-8 -translate-x-8" />
            <div className="relative z-10">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-white" fill="white" />
              </div>
              <h3 className="text-lg font-bold mb-2">Dispare uma nova oferta!</h3>
              <p className="text-sm text-white/80 mb-5">Cadastre e envie para todos seus canais em segundos.</p>
              <button
                onClick={() => navigate('/offers')}
                className="bg-white text-indigo-700 font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-indigo-50 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nova Oferta
              </button>
            </div>
          </div>
        </div>

        {/* Recent Activity — 8 cols */}
        <div className="col-span-12 lg:col-span-8 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Atividade Recente</h2>
            <button onClick={() => navigate('/history')} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver histórico <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="space-y-3">
            {mockHistory.slice(0, 4).map(h => (
              <div key={h.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                <img
                  src={h.offerImage}
                  alt={h.offerName}
                  className="w-10 h-10 rounded-xl object-cover flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{h.offerName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge type="marketplace" value={h.marketplace} />
                    <span className="text-[10px] text-slate-400">{formatDateTime(h.sentAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-semibold text-slate-900">{h.clicks.toLocaleString('pt-BR')}</p>
                    <p className="text-[10px] text-slate-400">cliques</p>
                  </div>
                  <Badge type="status" value={h.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Public Page Card — full width on mobile, 4 on lg */}
        <div className="col-span-12 lg:col-span-4 bg-gradient-to-br from-slate-900 to-slate-700 rounded-2xl p-5 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-4 right-4 w-20 h-20 rounded-full bg-indigo-400 blur-xl" />
            <div className="absolute bottom-4 left-4 w-16 h-16 rounded-full bg-purple-400 blur-xl" />
          </div>
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slate-400">Página Pública Ativa</span>
            </div>
            <h3 className="text-base font-bold mb-1">{mockUser.name}</h3>
            <p className="text-xs text-slate-400 mb-3 font-mono">{mockUser.publicUrl}</p>
            <p className="text-xs text-slate-300 mb-5">Compartilhe seu link de afiliado com sua audiência</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigate('/u/lucasferreira')}
                className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 transition-colors text-xs font-medium px-3 py-2 rounded-lg"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Abrir página
              </button>
              <button className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 transition-colors text-xs font-medium px-3 py-2 rounded-lg">
                <Send className="w-3.5 h-3.5" />
                Compartilhar
              </button>
            </div>
          </div>
        </div>

        {/* Top Offers */}
        <div className="col-span-12 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-900">Top Ofertas por Cliques</h2>
            <button onClick={() => navigate('/offers')} className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
              Ver todas <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[...mockOffers].sort((a, b) => b.clicks - a.clicks).slice(0, 4).map((offer, idx) => (
              <div key={offer.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:border-indigo-100 hover:bg-indigo-50/30 transition-all group">
                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-indigo-700">{idx + 1}</span>
                </div>
                <img src={offer.image} alt={offer.name} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-900 truncate">{offer.name}</p>
                  <p className="text-xs text-indigo-600 font-semibold">{offer.clicks.toLocaleString('pt-BR')} cliques</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
