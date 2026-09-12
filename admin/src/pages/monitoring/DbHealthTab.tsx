import type { ReactNode } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Slow = { query: string; calls: number; mean_ms: number; total_ms: number };
type Payload = {
  slow_by_mean: Slow[]; slow_by_total: Slow[];
  tables: Array<{ name: string; total_pretty: string; live_tup: number; dead_tup: number; last_autovacuum: string | null }>;
  connections: Array<{ state: string; count: number }>;
  db_size: string; stats_since: string | null;
};
type Advisors = { groups: Array<{ name: string; title: string; level: string; category: string; count: number; remediation: string; examples: string[] }> };

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-secondary">{hint}</p>}
      <div className="mt-3 overflow-x-auto">{children}</div>
    </div>
  );
}
function SlowTable({ rows }: { rows: Slow[] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-ink-secondary">
        <tr><th className="py-1">Query</th><th>Calls</th><th>Media</th><th>Total</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line-subtle align-top">
            <td className="py-1 font-mono">{r.query}</td>
            <td>{r.calls}</td><td>{r.mean_ms}ms</td><td>{Math.round(r.total_ms)}ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DbHealthTab() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'db-health', {}),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-secondary">
        Tamanho do banco: <span className="font-semibold text-ink">{data.db_size}</span>
        {data.stats_since ? ` - stats desde ${new Date(data.stats_since).toLocaleString('pt-BR')}` : ''}
      </p>
      <Card title="Queries mais lentas (media)" hint="pg_stat_statements, desde o ultimo reset">
        <SlowTable rows={data.slow_by_mean} />
      </Card>
      <Card title="Queries que mais consomem (total)">
        <SlowTable rows={data.slow_by_total} />
      </Card>
      <Card title="Maiores tabelas">
        <table className="w-full text-left text-xs">
          <thead className="text-ink-secondary">
            <tr><th className="py-1">Tabela</th><th>Tamanho</th><th>Linhas</th><th>Dead</th><th>Autovacuum</th></tr>
          </thead>
          <tbody>
            {data.tables.map((t) => (
              <tr key={t.name} className="border-t border-line-subtle">
                <td className="py-1">{t.name}</td><td>{t.total_pretty}</td><td>{t.live_tup}</td>
                <td className={t.dead_tup > 1000 ? 'text-danger-ink' : ''}>{t.dead_tup}</td>
                <td>{t.last_autovacuum ? new Date(t.last_autovacuum).toLocaleDateString('pt-BR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Conexoes">
        <ul className="text-sm text-ink">
          {data.connections.map((c) => (
            <li key={c.state} className="flex justify-between">
              <span>{c.state}</span><span className="text-ink-secondary">{c.count}</span>
            </li>
          ))}
        </ul>
      </Card>
      <AdvisorsCard />
    </div>
  );
}

function AdvisorsCard() {
  const { data, loading, error } = useAsync(
    () => callAdminApi<Advisors>('monitoring', 'advisors', {}),
    [],
  );
  const notConfigured = !!error && /Management API/i.test(error);
  return (
    <Card title="Advisors (WARN/ERROR)" hint="Recomendacoes de seguranca e performance do Supabase">
      {loading && <Skeleton className="h-16 w-full" />}
      {notConfigured && (
        <p className="text-xs text-ink-secondary">Configure SUPABASE_MGMT_TOKEN na admin-api pra ver advisors.</p>
      )}
      {error && !notConfigured && <p className="text-xs text-ink-secondary">Nao foi possivel consultar os advisors.</p>}
      {data && (data.groups.length === 0 ? (
        <p className="text-xs text-ink-secondary">Nenhum advisor WARN/ERROR.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {data.groups.map((g) => (
            <li key={g.name} className="border-b border-line-subtle pb-2 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={g.level === 'ERROR' ? 'danger' : 'warning'}>{g.level}</Badge>
                <span className="text-ink">{g.title}</span>
                <span className="text-xs text-ink-secondary">{g.count}x</span>
                {g.remediation && (
                  <a href={g.remediation} target="_blank" rel="noreferrer" className="text-xs underline">como corrigir</a>
                )}
              </div>
              {g.examples[0] && <p className="mt-0.5 text-[11px] text-ink-secondary">{g.examples[0]}</p>}
            </li>
          ))}
        </ul>
      ))}
    </Card>
  );
}
