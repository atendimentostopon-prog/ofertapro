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
  onRetry?: () => void;
  isExpired: boolean;
  isLoading?: boolean;
}

const BASE = 'rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4';

export const BotStatusCard: React.FC<Props> = ({
  view, groupsCount, errorMessage, lastDispatchAt, toggling, onToggle, onRetry, isExpired, isLoading,
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

  // isExpired ganha do view: quando a conta expirou, o bot esta parado pelo
  // servidor de qualquer jeito. access_revoked (status='paused' sem a conta
  // estar expirada) fica separado porque nao tem o banner de expirado acima.
  const resolved = isExpired ? 'expired' : view;

  if (resolved === 'unknown') {
    return (
      <div className={`${BASE} border-line bg-surface-1`}>
        <div className="w-11 h-11 rounded-xl bg-surface-2 text-ink-secondary flex items-center justify-center flex-shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-ink font-display">Não foi possível verificar o bot</h3>
          <p className="text-sm text-ink-secondary mt-0.5">Tivemos um problema pra carregar o status do bot agora.</p>
        </div>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer flex-shrink-0"
          >
            Tentar de novo
          </button>
        )}
      </div>
    );
  }

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

  type StaticState = {
    wrap: string;
    chip: string;
    Icon: typeof Clock;
    title: string;
    body: string;
    cta?: string;
    to?: string;
  };
  const cfg: Record<'expired' | 'access_revoked' | 'error' | 'not_connected', StaticState> = {
    // Conta expirada: o banner de "Seu acesso expirou" logo acima ja carrega a
    // explicacao e o botao "Ver planos". Aqui so o fato do bot, sem repetir CTA.
    expired: {
      wrap: 'border-danger/25 bg-danger-bg/40', chip: 'bg-danger-bg text-danger-ink', Icon: Clock,
      title: 'Bot parado',
      body: 'O bot não monitora seus grupos enquanto seu acesso estiver expirado.',
    },
    // status='paused' sem a conta estar expirada: nao tem banner, entao mantem o CTA.
    access_revoked: {
      wrap: 'border-danger/25 bg-danger-bg/40', chip: 'bg-danger-bg text-danger-ink', Icon: Clock,
      title: 'Bot parado',
      body: 'Seu acesso foi suspenso e o bot parou de monitorar. Assine um plano e ele volta.',
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

  const { wrap, chip, Icon, title, body, cta, to } =
    cfg[resolved as keyof typeof cfg] ?? cfg.not_connected;
  return (
    <div className={`${BASE} ${wrap}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${chip}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-ink font-display">{title}</h3>
        <p className="text-sm text-ink-secondary mt-0.5">{body}</p>
      </div>
      {cta && to && (
        <button
          type="button"
          onClick={() => navigate(to)}
          className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer flex-shrink-0"
        >
          {cta}
        </button>
      )}
    </div>
  );
};
