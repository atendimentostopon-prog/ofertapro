import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string; provider_subscription_id: string; user_id: string; user_email: string;
  plan_code: string; billing_cycle: string; status: string; amount: number;
  current_period_end: string | null; cancel_at_period_end: boolean;
  grace_period_ends_at: string | null; canceled_at: string | null; created_at: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success', past_due: 'warning', canceled: 'danger', expired: 'neutral',
};
const STATUS_OPTS = ['', 'active', 'past_due', 'canceled', 'expired'];

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}
function fmtBRL(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SubscriptionsTab() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlSearch = params.get('q') ?? '';
  const urlStatus = params.get('status') ?? '';
  const [term, setTerm] = useState(urlSearch);

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
    () => callAdminApi<Payload>('cakto', 'subscriptions', { search: urlSearch, status: urlStatus, page, pageSize: 25 }),
    [urlSearch, urlStatus, page],
  );

  const setParam = useCallback((k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.set('page', '1');
    setParams(next);
  }, [params, setParams]);

  const columns: Column<Row>[] = [
    { key: 'user_email', header: 'Cliente' },
    { key: 'plan_code', header: 'Plano', render: (r) => <Badge>{r.plan_code}/{r.billing_cycle}</Badge> },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}{r.cancel_at_period_end ? ' (cancela no fim)' : ''}</Badge> },
    { key: 'amount', header: 'Valor', render: (r) => fmtBRL(r.amount) },
    { key: 'current_period_end', header: 'Período até', render: (r) => fmtDate(r.current_period_end) },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Buscar por e-mail ou id da assinatura"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          Status
          <select value={urlStatus} onChange={(e) => setParam('status', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{s || 'Todos'}</option>)}
          </select>
        </label>
      </div>
      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        onRowClick={(r) => navigate(`/cakto/subscriptions/${r.id}`)}
        emptyTitle="Nenhuma assinatura"
        pagination={{
          page: data?.page ?? page, pageSize: data?.pageSize ?? 25, total: data?.total ?? 0,
          onPageChange: (p) => setParam('page', String(p)),
        }}
      />
    </div>
  );
}
