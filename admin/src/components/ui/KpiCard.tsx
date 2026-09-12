const nf = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export type KpiSeriesPoint = { date: string; value: number };

function Sparkline({ series }: { series: KpiSeriesPoint[] }) {
  const max = Math.max(1, ...series.map((p) => p.value));
  const w = 100 / series.length;
  const height = 28;
  return (
    <svg
      data-testid="kpi-sparkline"
      aria-hidden="true"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="mt-2 w-full"
      style={{ height }}
    >
      {series.map((p, i) => {
        const h = (p.value / max) * (height - 4);
        return (
          <rect
            key={p.date}
            x={i * w + w * 0.2}
            y={height - h}
            width={w * 0.6}
            height={h}
            className="fill-ink/50"
          />
        );
      })}
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
}: {
  label: string;
  value: number | null;
  available: boolean;
  suffix?: string;
  previous?: number | null;
  series?: KpiSeriesPoint[];
  size?: 'default' | 'hero';
}) {
  const hasDelta = available && value !== null && previous != null && previous > 0;
  const delta = hasDelta ? ((value! - previous!) / previous!) * 100 : null;
  const up = delta != null && delta >= 0;

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card" aria-disabled={!available || undefined}>
      <p className="text-xs font-semibold text-ink-secondary">{label}</p>
      {available && value !== null ? (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`font-display font-bold text-ink ${size === 'hero' ? 'text-4xl' : 'text-2xl'}`}>
              {nf.format(value)}{suffix ?? ''}
            </p>
            {delta != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-success-bg text-success-ink' : 'bg-danger-bg text-danger-ink'}`}
                aria-label={`${up ? 'aumento' : 'queda'} de ${pctFmt.format(Math.abs(delta))}%`}
              >
                {up ? '▲' : '▼'} {pctFmt.format(Math.abs(delta))}%
              </span>
            )}
          </div>
          {series && series.length >= 2 && <Sparkline series={series} />}
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold text-ink-tertiary">Dados indisponíveis</p>
      )}
    </div>
  );
}
