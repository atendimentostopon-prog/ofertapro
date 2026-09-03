import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';

type Ev = { id: string; provider_event_id: string; event_type: string; provider_subscription_id: string | null; processed_at: string };
type EvList = { items: Ev[]; page: number; pageSize: number; total: number };
type EvFull = Ev & { payload: unknown };
type Remote = { items: Array<{ id: number; event_id: string; event_name: string | null; event_status: number | null; dispatched_at: string | null; processed_locally: boolean }> };

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function WebhooksTab() {
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('wpage')) || 1);
  const type = params.get('etype') ?? '';
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useAsync(
    () => callAdminApi<EvList>('webhooks', 'events', { type, page, pageSize: 25 }),
    [type, page],
  );
  const detail = useAsync(
    () => (openId ? callAdminApi<EvFull>('webhooks', 'event', { id: openId }) : Promise.resolve(null)),
    [openId],
  );

  const setParam = useCallback((k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'wpage') next.set('wpage', '1');
    setParams(next);
  }, [params, setParams]);

  const columns: Column<Ev>[] = [
    { key: 'provider_event_id', header: 'Evento' },
    { key: 'event_type', header: 'Tipo', render: (r) => <Badge>{r.event_type}</Badge> },
    { key: 'provider_subscription_id', header: 'Assinatura', render: (r) => r.provider_subscription_id || '-' },
    { key: 'processed_at', header: 'Processado', render: (r) => fmt(r.processed_at) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Filtrar por tipo (ex: subscription_renewed)"
          defaultValue={type}
          onChange={(e) => setParam('etype', e.target.value)}
          className="w-full max-w-xs rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
        />
      </div>

      <DataTable<Ev>
        columns={columns}
        rows={list.data?.items ?? []}
        rowKey={(r) => r.id}
        loading={list.loading}
        error={list.error}
        onRetry={list.reload}
        onRowClick={(r) => setOpenId(r.id)}
        emptyTitle="Nenhum evento"
        pagination={{
          page: list.data?.page ?? page, pageSize: list.data?.pageSize ?? 25, total: list.data?.total ?? 0,
          onPageChange: (p) => setParam('wpage', String(p)),
        }}
      />

      {openId && (
        <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-bold text-ink">Payload do evento</h3>
            <button type="button" onClick={() => setOpenId(null)} className="text-xs font-semibold text-ink-secondary">fechar</button>
          </div>
          {detail.loading && <Skeleton className="mt-3 h-40 w-full" />}
          {detail.data && (
            <pre className="mt-3 max-h-96 overflow-auto rounded-lg bg-surface-1 p-3 text-[11px] text-ink">
              {JSON.stringify(detail.data.payload, null, 2)}
            </pre>
          )}
        </div>
      )}

      <RemoteHistory />
    </div>
  );
}

function RemoteHistory() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Remote>('webhooks', 'remote-history', {}),
    [],
  );
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink">Conferir na Cakto</h3>
        <button type="button" onClick={reload} className="text-xs font-semibold text-ink-secondary">recarregar</button>
      </div>
      {loading && <Skeleton className="mt-3 h-24 w-full" />}
      {error && <p className="mt-3 text-xs text-ink-secondary">Nao foi possivel consultar a Cakto.</p>}
      {data && (
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-surface-1">
              <tr>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Tipo</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">HTTP</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Quando</th>
                <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Local</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} className="border-b border-line-subtle last:border-0">
                  <td className="px-3 py-1.5">{it.event_id}</td>
                  <td className="px-3 py-1.5">{it.event_status ?? '-'}</td>
                  <td className="px-3 py-1.5">{fmt(it.dispatched_at)}</td>
                  <td className="px-3 py-1.5">
                    <Badge tone={it.processed_locally ? 'success' : 'danger'}>
                      {it.processed_locally ? 'ok' : 'faltando'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
