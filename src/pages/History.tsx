import React, { useState, useEffect } from 'react';
import {
  Search, MousePointerClick, Calendar,
  CheckCircle2, AlertCircle, AlertTriangle, Clock,
  ChevronRight, Send, Loader2
} from 'lucide-react';
import type { HistoryStatus } from '../types';
import Badge from '../components/Badge';
import { supabase } from '../lib/supabase';
import { dispatchOffer } from '../lib/dispatch-service';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';
import { EmptyState } from '../components/ui/EmptyState';
import { useToast } from '../context/ToastContext';
import ProductImage from '../components/shared/ProductImage';
import ChannelLogo from '../components/ui/ChannelLogo';

const statusConfig: Record<string, {
  icon: React.ElementType; bg: string; iconColor: string; label: string;
}> = {
  success: { icon: CheckCircle2,  bg: 'bg-success-bg border border-success/20', iconColor: 'text-success-ink', label: 'Enviado' },
  partial: { icon: AlertTriangle, bg: 'bg-warning-bg border border-warning/20', iconColor: 'text-warning-ink', label: 'Parcial' },
  error:   { icon: AlertCircle,   bg: 'bg-danger-bg border border-danger/20',   iconColor: 'text-danger-ink',  label: 'Erro'    },
  sent:    { icon: CheckCircle2,  bg: 'bg-success-bg border border-success/20', iconColor: 'text-success-ink', label: 'Enviado' },
  failed:  { icon: AlertCircle,   bg: 'bg-danger-bg border border-danger/20',   iconColor: 'text-danger-ink',  label: 'Erro'    },
};

