import React from 'react';
import { Send, Radio, Package, Radar } from 'lucide-react';
import { Card } from '../ui/Card';
import ChannelLogo from '../ui/ChannelLogo';

interface Props {
  dispatches30d: number;
  whatsappChannels: number;
  whatsappLimit: number;
  telegramChannels: number;
  telegramLimit: number;
  channelsAtLimit: boolean;
  activeOffers: number;
  groupsMonitored: number;
}

export const OperationalMetrics: React.FC<Props> = ({
  dispatches30d, whatsappChannels, whatsappLimit, telegramChannels, telegramLimit, channelsAtLimit,
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
        <div className="mt-3 grid grid-cols-2 gap-3">
          {[
            { type: 'whatsapp', count: whatsappChannels, limit: whatsappLimit },
            { type: 'telegram', count: telegramChannels, limit: telegramLimit },
          ].map(({ type, count, limit }) => {
            const limited = limit !== Infinity;
            const atLimit = limited && count >= limit;
            return (
              <div key={type}>
                <div className="flex items-center gap-1">
                  <ChannelLogo type={type} size="w-3.5 h-3.5" />
                  <div className="flex items-baseline gap-0.5">
                    <h3 className="text-lg font-bold text-ink tracking-tight tabular-nums font-display">{count}</h3>
                    <span className="text-[10px] font-medium text-ink-tertiary">/ {limited ? limit : '∞'}</span>
                  </div>
                </div>
                {limited && (
                  <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-1.5 border border-line-subtle">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${atLimit ? 'bg-warning' : 'bg-mint-500'}`}
                      style={{ width: `${Math.min((count / limit) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {channelsAtLimit
          ? <p className="text-[10px] font-semibold text-warning-ink mt-2">Limite atingido</p>
          : <p className="text-[10px] text-ink-tertiary mt-2">conectados</p>}
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
