type Bar = { label: string; value: number; alt?: number };

export function MiniBars({ bars, height = 64 }: { bars: Bar[]; height?: number }) {
  if (bars.length === 0) return <p className="text-xs text-ink-secondary">Sem dados no periodo.</p>;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const w = 100 / bars.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {bars.map((b, i) => {
        const h = (b.value / max) * (height - 14);
        const ah = b.alt ? (b.alt / max) * (height - 14) : 0;
        return (
          <g key={b.label}>
            <rect x={i * w + w * 0.15} y={height - 12 - h} width={w * 0.7} height={h} className="fill-ink/70" />
            {b.alt ? (
              <rect x={i * w + w * 0.15} y={height - 12 - ah} width={w * 0.7} height={ah} className="fill-danger-ink" />
            ) : null}
            <title>{b.label}: {b.value}{b.alt != null ? ` (${b.alt} com falha)` : ''}</title>
          </g>
        );
      })}
    </svg>
  );
}
