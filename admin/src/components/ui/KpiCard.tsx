import { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

const nf = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export type KpiSeriesPoint = { date: string; value: number };
export type KpiAccent = 'mint' | 'info' | 'warning' | 'success';

const ACCENT: Record<KpiAccent, { text: string; tile: string }> = {
  mint: { text: 'text-mint-600', tile: 'bg-mint-400/15 text-mint-600' },
  info: { text: 'text-info', tile: 'bg-info/10 text-info' },
  warning: { text: 'text-warning', tile: 'bg-warning/10 text-warning' },
  success: { text: 'text-success', tile: 'bg-success/10 text-success' },
};

function Sparkline({ series, accent }: { series: KpiSeriesPoint[]; accent: KpiAccent }) {
  const gradientId = useId();
  const width = 100;
  const height = 32;
  const max = Math.max(1, ...series.map((p) => p.value));
  const step = width / (series.length - 1);
  const points = series.map((p, i) => [i * step, height - 2 - (p.value / max) * (height - 6)] as const);
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width},${height} L0,${height} Z`;
  return (
    <svg
      data-testid="kpi-sparkline"
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`mt-3 w-full ${ACCENT[accent].text}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  available,
  suffix,
  previous,
  series,
  size = 'default',
  icon: Icon,
  accent = 'mint',
}: {
  label: string;
  value: number | null;
  available: boolean;
  suffix?: string;
  previous?: number | null;
  series?: KpiSeriesPoint[];
  size?: 'default' | 'hero';
  icon?: LucideIcon;
  accent?: KpiAccent;
}) {
  const hasDelta = available && value !== null && previous != null && previous > 0;
  const delta = hasDelta ? ((value! - previous!) / previous!) * 100 : null;
  const up = delta != null && delta >= 0;

  return (
    <div
      className="rounded-xl border border-line bg-surface-0 p-4 shadow-card transition-shadow hover:shadow-md"
      aria-disabled={!available || undefined}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-secondary">{label}</p>
        {Icon && (
          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${ACCENT[accent].tile}`}>
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
      </div>
      {available && value !== null ? (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <p
              className={`font-display font-bold text-ink ${
                size === 'hero' ? 'text-4xl drop-shadow-[0_0_20px_rgba(94,231,165,0.45)]' : 'text-2xl'
              }`}
            >
              {nf.format(value)}{suffix ?? ''}
            </p>
            {delta != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
                aria-label={`${up ? 'aumento' : 'queda'} de ${pctFmt.format(Math.abs(delta))}%`}
              >
                {up ? '▲' : '▼'} {pctFmt.format(Math.abs(delta))}%
              </span>
            )}
          </div>
          {series && series.length >= 2 && <Sparkline series={series} accent={accent} />}
        </>
      ) : (
        <p className="mt-2 text-sm font-semibold text-ink-tertiary">Dados indisponíveis</p>
      )}
    </div>
  );
}
