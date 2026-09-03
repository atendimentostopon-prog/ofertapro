import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string;
  offer_name: string;
  status: string;
  error: string | null;
  sent_at: string;
  channel_count: number | null;
  successful_channels: string[];
  failed_channels: string[];
  owner_email: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  success: 'success', sent: 'success', partial: 'warning', error: 'danger',
};
const STATUS_OPTS = ['', 'success', 'partial', 'error', 'sent'];

function fmtDateTime(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function SendsList() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlClient = params.get('client') ?? '';
  const urlStatus = params.get('status') ?? '';
  const urlFrom = params.get('from') ?? '';
  const urlTo = params.get('to') ?? '';
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
    () => callAdminApi<Payload>('sends', 'list', {
      client: urlClient, status: urlStatus, from: urlFrom, to: urlTo, page, pageSize: 25,
    }),
    [urlClient, urlStatus, urlFrom, urlTo, page],
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
    { key: 'offer_name', header: 'Oferta' },
    { key: 'owner_email', header: 'Cliente' },
    { key: 'channel_count', header: 'Canais', render: (r) => String(r.channel_count ?? 0) },
    { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge> },
    { key: 'sent_at', header: 'Quando', render: (r) => fmtDateTime(r.sent_at) },
    {
      key: 'detalhes',
      header: 'Detalhes',
      render: (r) =>
        r.error || r.failed_channels.length > 0 || r.successful_channels.length > 0 ? (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-ink-secondary">ver</summary>
            <div className="mt-2 max-w-md space-y-1 text-[11px] text-ink-secondary">
              {r.error && <p className="text-danger-ink">{r.error}</p>}
              {r.failed_channels.length > 0 && <p>Falharam: {r.failed_channels.join(', ')}</p>}
              {r.successful_channels.length > 0 && <p>OK: {r.successful_channels.join(', ')}</p>}
            </div>
          </details>
        ) : (
          <span className="text-ink-tertiary">-</span>
        ),
    },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Envios</h1>
        <p className="mt-1 text-sm text-ink-secondary">Histórico de disparos de todos os clientes.</p>
      </header>

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filtrar por cliente (e-mail)"
          value={clientTerm}
          onChange={(e) => setClientTerm(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          Status
          <select
            value={urlStatus}
            onChange={(e) => setParam('status', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
          >
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>{s || 'Todos'}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          De
          <input type="date" value={urlFrom} onChange={(e) => setParam('from', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink" />
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-secondary">
          Ate
          <input type="date" value={urlTo} onChange={(e) => setParam('to', e.target.value)}
            className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink" />
        </label>
      </div>

      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle="Nenhum envio"
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
