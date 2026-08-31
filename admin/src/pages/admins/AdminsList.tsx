import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type AdminRow = {
  id: string;
  email: string;
  status: 'active' | 'suspended';
  roleKeys: string[];
  mfaEnrolled: boolean;
  lastSignInAt: string | null;
  createdAt: string;
};

function fmtDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function AdminsList() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'admins.manage');

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ admins: AdminRow[] }>('admins', 'list'),
    [],
  );

  const [suspendTarget, setSuspendTarget] = useState<AdminRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const doSuspend = useCallback(async () => {
    if (!suspendTarget || !reason.trim()) return;
    setBusy(true);
    try {
      await callAdminApi('admins', 'suspend', { adminId: suspendTarget.id, reason: reason.trim() });
      toast('Administrador suspenso.', 'success');
      setSuspendTarget(null);
      setReason('');
      reload();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Falha ao suspender.', 'error');
    } finally {
      setBusy(false);
    }
  }, [suspendTarget, reason, toast, reload]);

  const doReactivate = useCallback(
    async (row: AdminRow) => {
      try {
        await callAdminApi('admins', 'reactivate', { adminId: row.id });
        toast('Administrador reativado.', 'success');
        reload();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Falha ao reativar.', 'error');
      }
    },
    [toast, reload],
  );

  const columns: Column<AdminRow>[] = [
    { key: 'email', header: 'E-mail' },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={r.status === 'active' ? 'success' : 'danger'}>
          {r.status === 'active' ? 'Ativo' : 'Suspenso'}
        </Badge>
      ),
    },
    {
      key: 'roleKeys',
      header: 'Cargos',
      render: (r) =>
        r.roleKeys.length ? (
          <span className="flex flex-wrap gap-1">
            {r.roleKeys.map((k) => (
              <Badge key={k}>{k}</Badge>
            ))}
          </span>
        ) : (
          <span className="text-ink-tertiary">nenhum</span>
        ),
    },
    { key: 'mfaEnrolled', header: 'MFA', render: (r) => (r.mfaEnrolled ? 'Sim' : 'Não') },
    { key: 'createdAt', header: 'Criado em', render: (r) => fmtDate(r.createdAt) },
  ];

  if (canManage) {
    columns.push({
      key: 'acoes',
      header: 'Ações',
      render: (r) =>
        r.status === 'active' ? (
          <button
            type="button"
            onClick={() => { setSuspendTarget(r); setReason(''); }}
            className="rounded-lg border border-danger/30 bg-surface-0 px-2.5 py-1 text-xs font-semibold text-danger-ink transition-colors hover:bg-danger-bg"
          >
            Suspender
          </button>
        ) : (
          <button
            type="button"
            onClick={() => { void doReactivate(r); }}
            className="rounded-lg border border-line bg-surface-0 px-2.5 py-1 text-xs font-semibold text-ink transition-colors hover:bg-surface-1"
          >
            Reativar
          </button>
        ),
    });
  }

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Administradores</h1>
          <p className="mt-1 text-sm text-ink-secondary">Contas com acesso ao painel.</p>
        </div>
        {canManage && (
          <Link
            to="/admins/invite"
            className="rounded-lg bg-graphite-900 px-3 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-graphite-700"
          >
            Convidar admin
          </Link>
        )}
      </header>

      <DataTable<AdminRow>
        columns={columns}
        rows={data?.admins ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="Nenhum administrador"
      />

      {suspendTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface-0 p-6 shadow-lg">
            <h2 className="font-display text-base font-bold text-ink">
              Suspender {suspendTarget.email}
            </h2>
            <p className="mt-1 text-xs text-ink-secondary">
              A conta perde o acesso ao painel na hora. Informe o motivo.
            </p>
            <label className="mt-4 block">
              <span className="text-xs font-semibold text-ink-secondary">Motivo</span>
              <textarea
                required
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setSuspendTarget(null); setReason(''); }}
                className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={() => { void doSuspend(); }}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-ink-inverse transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {busy ? 'Suspendendo...' : 'Suspender'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
