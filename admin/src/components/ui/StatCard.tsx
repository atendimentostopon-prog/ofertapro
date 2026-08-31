const nf = new Intl.NumberFormat('pt-BR');

export function StatCard({
  label,
  value,
  available,
  suffix,
}: {
  label: string;
  value: number | null;
  available: boolean;
  suffix?: string;
}) {
  return (
    <div
      className="rounded-xl border border-line bg-surface-0 p-4 shadow-card"
      aria-disabled={!available || undefined}
    >
      <p className="text-xs font-semibold text-ink-secondary">{label}</p>
      {available && value !== null ? (
        <p className="mt-1 font-display text-2xl font-bold text-ink">
          {nf.format(value)}{suffix ?? ''}
        </p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-ink-tertiary">Dados indisponíveis</p>
      )}
    </div>
  );
}
