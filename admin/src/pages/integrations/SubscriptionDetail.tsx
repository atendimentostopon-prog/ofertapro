import { type ReactNode, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Local = {
  id: string; provider_subscription_id: string; user_id: string; user_email: string;
  user_plan: string; user_account_status: string;
  plan_code: string; billing_cycle: string; status: string; amount: number;
  current_period_start: string | null; current_period_end: string | null;
  cancel_at_period_end: boolean; grace_period_ends_at: string | null;
  canceled_at: string | null; created_at: string;
};
type Normalized = {
  provider_subscription_id: string; customer_email: string | null;
  plan_code: string | null; billing_cycle: string | null; status: string; amount: number;
  current_period_start: string | null; current_period_end: string | null;
  cancel_at_period_end: boolean; canceled_at: string | null;
};

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function DiffRow({ label, local, remote }: { label: string; local: ReactNode; remote: ReactNode }) {
  const differ = String(local) !== String(remote);
  return (
    <tr className={differ ? 'bg-warning-bg' : ''}>
      <td className="px-3 py-1.5 text-xs font-semibold text-ink-secondary">{label}</td>
      <td className="px-3 py-1.5 text-sm text-ink">{local}</td>
      <td className="px-3 py-1.5 text-sm text-ink">{remote}</td>
    </tr>
  );
}

export default function SubscriptionDetail() {
  const { id } = useParams();
  const local = useAsync(() => callAdminApi<Local>('cakto', 'subscription', { id }), [id]);
  const remote = useAsync(async () => {
    if (!local.data) return null;
    try {
      return await callAdminApi<{ raw: unknown; normalized: Normalized }>(
        'cakto', 'remote-subscription', { providerSubscriptionId: local.data.provider_subscription_id },
      );
    } catch (e) {
      if (e instanceof AdminApiError && e.code === 'not_found') return { missing: true } as const;
      throw e;
    }
  }, [local.data?.provider_subscription_id]);

  if (local.error) return <ErrorState message={local.error} onRetry={local.reload} />;
  if (local.loading || !local.data) {
    return <section className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-52 w-full" /></section>;
  }
  const l = local.data;
  const r = remote.data && !('missing' in remote.data) ? remote.data.normalized : null;
  const missing = !!remote.data && 'missing' in remote.data;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Assinatura</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          <Link to={`/users/${l.user_id}`} className="underline">{l.user_email}</Link>
          {' '}&middot; {l.provider_subscription_id}
        </p>
      </header>

      <Card title="Local vs Cakto">
        {missing && (
          <p className="mb-3 rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-xs text-warning-ink">
            Essa assinatura nao existe mais na Cakto.
          </p>
        )}
        {remote.loading && <Skeleton className="h-24 w-full" />}
        {r && (
          <div className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-left">
              <thead className="border-b border-line bg-surface-1">
                <tr>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Campo</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Local</th>
                  <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Cakto</th>
                </tr>
              </thead>
              <tbody>
                <DiffRow label="status" local={l.status} remote={r.status} />
                <DiffRow label="plano" local={`${l.plan_code}/${l.billing_cycle}`} remote={`${r.plan_code ?? '-'}/${r.billing_cycle ?? '-'}`} />
                <DiffRow label="valor" local={l.amount} remote={r.amount} />
                <DiffRow label="período até" local={l.current_period_end ?? '-'} remote={r.current_period_end ?? '-'} />
                <DiffRow label="cancela no fim" local={String(l.cancel_at_period_end)} remote={String(r.cancel_at_period_end)} />
              </tbody>
            </table>
          </div>
        )}
        {r && (
          <ApplyButton
            subscriptionId={l.id}
            normalized={r}
            onDone={() => { local.reload(); remote.reload(); }}
          />
        )}
      </Card>

      <Card title="Acesso do usuário">
        <div className="flex flex-wrap gap-1.5 text-sm">
          <Badge>plano {l.user_plan}</Badge>
          <Badge>conta {l.user_account_status}</Badge>
        </div>
      </Card>

      <BillingCycles providerSubscriptionId={l.provider_subscription_id} />
    </section>
  );
}

function ApplyButton({ subscriptionId, normalized, onDone }: {
  subscriptionId: string;
  normalized: Normalized;
  onDone: () => void;
}) {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!hasPermission(identity?.permissions ?? [], 'cakto.sync')) return null;
  const run = async () => {
    setBusy(true);
    try {
      const res = await callAdminApi<{ applied: string }>('cakto', 'apply', {
        id: subscriptionId,
        remote: {
          status: normalized.status,
          current_period_end: normalized.current_period_end,
          cancel_at_period_end: normalized.cancel_at_period_end,
          plan_code: normalized.plan_code,
          amount: normalized.amount,
        },
      });
      toast(`Aplicado: ${res.applied}`);
      onDone();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao aplicar.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      className="mt-3 rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50"
    >
      {busy ? 'Aplicando...' : 'Aplicar o que a Cakto diz'}
    </button>
  );
}

function BillingCycles({ providerSubscriptionId }: { providerSubscriptionId: string }) {
  const { data, loading, error } = useAsync(
    () => callAdminApi<{ items: Array<{ id: string; cycle_number: number; due_date: string; amount: string; status: string; total_attempts: number }> }>(
      'cakto', 'remote-billing-cycles', { providerSubscriptionId },
    ),
    [providerSubscriptionId],
  );
  return (
    <Card title="Ciclos de cobrança (Cakto)">
      {loading && <Skeleton className="h-16 w-full" />}
      {error && <p className="text-xs text-ink-secondary">Nao foi possivel carregar da Cakto.</p>}
      {data && data.items.length === 0 && <p className="text-xs text-ink-secondary">Sem ciclos.</p>}
      {data && data.items.length > 0 && (
        <ul className="space-y-1 text-xs text-ink-secondary">
          {data.items.map((c) => (
            <li key={c.id}>
              #{c.cycle_number} &middot; {new Date(c.due_date).toLocaleDateString('pt-BR')} &middot; R$ {c.amount} &middot; {c.status} &middot; {c.total_attempts} tentativa(s)
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
