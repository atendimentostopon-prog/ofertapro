import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string;
  name: string;
  status: string;
  short_code: string | null;
  affiliate_link: string | null;
  created_at: string;
  clicks_total: number;
  owner_id: string;
  owner_email: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  paused: 'warning',
  draft: 'neutral',
};
const STATUS_OPTS = ['', 'active', 'paused', 'draft'];

function fmtDate(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function PromotionsList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlClient = params.get('client') ?? '';
  const urlStatus = params.get('status') ?? '';
  const [clientTerm, setClientTerm] = useState(urlClient);

  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (clientTerm) next.set('client', clientTerm);
      else next.delete('client');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientTerm]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('promotions', 'list', {
      client: urlClient, status: urlStatus, page, pageSize: 25,
    }),
    [urlClient, urlStatus, page],
  );

  const setParam = useCallback(
    (k: string, v: string) => {
      const next = new URLSearchParams(params);
      if (v) next.set(k, v);
      else next.delete(k);
      if (k !== 'page') next.set('page', '1');
      setParams(next);
    },
    [params, setParams],
  );

  const columns: Column<Row>[] = [
    { key: 'name', header: 'Oferta' },
    { key: 'owner_email', header: 'Cliente' },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
    {
      key: 'link',
      header: 'Link',
      render: (r) => (r.short_code ? `${r.short_code} - ${r.clicks_total} cliques` : '-'),
    },
    { key: 'created_at', header: 'Criada', render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Promoções</h1>
        <p className="mt-1 text-sm text-ink-secondary">Ofertas de todos os clientes.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filtrar por cliente (e-mail)"
          value={clientTerm}
          onChange={(e) => setClientTerm(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
        <select
          value={urlStatus}
          onChange={(e) => setParam('status', e.target.value)}
          className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
        >
          {STATUS_OPTS.map((s) => (
            <option key={s} value={s}>{s || 'Todos os status'}</option>
          ))}
        </select>
      </div>

      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`/promotions/${r.id}`)}
        emptyTitle="Nenhuma promoção"
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onPageChange: (p) => setParam('page', String(p)),
        }}
      />
    </section>
  );
}
