import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
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
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'risk.manage');
  const posture = useAsync(() => callAdminApi<Posture>('security', 'posture', {}), []);
  const accounts = useAsync(() => callAdminApi<{ items: Row[] }>('security', 'risk-accounts', {}), []);
  const [banId, setBanId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const reloadAll = () => { accounts.reload(); posture.reload(); };

  const unban = async (userId: string) => {
    try {
      await callAdminApi('security', 'unban', { userId });
      toast('Desbanido.');
      reloadAll();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao desbanir.');
    }
  };
  const doBan = async () => {
    if (!reason.trim() || !banId) return;
    try {
      await callAdminApi('security', 'ban', { userId: banId, reason: reason.trim() });
      toast('Conta banida.');
      setBanId(null);
      setReason('');
      reloadAll();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao banir.');
    }
  };

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
    ...(canManage
      ? [{
          key: 'ban', header: '',
          render: (r: Row) => (r.banned ? (
            <button type="button" onClick={(e) => { e.stopPropagation(); unban(r.user_id); }}
              className="text-xs font-semibold text-ink-secondary">desbanir</button>
          ) : (
            <button type="button" onClick={(e) => { e.stopPropagation(); setBanId(r.user_id); }}
              className="text-xs font-semibold text-danger-ink">banir</button>
          )),
        } as Column<Row>]
      : []),
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

      {banId && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Banir conta</h3>
            <p className="mt-1 text-xs text-ink-secondary">
              Bloqueia o login, suspende a conta e pausa o bot. Informe o motivo.
            </p>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3}
              className="mt-3 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => { setBanId(null); setReason(''); }}
                className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-xs font-semibold text-ink">
                Cancelar
              </button>
              <button type="button" onClick={doBan} disabled={!reason.trim()}
                className="rounded-lg border border-line bg-danger-ink px-3 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50">
                Confirmar banimento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
