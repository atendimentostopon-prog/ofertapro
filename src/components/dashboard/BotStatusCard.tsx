import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Radar, Pause, Play, AlertTriangle, Clock } from 'lucide-react';
import { pluralize, timeAgo } from '../../lib/format';
import type { BotView } from '../../hooks/useBotStatus';

interface Props {
  view: BotView;
  groupsCount: number;
  errorMessage: string | null;
  lastDispatchAt: string | null;
  toggling: boolean;
  onToggle: (on: boolean) => void;
  isExpired: boolean;
  isLoading?: boolean;
}

const BASE = 'rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4';

export const BotStatusCard: React.FC<Props> = ({
  view, groupsCount, errorMessage, lastDispatchAt, toggling, onToggle, isExpired, isLoading,
}) => {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className={`${BASE} border-line bg-surface-1`}>
        <div className="w-11 h-11 rounded-xl bg-surface-2 animate-pulse flex-shrink-0" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="h-4 w-28 bg-surface-2 rounded animate-pulse" />
          <div className="h-3 w-52 max-w-full bg-surface-2 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const resolved = isExpired || view === 'access_revoked' ? 'expired' : view;

  if (resolved === 'monitoring' || resolved === 'paused_by_user') {
    const monitoring = resolved === 'monitoring';
    return (
      <div className={`${BASE} ${monitoring ? 'border-mint-200 bg-ice/50' : 'border-warning/30 bg-warning-bg/40'}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          monitoring ? 'bg-ice text-mint-700' : 'bg-warning-bg text-warning-ink'
        }`}>
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-ink font-display">
            {monitoring ? 'Bot ativo' : 'Bot pausado'}
          </h3>
          <p className="text-sm text-ink-secondary mt-0.5">
            {monitoring
              ? `Monitorando ${pluralize(groupsCount, 'grupo', 'grupos')} de origem${
                  lastDispatchAt ? ` · último disparo ${timeAgo(lastDispatchAt)}` : ' · nenhum disparo ainda'
                }`
              : 'O bot não está monitorando seus grupos de origem.'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            disabled={toggling}
            onClick={() => onToggle(!monitoring)}
            className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {monitoring ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {monitoring ? 'Pausar bot' : 'Reativar bot'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/integrations')}
            className="text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
          >
            Gerenciar
          </button>
        </div>
      </div>
    );
  }

  const cfg: Record<'expired' | 'error' | 'not_connected', {
    wrap: string;
    chip: string;
    Icon: typeof Clock;
    title: string;
    body: string;
    cta: string;
    to: string;
  }> = {
    expired: {
      wrap: 'border-danger/25 bg-danger-bg/40', chip: 'bg-danger-bg text-danger-ink', Icon: Clock,
      title: 'Bot parado',
      body: 'Seu acesso expirou. Assine um plano e o bot volta a monitorar.',
      cta: 'Ver planos', to: '/pricing',
    },
    error: {
      wrap: 'border-danger/25 bg-danger-bg/40', chip: 'bg-danger-bg text-danger-ink', Icon: AlertTriangle,
      title: 'Bot com erro',
      body: errorMessage || 'Reconecte o bot na tela de integrações.',
      cta: 'Gerenciar', to: '/integrations',
    },
    not_connected: {
      wrap: 'border-line bg-surface-1', chip: 'bg-surface-2 text-ink-secondary', Icon: Radar,
      title: 'Bot não conectado',
      body: 'Conecte o bot do Telegram pra ele monitorar seus grupos.',
      cta: 'Conectar bot', to: '/integrations',
    },
  };

  const { wrap, chip, Icon, title, body, cta, to } = cfg[resolved as 'expired' | 'error' | 'not_connected'];
  return (
    <div className={`${BASE} ${wrap}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${chip}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-ink font-display">{title}</h3>
        <p className="text-sm text-ink-secondary mt-0.5">{body}</p>
      </div>
      <button
        type="button"
        onClick={() => navigate(to)}
        className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer flex-shrink-0"
      >
        {cta}
      </button>
    </div>
  );
};
