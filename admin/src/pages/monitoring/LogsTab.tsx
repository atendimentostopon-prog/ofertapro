import { useState } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Skeleton } from '../../components/ui/Skeleton';

const SOURCES = [
  { key: 'function_edge_logs', label: 'Edge Functions' },
  { key: 'auth', label: 'Auth' },
  { key: 'postgres_logs', label: 'Postgres' },
] as const;

type Payload = { source: string; hours: number; items: Array<Record<string, unknown>> };

export default function LogsTab() {
  const [source, setSource] = useState<string>('function_edge_logs');
  const [hours, setHours] = useState(6);
  const { data, loading, error } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'logs', { source, hours }),
    [source, hours],
  );
  const notConfigured = !!error && /Management API/i.test(error);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button key={s.key} type="button" onClick={() => setSource(s.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              source === s.key ? 'border-ink bg-ink text-surface-0' : 'border-line bg-surface-0 text-ink-secondary'
            }`}>{s.label}</button>
        ))}
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-xs text-ink">
          {[1, 6, 12, 24].map((n) => <option key={n} value={n}>{n}h</option>)}
        </select>
      </div>
      {notConfigured && (
        <p className="rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-xs text-warning-ink">
          Configure o secret SUPABASE_MGMT_TOKEN na admin-api pra ver logs.
        </p>
      )}
      {loading && <Skeleton className="h-40 w-full" />}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-0 p-3 shadow-card">
          <table className="w-full text-left text-[11px]">
            <tbody>
              {data.items.map((row, i) => (
                <tr key={i} className="border-b border-line-subtle align-top">
                  <td className="whitespace-nowrap py-1 pr-3 font-mono text-ink-secondary">
                    {String(row.timestamp ?? '')}
                  </td>
                  <td className="py-1 font-mono text-ink">
                    {String(row.event_message ?? JSON.stringify(row))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p className="text-xs text-ink-secondary">Sem linhas no periodo.</p>}
        </div>
      )}
    </div>
  );
}
