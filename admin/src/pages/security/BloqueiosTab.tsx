import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = { id: string; kind: string; value: string; reason: string | null; created_at: string };

export default function BloqueiosTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'risk.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Row[] }>('security', 'blocklist', {}),
    [],
  );
  const [kind, setKind] = useState<'email' | 'domain'>('email');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await callAdminApi('security', 'blocklist-add', { kind, value: value.trim(), reason });
      toast('Adicionado a blocklist.');
      setValue('');
      setReason('');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao adicionar.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await callAdminApi('security', 'blocklist-remove', { blocklistId: id });
      toast('Removido.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao remover.');
    }
  };

  const columns: Column<Row>[] = [
    { key: 'kind', header: 'Tipo', render: (r) => <Badge>{r.kind === 'domain' ? 'domínio' : 'e-mail'}</Badge> },
    { key: 'value', header: 'Valor' },
    { key: 'reason', header: 'Motivo', render: (r) => r.reason || '-' },
    { key: 'created_at', header: 'Criada', render: (r) => new Date(r.created_at).toLocaleDateString('pt-BR') },
    ...(canManage
      ? [{
          key: 'acao', header: '',
          render: (r: Row) => (
            <button type="button" onClick={() => remove(r.id)} className="text-xs font-semibold text-danger-ink">
              remover
            </button>
          ),
        } as Column<Row>]
      : []),
  ];

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
          <h3 className="font-display text-sm font-bold text-ink">Adicionar</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-secondary">
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as 'email' | 'domain')}
                className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink">
                <option value="email">E-mail exato</option>
                <option value="domain">Domínio</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-secondary">
              Valor
              <input value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="domínio ou e-mail"
                className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-secondary">
              Motivo (opcional)
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus" />
            </label>
            <button type="button" onClick={add} disabled={busy}
              className="rounded-lg border border-line bg-ink px-3 py-2 text-xs font-semibold text-surface-0 disabled:opacity-50">
              {busy ? '...' : 'Adicionar'}
            </button>
          </div>
          {kind === 'domain' && (
            <p className="mt-2 rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-xs text-warning-ink">
              Isto bloqueia TODO cadastro desse domínio. Domínios comuns (gmail, hotmail, outlook...) sao recusados.
            </p>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm text-ink-secondary">{error}</p>
      ) : (
        <DataTable<Row>
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          loading={loading}
          emptyTitle="Blocklist vazia"
        />
      )}
    </div>
  );
}