const TimelineItem: React.FC<{ entry: any; isLast: boolean; onResend: (entry: any) => Promise<void> }> = ({ entry, isLast, onResend }) => {
  const [expanded, setExpanded] = useState(false);
  const [resending, setResending] = useState(false);
  const { toast } = useToast();
  const cfg = statusConfig[entry.status as HistoryStatus] || statusConfig.error;
  const Icon = cfg.icon;

  const date = new Date(entry.sent_at);
  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

  const handleResendClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setResending(true);
    try {
      await onResend(entry);
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex gap-4">
      {/* Timeline left */}
      <div className="flex flex-col items-center">
        <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center flex-shrink-0 z-10`}>
          <Icon className={`w-4.5 h-4.5 ${cfg.iconColor}`} size={18} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-line mt-2" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6">
        <Card
          variant="default"
          hoverable
          className="p-5"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-start gap-3">
            {/* Offer Image */}
            <ProductImage
              src={entry.offer_image}
              alt={entry.offer_name}
              className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-surface-1 border border-line"
            />

            {/* Main Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-[15px] font-bold text-ink leading-snug line-clamp-1 tracking-tight font-display">
                  {entry.offer_name}
                </h3>
                <ChevronRight
                  className={`w-4 h-4 text-ink-tertiary flex-shrink-0 transition-transform mt-0.5 ${expanded ? 'rotate-90' : ''}`}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {entry.marketplace && <Badge type="marketplace" value={entry.marketplace} />}
                <Badge type="status" value={entry.status} />
                <div className="flex items-center gap-1 text-xs text-ink-secondary">
                  <Clock className="w-3.5 h-3.5 text-ink-tertiary" />
                  {dateStr} às {timeStr}
                </div>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-4 mt-2.5">
                <div className="flex items-center gap-1.5 text-xs">
                  <MousePointerClick className="w-3.5 h-3.5 text-mint-700" />
                  <span className="font-bold text-ink">{(entry.clicks || 0).toLocaleString('pt-BR')}</span>
                  <span className="text-ink-tertiary">cliques</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Send className="w-3.5 h-3.5 text-ink-tertiary" />
                  <span className="font-bold text-ink">{entry.channel_count || 0}</span>
                  <span className="text-ink-tertiary">canal(is)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="mt-4 pt-4 border-t border-line space-y-3 animate-fade-in" onClick={e => e.stopPropagation()}>
              {/* Channels */}
              <div>
                <p className="text-xs font-bold text-ink-secondary mb-2">Canais utilizados:</p>
                <div className="flex flex-wrap gap-2">
                  {Array.isArray(entry.successful_channels) && entry.successful_channels.map((ch: string) => (
                    <span
                      key={ch}
                      className="flex items-center gap-1.5 text-xs bg-success-bg text-success-ink border border-success/20 px-2.5 py-1.5 rounded-md font-medium animate-fade-in"
                    >
                      <ChannelLogo name={ch} size="w-3.5 h-3.5" />
                      {ch} (Sucesso)
                    </span>
                  ))}

                  {Array.isArray(entry.failed_channels) && entry.failed_channels.map((ch: string) => (
                    <span
                      key={ch}
                      className="flex items-center gap-1.5 text-xs bg-danger-bg text-danger-ink border border-danger/20 px-2.5 py-1.5 rounded-md font-medium animate-fade-in"
                    >
                      <ChannelLogo name={ch} size="w-3.5 h-3.5" />
                      {ch} (Falhou)
                    </span>
                  ))}

                  {!Array.isArray(entry.successful_channels) && !Array.isArray(entry.failed_channels) && (entry.channels || []).map((ch: string) => (
                    <span
                      key={ch}
                      className="flex items-center gap-1.5 text-xs bg-surface-1 text-ink border border-line px-2.5 py-1.5 rounded-md font-medium"
                    >
                      <ChannelLogo name={ch} size="w-3.5 h-3.5" />
                      {ch}
                    </span>
                  ))}

                  {(!entry.channels || entry.channels.length === 0) &&
                   (!entry.successful_channels || entry.successful_channels.length === 0) &&
                   (!entry.failed_channels || entry.failed_channels.length === 0) && (
                    <span className="text-xs text-ink-tertiary italic">Nenhum canal registrado.</span>
                  )}
                </div>
              </div>

              {Array.isArray(entry.dispatch_results) && entry.dispatch_results.some((r: any) => !r.success) && (
                <div className="space-y-1.5 mt-2">
                  <p className="text-xs font-bold text-ink-secondary">Erros por canal:</p>
                  <div className="space-y-1">
                    {entry.dispatch_results.filter((r: any) => !r.success).map((r: any) => (
                      <div key={r.channelId} className="flex items-start gap-2 p-2.5 bg-danger-bg rounded-md border border-danger/20 text-[11px] text-danger-ink">
                        <AlertCircle className="w-3.5 h-3.5 text-danger-ink flex-shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">{r.channelName}: </span>
                          <span>{r.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!Array.isArray(entry.dispatch_results) && entry.error && (
                <div className="flex items-start gap-2 p-3 bg-danger-bg rounded-md border border-danger/20 text-danger-ink">
                  <AlertCircle className="w-3.5 h-3.5 text-danger-ink flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-bold text-danger-ink">Erro no envio</p>
                    <p className="text-xs text-danger-ink mt-0.5">{entry.error}</p>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-line">
                <button
                  onClick={handleResendClick}
                  disabled={resending}
                  className="flex items-center gap-1.5 text-xs font-semibold text-ink-inverse bg-graphite hover:bg-graphite-800 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {resending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="w-3 h-3" />
                      Reenviar
                    </>
                  )}
                </button>
                {entry.error && (
                  <button
                    onClick={(e) => { e.stopPropagation(); toast(`Erro no disparo: ${entry.error}`, 'error'); }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-warning-ink hover:bg-warning/15 bg-warning-bg px-3 py-1.5 rounded-md transition-colors border border-warning/20 cursor-pointer"
                  >
                    <AlertTriangle className="w-3 h-3" />
                    Ver erro
                  </button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};

const History: React.FC = () => {
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | HistoryStatus>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week'>('all');
  const { toast } = useToast();

  const loadHistory = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { HistoryService } = await import('../services/HistoryService');
      const data = await HistoryService.getHistory(user.id);
      if (data) setHistory(data);
    } catch (err) {
      console.error('Erro ao carregar histórico:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const handleResend = async (entry: any): Promise<void> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: offer, error: offerError } = await supabase
        .from('offers')
        .select('*')
        .eq('id', entry.offer_id)
        .single();

      if (offerError || !offer) {
        toast('Oferta original não encontrada ou foi removida.', 'error');
        return;
      }

      if (!offer.channels || offer.channels.length === 0) {
        toast('Nenhum canal selecionado para esta oferta.', 'info');
        return;
      }

      await dispatchOffer({
        userId: user.id,
        offerId: offer.id,
        offerName: offer.name,
        offerImage: offer.image || '',
        salePrice: offer.sale_price,
        originalPrice: offer.original_price,
        discount: offer.discount,
        coupon: offer.coupon,
        affiliateLink: offer.affiliate_link,
        marketplace: offer.marketplace,
        description: offer.description,
        channelIds: offer.channels,
        shortCode: offer.short_code
      });

      loadHistory();
      toast('Oferta reenviada com sucesso!', 'success');
    } catch (err) {
      console.error('Erro ao reenviar:', err);
      toast('Erro ao reenviar oferta.', 'error');
    }
  };

  const filtered = history.filter(h => {
    const matchSearch = h.offer_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || h.status === statusFilter;

    let matchDate = true;
    if (dateFilter === 'today') {
      const today = new Date().toDateString();
      matchDate = new Date(h.sent_at).toDateString() === today;
    } else if (dateFilter === 'week') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      matchDate = new Date(h.sent_at) >= weekAgo;
    }

    return matchSearch && matchStatus && matchDate;
  });

  const totalClicks = history.reduce((sum, h) => sum + (h.clicks || 0), 0);
  const successRate = history.length > 0 ? Math.round(
    (history.filter(h => h.status === 'success' || h.status === 'sent').length / history.length) * 100
  ) : 0;

  if (loading) {
    return <LoadingState type="spinner" />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-slide-up pb-8">
      {/* Header */}
      <PageHeader
        title="Histórico de Disparos"
        description="Todos os seus disparos de ofertas multicanal"
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Disparos',    value: history.length,                     icon: Send,              accent: 'text-ink',         accentBg: 'bg-surface-1',   border: 'border-line' },
          { label: 'Cliques Gerados',   value: totalClicks.toLocaleString('pt-BR'), icon: MousePointerClick, accent: 'text-mint-700',    accentBg: 'bg-ice',         border: 'border-mint-200' },
          { label: 'Taxa de Sucesso',   value: `${successRate}%`,                  icon: CheckCircle2,      accent: 'text-success-ink', accentBg: 'bg-success-bg',  border: 'border-success/20' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} variant="metric" hoverable className="p-5 flex items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl ${stat.accentBg} flex items-center justify-center border ${stat.border}`}>
                <Icon className={`w-5.5 h-5.5 ${stat.accent}`} />
              </div>
              <div>
                <p className="text-2xl font-black text-ink tracking-tight tabular-nums font-display">{stat.value}</p>
                <p className="text-[13px] font-semibold text-ink-secondary">{stat.label}</p>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Filters */}
      <Card variant="default" className="p-5 flex flex-col md:flex-row items-center gap-4">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-tertiary" />
          <input
            type="text"
            placeholder="Buscar por nome da oferta..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-modern pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="tab-container">
            {(['all', 'success', 'partial', 'error'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`tab-item ${statusFilter === s ? 'active' : ''}`}
              >
                {{ all: 'Todos', success: 'Sucesso', partial: 'Parcial', error: 'Erro' }[s]}
              </button>
            ))}
          </div>

          <div className="tab-container">
            {(['all', 'today', 'week'] as const).map(d => (
              <button
                key={d}
                onClick={() => setDateFilter(d)}
                className={`tab-item ${dateFilter === d ? 'active' : ''}`}
              >
                {{ all: 'Todos', today: 'Hoje', week: '7 dias' }[d]}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Timeline */}
      <div className="space-y-0">
        {filtered.length > 0 ? (
          filtered.map((entry, idx) => (
            <TimelineItem
              key={entry.id}
              entry={entry}
              isLast={idx === filtered.length - 1}
              onResend={handleResend}
            />
          ))
        ) : (
          <EmptyState
            icon={Calendar}
            title="Nenhum disparo encontrado"
            description="Todos os seus disparos de ofertas e canais integrados serão exibidos aqui."
          />
        )}
      </div>
    </div>
  );
};

export default History;
