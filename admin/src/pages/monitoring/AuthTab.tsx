import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { MiniBars } from '../../components/ui/MiniBars';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Payload = {
  totals: { users: number; confirmed: number; unconfirmed: number; banned: number };
  signups_by_day: Array<{ day: string; n: number }>;
  recent_signups: Array<{ id: string; email: string; created_at: string; confirmed: boolean; last_sign_in_at: string | null }>;
};

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

export default function AuthTab() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'auth-overview', {}),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Usuarios" value={data.totals.users} />
        <Stat label="Confirmados" value={data.totals.confirmed} />
        <Stat label="Nao confirmados" value={data.totals.unconfirmed} />
        <Stat label="Banidos" value={data.totals.banned} />
      </div>
      <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
        <h3 className="font-display text-sm font-bold text-ink">Cadastros por dia (30d)</h3>
        <div className="mt-3">
          <MiniBars bars={data.signups_by_day.map((d) => ({ label: d.day, value: d.n }))} />
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
        <h3 className="font-display text-sm font-bold text-ink">Ultimos cadastros</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {data.recent_signups.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 border-b border-line-subtle pb-1 last:border-0">
              <span className="text-ink">{u.email}</span>
              {u.confirmed ? <Badge tone="success">confirmado</Badge> : <Badge tone="warning">pendente</Badge>}
              <span className="text-xs text-ink-tertiary">{new Date(u.created_at).toLocaleDateString('pt-BR')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
