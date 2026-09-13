import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Sparkles } from 'lucide-react';
import { useTheme } from 'next-themes';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

const COLORS = ['#3DD98F', '#22C078', '#199A5F', '#88E5B8'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-0 rounded-md border border-line shadow-md p-3">
        <p className="text-xs font-semibold text-ink mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.name}:</span>
            <span className="font-semibold text-ink tabular-nums">{p.value.toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

interface Props {
  showAnalytics: boolean;
  totalClicksToday: number;
  totalClicks7d: number;
  totalClicks30d: number;
  clicksByDay: { date: string; cliques: number }[];
  clicksBySource: { name: string; value: number }[];
  topSource: string;
  topMarketplace: string;
}

export const AnalyticsZone: React.FC<Props> = ({
  showAnalytics, totalClicksToday, totalClicks7d, totalClicks30d,
  clicksByDay, clicksBySource, topSource, topMarketplace,
}) => {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(16, 20, 24, 0.06)';
  const axisTickColor = isDark ? '#9AA1AA' : '#6B7280';
  const activeDotStroke = isDark ? '#101418' : '#FFFFFF';

  if (!showAnalytics) {
    return (
      <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-12 h-12 rounded-xl bg-ice border border-mint-200 text-mint-700 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink font-display">Analytics completo no Profissional</h3>
          <ul className="mt-2 space-y-1">
            {[
              'Cliques por dia de cada oferta',
              'Origem de tráfego: qual canal converte',
              'Ranking real das suas ofertas por clique',
            ].map(item => (
              <li key={item} className="text-xs text-ink-secondary flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-mint-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => navigate('/pricing')}
          className="btn-gradient px-5 py-2 text-xs font-semibold cursor-pointer flex-shrink-0"
        >
          Fazer upgrade
        </button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <Card className="col-span-12 lg:col-span-8 p-5 flex flex-col relative overflow-hidden min-h-[300px]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Cliques por Dia</h2>
            <p className="text-[11px] text-ink-secondary mt-0.5">Últimos 7 dias</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-semibold text-ink-tertiary tabular-nums">
            <span>Hoje <b className="text-ink">{totalClicksToday}</b></span>
            <span>7d <b className="text-ink">{totalClicks7d}</b></span>
            <span>30d <b className="text-ink">{totalClicks30d}</b></span>
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
                    <stop offset="5%"  stopColor="#3DD98F" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3DD98F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: axisTickColor }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: axisTickColor }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#22C078" strokeWidth={2} fill="url(#colorCliques)" activeDot={{ r: 5, fill: '#22C078', stroke: activeDotStroke, strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col justify-between relative overflow-hidden min-h-[300px]">
        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Origem de Tráfego</h2>
          <p className="text-[11px] text-ink-secondary mt-0.5">Cliques por canal</p>
        </div>

        {totalClicks30d === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-xs text-ink-tertiary">Sem dados disponíveis.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center gap-3 py-3">
            <div className="space-y-3">
              {clicksBySource.map((item, index) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{item.name}</span>
                    <span className="font-semibold text-ink tabular-nums">{item.value}</span>
                  </div>
                  <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden border border-line-subtle">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((item.value / totalClicks30d) * 100, 100)}%`,
                        backgroundColor: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-line flex items-center justify-between">
              <div className="text-left">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Destaque</p>
                <p className="text-xs font-semibold text-mint-800 capitalize mt-0.5">
                  {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Marketplace</p>
                <p className="text-xs font-semibold text-ink capitalize mt-0.5">{topMarketplace.toUpperCase()}</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
