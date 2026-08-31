import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';

const PAGE_SIZE = 25;

type AuditRow = {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
};

type AuditPayload = { items: AuditRow[]; page: number; pageSize: number; total: number };

function fmtDateTime(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function AuditList() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<AuditPayload>('audit', 'list', { page, pageSize: PAGE_SIZE }),
    [page],
  );

  const setPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(params);
      next.set('page', String(p));
      setParams(next);
    },
    [params, setParams],
  );

  const columns: Column<AuditRow>[] = [
    { key: 'created_at', header: 'Data', render: (r) => fmtDateTime(r.created_at) },
    { key: 'admin', header: 'Admin', render: (r) => r.admin_email ?? r.admin_id ?? 'sistema' },
    { key: 'action', header: 'Ação' },
    {
      key: 'entity',
      header: 'Entidade',
      render: (r) => [r.entity_type, r.entity_id].filter(Boolean).join(' ') || '-',
    },
    { key: 'reason', header: 'Motivo', render: (r) => r.reason ?? '-' },
    {
      key: 'detalhes',
      header: 'Detalhes',
      render: (r) =>
        r.before == null && r.after == null ? (
          <span className="text-ink-tertiary">-</span>
        ) : (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">ver</summary>
            <pre className="mt-2 max-w-md overflow-x-auto rounded-lg bg-surface-1 p-2 text-[11px] leading-relaxed text-ink-secondary">
{JSON.stringify({ before: r.before, after: r.after }, null, 2)}
            </pre>
          </details>
        ),
    },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Auditoria</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Registro imutável de toda ação administrativa.
        </p>
      </header>

      <DataTable<AuditRow>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="Nenhum registro"
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? PAGE_SIZE,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </section>
  );
}
