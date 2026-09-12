import { useState } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { MiniBars } from '../../components/ui/MiniBars';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Payload = {
  totals: { sends: number; success: number; partial: number; error: number; error_rate: number };
  by_day: Array<{ day: string; sends: number; bad: number }>;
  top_channels: Array<{ channel: string; fails: number }>;
  recent: Array<{ id: string; sent_at: string; offer_name: string; user_email: string | null; status: string; failed_channels: string[]; error: string | null }>;
};

const RANGES = [
  { key: '24h', label: '24 horas', hours: 24 },
  { key: '7d', label: '7 dias', hours: 24 * 7 },
  { key: '30d', label: '30 dias', hours: 24 * 30 },
] as const;

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

export default function ErrorsTab() {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('24h');

  const { data, loading, error, reload } = useAsync(
    () => {
      const hours = RANGES.find((x) => x.key === range)!.hours;
      const to = new Date();
      const from = new Date(to.getTime() - hours * 3600_000);
      return callAdminApi<Payload>('monitoring', 'dispatch-errors', {
        from: from.toISOString(), to: to.toISOString(),
      });
    },
    [range],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button key={r.key} type="button" onClick={() => setRange(r.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              range === r.key ? 'border-ink bg-ink text-surface-0' : 'border-line bg-surface-0 text-ink-secondary'
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <Skeleton className="h-40 w-full" />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Disparos" value={data.totals.sends} />
            <Stat label="Parciais" value={data.totals.partial} />
            <Stat label="Com erro" value={data.totals.error} />
            <Stat label="Taxa de falha" value={`${data.totals.error_rate}%`} />
          </div>

          <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Por dia</h3>
            <div className="mt-3">
              <MiniBars bars={data.by_day.map((d) => ({ label: d.day, value: d.sends, alt: d.bad }))} />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Canais que mais falharam</h3>
            {data.top_channels.length === 0 ? (
              <p className="mt-2 text-xs text-ink-secondary">Nenhum.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {data.top_channels.map((c) => (
                  <li key={c.channel} className="flex justify-between">
                    <span>{c.channel}</span><span className="text-ink-secondary">{c.fails}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Ultimos com falha</h3>
            {data.recent.length === 0 ? (
              <p className="mt-2 text-xs text-ink-secondary">Nada no periodo.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.recent.map((r) => (
                  <li key={r.id} className="border-b border-line-subtle pb-2 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink">{r.offer_name}</span>
                      <Badge tone={r.status === 'error' ? 'danger' : 'warning'}>{r.status}</Badge>
                      <span className="text-xs text-ink-secondary">{r.user_email ?? '-'}</span>
                      <span className="text-xs text-ink-tertiary">{new Date(r.sent_at).toLocaleString('pt-BR')}</span>
                    </div>
                    {r.error && <p className="mt-1 text-[11px] text-danger-ink">{r.error}</p>}
                    {r.failed_channels.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-ink-secondary">Falharam: {r.failed_channels.join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
