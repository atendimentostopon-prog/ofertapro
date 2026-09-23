import { useId, useState, type MouseEvent } from 'react';
import type { KpiSeriesPoint } from './KpiCard';

const nf = new Intl.NumberFormat('pt-BR');

export type TrendTab = { key: string; label: string; series: KpiSeriesPoint[] };

const W = 600;
const H = 200;
const PAD = { top: 12, right: 8, bottom: 22, left: 8 };

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export function TrendChart({ tabs }: { tabs: TrendTab[] }) {
  const gradientId = useId();
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const [hover, setHover] = useState<number | null>(null);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  if (!active || active.series.length < 2) return null;

  const { series } = active;
  const max = Math.max(1, ...series.map((p) => p.value));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (i / (series.length - 1)) * innerW;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = series.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(series.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const total = series.reduce((sum, p) => sum + p.value, 0);
  const gridValues = [0, 0.5, 1].map((f) => Math.round(max * f));
  const labelIdx = [0, Math.floor((series.length - 1) / 2), series.length - 1];

  function onMove(e: MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const idx = Math.round(((ratio * W - PAD.left) / innerW) * (series.length - 1));
    setHover(Math.min(series.length - 1, Math.max(0, idx)));
  }

  const hovered = hover != null ? series[hover] : null;

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-ink-secondary">{active.label} por dia</p>
          <p className="mt-1 font-display text-2xl font-bold text-ink">
            {hovered ? nf.format(hovered.value) : nf.format(total)}
            <span className="ml-2 text-xs font-semibold text-ink-tertiary">
              {hovered ? formatDay(hovered.date) : 'no período'}
            </span>
          </p>
        </div>
        <div role="tablist" aria-label="Métrica do gráfico" className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface-1 p-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={t.key === active.key}
              onClick={() => { setActiveKey(t.key); setHover(null); }}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                t.key === active.key ? 'bg-mint text-graphite-900' : 'text-ink-secondary hover:bg-surface-2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <svg
        role="img"
        aria-label={`Gráfico de ${active.label} por dia`}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-48 w-full text-mint-600"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {gridValues.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line-strong" strokeDasharray="3 4" />
            <text x={PAD.left} y={y(v) - 3} className="fill-ink-tertiary" fontSize="9">{nf.format(v)}</text>
          </g>
        ))}
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {labelIdx.map((i) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === series.length - 1 ? 'end' : 'middle'} className="fill-ink-tertiary" fontSize="9">
            {formatDay(series[i].date)}
          </text>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-line-strong" />
            <circle cx={x(hover)} cy={y(series[hover].value)} r="4" fill="currentColor" className="stroke-surface-0" strokeWidth="2" />
          </g>
        )}
      </svg>
    </div>
  );
}
