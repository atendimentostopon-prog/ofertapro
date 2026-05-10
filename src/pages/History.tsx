import React, { useState } from 'react';
import {
  Filter, Search, MousePointerClick, Calendar,
  CheckCircle2, AlertCircle, AlertTriangle, Clock,
  ChevronRight, Send
} from 'lucide-react';
import { mockHistory, formatDateTime, MARKETPLACE_LABELS } from '../data/mock';
import type { HistoryEntry, HistoryStatus } from '../types';
import Badge from '../components/Badge';

const statusConfig: Record<HistoryStatus, {
  icon: React.ElementType; bg: string; iconColor: string; label: string;
}> = {
  success: { icon: CheckCircle2, bg: 'bg-emerald-50', iconColor: 'text-emerald-500', label: 'Enviado' },
  partial: { icon: AlertTriangle, bg: 'bg-amber-50', iconColor: 'text-amber-500', label: 'Parcial' },
  error: { icon: AlertCircle, bg: 'bg-red-50', iconColor: 'text-red-500', label: 'Erro' },
};

const channelEmojis: Record<string, string> = {
  WhatsApp: '💬',
  Telegram: '✈️',
  Discord: '🎮',
};

const getChannelEmoji = (name: string) => {
  if (name.startsWith('@') || name.includes('telegram') || name.includes('canal')) return '✈️';
  if (name.includes('Discord') || name.includes('Server')) return '🎮';
  return '💬';
};

const TimelineItem: React.FC<{ entry: HistoryEntry; isLast: boolean }> = ({ entry, isLast }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = statusConfig[entry.status];
  const Icon = cfg.icon;

  const date = new Date(entry.sentAt);
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  return (
    <div className="flex gap-4">
      {/* Timeline left */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 z-10`}>
          <Icon className={`w-4.5 h-4.5 ${cfg.iconColor}`} size={18} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-slate-200 mt-2" />}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-6 ${isLast ? '' : ''}`}>
        <div
          className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 cursor-pointer hover:border-indigo-100 hover:shadow-md transition-all duration-200"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start gap-3">
            {/* Offer Image */}
            <img
              src={entry.offerImage}
              alt={entry.offerName}
              className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
            />

            {/* Main Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 leading-snug line-clamp-1">
                  {entry.offerName}
                </h3>
                <ChevronRight
                  className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform mt-0.5 ${expanded ? 'rotate-90' : ''}`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge type="marketplace" value={entry.marketplace} />
                <Badge type="status" value={entry.status} />
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {dateStr} às {timeStr}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-4 mt-2.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <MousePointerClick className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="font-semibold text-slate-800">{entry.clicks.toLocaleString('pt-BR')}</span>
                  <span className="text-slate-400">cliques</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Send className="w-3.5 h-3.5 text-slate-400" />
                  <span className="font-semibold text-slate-800">{entry.channelCount}</span>
                  <span className="text-slate-400">canal(is)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-fade-in">
              {/* Channels */}
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-2">Canais utilizados:</p>
                <div className="flex flex-wrap gap-2">
                  {entry.channels.map(ch => (
                    <span
                      key={ch}
                      className="flex items-center gap-1.5 text-xs bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg font-medium"
                    >
                      <span>{getChannelEmoji(ch)}</span>
                      {ch}
                    </span>
                  ))}
                </div>
              </div>

              {/* Error message */}
              {entry.error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 rounded-xl border border-red-200">
                  <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700">Erro no envio</p>
                    <p className="text-xs text-red-600 mt-0.5">{entry.error}</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                  <Send className="w-3 h-3" />
                  Reenviar
                </button>
                {entry.status === 'error' && (
                  <button className="flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors">
                    <AlertTriangle className="w-3 h-3" />
                    Ver erro
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const History: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HistoryStatus>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week'>('all');

  const filtered = mockHistory.filter(h => {
    const matchSearch = h.offerName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || h.status === statusFilter;

    let matchDate = true;
    if (dateFilter === 'today') {
      const today = new Date().toDateString();
      matchDate = new Date(h.sentAt).toDateString() === today;
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchDate = new Date(h.sentAt) >= weekAgo;
    }

    return matchSearch && matchStatus && matchDate;
  });

  const totalClicks = mockHistory.reduce((sum, h) => sum + h.clicks, 0);
  const successRate = Math.round(
    (mockHistory.filter(h => h.status === 'success').length / mockHistory.length) * 100
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Histórico de Disparos</h1>
          <p className="text-sm text-slate-500 mt-0.5">Todos os seus disparos de ofertas</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total Disparos', value: mockHistory.length, icon: Send, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'Cliques Gerados', value: totalClicks.toLocaleString('pt-BR'), icon: MousePointerClick, color: 'text-purple-600', bg: 'bg-purple-50' },
          { label: 'Taxa de Sucesso', value: `${successRate}%`, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-4 flex items-center gap-3 shadow-sm">
              <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome da oferta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-modern pl-10"
          />
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'success', 'partial', 'error'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                statusFilter === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {{ all: 'Todos', success: '✓ Sucesso', partial: '⚠ Parcial', error: '✗ Erro' }[s]}
            </button>
          ))}
        </div>

        {/* Date filter */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
          {(['all', 'today', 'week'] as const).map(d => (
            <button
              key={d}
              onClick={() => setDateFilter(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                dateFilter === d ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {{ all: 'Todos', today: 'Hoje', week: '7 dias' }[d]}
            </button>
          ))}
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {filtered.length > 0 ? (
          filtered.map((entry, idx) => (
            <TimelineItem
              key={entry.id}
              entry={entry}
              isLast={idx === filtered.length - 1}
            />
          ))
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-100">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
              <Calendar className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-slate-700 font-semibold mb-1">Nenhum disparo encontrado</h3>
            <p className="text-sm text-slate-400">Tente ajustar os filtros de busca</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default History;
