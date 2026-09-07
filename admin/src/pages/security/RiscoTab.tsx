import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Posture = {
  admins: { total: number; mfa_enrolled: number };
  users: { total: number; banned: number; suspended: number; unconfirmed: number };
  blocklist: { emails: number; domains: number };
};
type Row = { user_id: string; email: string; created_at: string; account_status: string; plan: string; banned: boolean; flags: string[] };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

export default function RiscoTab() {
  const navigate = useNavigate();
  const posture = useAsync(() => callAdminApi<Posture>('security', 'posture', {}), []);
  const accounts = useAsync(() => callAdminApi<{ items: Row[] }>('security', 'risk-accounts', {}), []);

  const columns: Column<Row>[] = [
    { key: 'email', header: 'E-mail' },
    {
      key: 'account_status', header: 'Conta',
      render: (r) => <Badge tone={r.account_status === 'suspended' ? 'danger' : 'neutral'}>{r.account_status}</Badge>,
    },
    {
      key: 'flags', header: 'Sinais',
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          {r.flags.map((f) => <Badge key={f} tone={f === 'banido' ? 'danger' : 'warning'}>{f}</Badge>)}
        </div>
      ),
    },
    { key: 'created_at', header: 'Criada', render: (r) => new Date(r.created_at).toLocaleDateString('pt-BR') },
  ];

  return (
    <div className="space-y-4">
      {posture.loading && <Skeleton className="h-20 w-full" />}
      {posture.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Admins com MFA" value={`${posture.data.admins.mfa_enrolled} / ${posture.data.admins.total}`} />
          <Stat label="Contas banidas" value={posture.data.users.banned} />
          <Stat label="Contas suspensas" value={posture.data.users.suspended} />
          <Stat label="Nao confirmadas" value={posture.data.users.unconfirmed} />
          <Stat label="Blocklist" value={`${posture.data.blocklist.emails}e / ${posture.data.blocklist.domains}d`} />
        </div>
      )}

      <div>
        <h3 className="mb-2 font-display text-sm font-bold text-ink">Contas sinalizadas</h3>
        {accounts.error ? (
          <ErrorState message={accounts.error} onRetry={accounts.reload} />
        ) : (
          <DataTable<Row>
            columns={columns}
            rows={accounts.data?.items ?? []}
            rowKey={(r) => r.user_id}
            loading={accounts.loading}
            onRowClick={(r) => navigate(`/users/${r.user_id}`)}
            emptyTitle="Nenhuma conta sinalizada"
          />
        )}
      </div>
    </div>
  );
}
