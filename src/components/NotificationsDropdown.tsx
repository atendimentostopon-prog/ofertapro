import React from 'react';
import { Bell, CheckCircle2, AlertTriangle, AlertCircle, Clock } from 'lucide-react';
import { HistoryStatus } from '../types';

interface NotificationsDropdownProps {
  notifications: any[];
  onClose: () => void;
  loading: boolean;
}

const statusConfig: Record<HistoryStatus, { icon: React.ElementType; color: string; bg: string }> = {
  success: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  partial: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/10' },
  error: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
  sent: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  failed: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/10' },
};

const NotificationsDropdown: React.FC<NotificationsDropdownProps> = ({ notifications, onClose, loading }) => {
  const getNotificationText = (notif: any) => {
    const channelCount = notif.channel_count || (notif.channels || []).length;
    if (notif.status === 'success' || notif.status === 'sent') {
      return `Oferta "${notif.offer_name}" enviada com sucesso para ${channelCount} canal(is).`;
    }
    if (notif.status === 'partial') {
      return `Oferta "${notif.offer_name}" enviada com falhas parciais.`;
    }
    return `Falha crítica ao disparar oferta "${notif.offer_name}".`;
  };

  const formatNotifTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' - ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  return (
    <div className="absolute right-0 top-12 w-80 max-w-[calc(100vw-2rem)] bg-surface-2 rounded-2xl border border-white/[0.08] shadow-2xl shadow-black/40 py-2 z-50 animate-scale-in flex flex-col max-h-96">
      {/* Header */}
      <div className="px-4 py-2 border-b border-white/[0.06] flex items-center justify-between">
        <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
          <Bell className="w-3.5 h-3.5 text-brand-400" /> Notificações
        </h4>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto py-1 scrollbar-none">
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">
            <div className="w-5 h-5 border-2 border-brand-500/20 border-t-brand-500 rounded-full animate-spin mx-auto mb-2" />
            Carregando...
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500 flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-surface-3 flex items-center justify-center">
              <Bell className="w-5 h-5 text-slate-600" />
            </div>
            <span>Nenhuma notificação no momento.</span>
          </div>
        ) : (
          notifications.map(n => {
            const cfg = statusConfig[n.status as HistoryStatus] || statusConfig.error;
            const Icon = cfg.icon;
            return (
              <div key={n.id} className="px-4 py-3 hover:bg-white/[0.02] transition-colors flex gap-3 items-start cursor-pointer">
                <div className={`w-8 h-8 rounded-lg ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-4 h-4 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-medium text-slate-200 leading-normal line-clamp-2">
                    {getNotificationText(n)}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatNotifTime(n.sent_at)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-4 pt-2 pb-1 border-t border-white/[0.06] text-center">
        <a 
          href="/history" 
          onClick={(e) => {
            e.preventDefault();
            onClose();
            window.location.href = '/history';
          }}
          className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 transition-colors"
        >
          Ver todo o histórico →
        </a>
      </div>
    </div>
  );
};

export default NotificationsDropdown;
