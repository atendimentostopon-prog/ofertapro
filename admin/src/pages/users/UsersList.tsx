import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  account_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  trialing: 'warning',
  expired: 'danger',
  canceled: 'danger',
  suspended: 'danger',
};

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function UsersList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlQ = params.get('q') ?? '';
  const [term, setTerm] = useState(urlQ);

  // debounce do input -> query na URL
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term) next.set('q', term);
      else next.delete('q');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('users', 'list', { search: urlQ, page, pageSize: 25 }),
    [urlQ, page],
  );

  const setPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(params);
      next.set('page', String(p));
      setParams(next);
    },
    [params, setParams],
  );

  const columns: Column<Row>[] = [
    { key: 'email', header: 'E-mail' },
    { key: 'full_name', header: 'Nome', render: (r) => r.full_name || '-' },
    { key: 'plan', header: 'Plano', render: (r) => <Badge>{r.plan}</Badge> },
    {
      key: 'account_status',
      header: 'Status',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.account_status ?? ''] ?? 'neutral'}>{r.account_status ?? '-'}</Badge>
      ),
    },
    { key: 'trial_ends_at', header: 'Trial ate', render: (r) => fmtDate(r.trial_ends_at) },
    { key: 'created_at', header: 'Criado em', render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Usuários</h1>
        <p className="mt-1 text-sm text-ink-secondary">Contas de cliente do Aflyo.</p>
      </header>

      <input
        type="search"
        placeholder="Buscar por e-mail ou nome"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
      />

      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`/users/${r.id}`)}
        emptyTitle={urlQ ? 'Nenhum cliente para essa busca' : 'Nenhum cliente'}
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
      />
    </section>
  );
}
