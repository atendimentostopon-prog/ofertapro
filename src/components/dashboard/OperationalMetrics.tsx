import React from 'react';
import { Send, Radio, Package, Radar } from 'lucide-react';
import { Card } from '../ui/Card';

interface Props {
  dispatches30d: number;
  connectedChannels: number;
  channelLimit: number;
  channelLimited: boolean;
  channelsAtLimit: boolean;
  activeOffers: number;
  groupsMonitored: number;
}

export const OperationalMetrics: React.FC<Props> = ({
  dispatches30d, connectedChannels, channelLimit, channelLimited, channelsAtLimit,
  activeOffers, groupsMonitored,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card variant="metric" className="p-4 flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Disparos</span>
          <Send className="w-4 h-4 text-mint-700 opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{dispatches30d}</h3>
          <p className="text-[10px] text-ink-tertiary mt-0.5">nos últimos 30 dias</p>
        </div>
      </Card>

      <Card
        variant="metric"
        className="p-4 flex flex-col justify-between group"
        title={channelsAtLimit ? 'Você atingiu o limite de canais do seu plano. Faça upgrade para conectar mais.' : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Canais</span>
          <Radio className={`w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity ${channelsAtLimit ? 'text-warning-ink' : 'text-ink-secondary'}`} />
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-1">
            <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{connectedChannels}</h3>
            <span className="text-[10px] font-medium text-ink-tertiary">/ {channelLimited ? channelLimit : '∞'}</span>
          </div>
          {channelLimited && (
            <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-2 border border-line-subtle">
              <div
                className={`h-full rounded-full transition-all duration-500 ${channelsAtLimit ? 'bg-warning' : 'bg-mint-500'}`}
                style={{ width: `${Math.min((connectedChannels / channelLimit) * 100, 100)}%` }}
              />
            </div>
          )}
          {channelsAtLimit
            ? <p className="text-[10px] font-semibold text-warning-ink mt-1.5">Limite atingido</p>
            : <p className="text-[10px] text-ink-tertiary mt-0.5">conectados</p>}
        </div>
      </Card>

      <Card variant="metric" className="p-4 flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Ofertas ativas</span>
          <Package className="w-4 h-4 text-info-ink opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{activeOffers}</h3>
          <p className="text-[10px] text-ink-tertiary mt-0.5">publicadas</p>
        </div>
      </Card>

      <Card variant="metric" className="p-4 flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Grupos</span>
          <Radar className="w-4 h-4 text-mint-700 opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{groupsMonitored}</h3>
          <p className="text-[10px] text-ink-tertiary mt-0.5">de origem monitorados</p>
        </div>
      </Card>
    </div>
  );
};
