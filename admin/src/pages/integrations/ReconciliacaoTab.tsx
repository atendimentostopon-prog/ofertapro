import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';

type Local = {
  plano_sem_subscription: Array<{ user_id: string; user_email: string; plan: string; account_status: string }>;
  subscription_ativa_sem_acesso: Array<{ id: string; provider_subscription_id: string; user_id: string; user_email: string; status: string; account_status: string; plan: string }>;
  past_due_em_grace: Array<{ id: string; user_email: string; grace_period_ends_at: string | null }>;
};
type Remote = {
  orfas_na_cakto: Array<{ provider_subscription_id: string; customer_email: string | null; plan_code: string | null; status: string; amount: number; current_period_end: string | null; normalized: unknown }>;
  locais_sem_par_na_cakto: Array<{ id: string; provider_subscription_id: string; user_email: string | null; status: string }>;
  truncated: boolean;
};

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-secondary">{hint}</p>}
      <div className="mt-3">{children}</div>
    </div>
  );
}
function Empty() {
  return <p className="text-xs text-ink-secondary">Nada aqui.</p>;
}

export default function ReconciliacaoTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canSync = hasPermission(identity?.permissions ?? [], 'cakto.sync');
  const local = useAsync(() => callAdminApi<Local>('cakto', 'reconcile-local', {}), []);
  const remote = useAsync(() => callAdminApi<Remote>('cakto', 'reconcile-remote', {}), []);

  const importOrfa = async (normalized: unknown) => {
    try {
      await callAdminApi('cakto', 'import', { remote: normalized });
      toast('Assinatura importada.');
      remote.reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao importar.');
    }
  };

  return (
    <div className="space-y-4">
      <Section title="Órfãs na Cakto" hint="Assinatura ativa na Cakto sem row local. Use Importar (precisa de Sincronizar Cakto).">
        {remote.loading && <Skeleton className="h-16 w-full" />}
        {remote.error && <p className="text-xs text-ink-secondary">Nao foi possivel consultar a Cakto.</p>}
        {remote.data && remote.data.truncated && (
          <p className="mb-2 text-xs text-warning-ink">Lista truncada (muitas assinaturas ativas na Cakto).</p>
        )}
        {remote.data && (remote.data.orfas_na_cakto.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {remote.data.orfas_na_cakto.map((o) => (
              <li key={o.provider_subscription_id} className="flex flex-wrap items-center gap-2">
                <span>{o.customer_email ?? '(sem e-mail)'}</span>
                <Badge>{o.plan_code ?? '?'}</Badge>
                <span className="text-xs text-ink-secondary">{o.provider_subscription_id}</span>
                {canSync && (
                  <button
                    type="button"
                    onClick={() => importOrfa(o.normalized)}
                    className="rounded-lg border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-surface-0"
                  >
                    importar
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Locais sem par na Cakto" hint="Row local ativa que a Cakto nao lista mais. Abra a assinatura e use Aplicar.">
        {remote.data && (remote.data.locais_sem_par_na_cakto.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {remote.data.locais_sem_par_na_cakto.map((l) => (
              <li key={l.id}>
                <Link to={`/cakto/subscriptions/${l.id}`} className="underline">{l.user_email ?? l.provider_subscription_id}</Link>
                <span className="ml-2 text-xs text-ink-secondary">{l.status}</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Assinatura ativa sem acesso" hint="Row local ativa mas a conta nao tem acesso. Drift real.">
        {local.loading && <Skeleton className="h-16 w-full" />}
        {local.error && <p className="text-xs text-ink-secondary">{local.error}</p>}
        {local.data && (local.data.subscription_ativa_sem_acesso.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {local.data.subscription_ativa_sem_acesso.map((s) => (
              <li key={s.id}>
                <Link to={`/cakto/subscriptions/${s.id}`} className="underline">{s.user_email}</Link>
                <span className="ml-2 text-xs text-ink-secondary">conta {s.account_status} / plano {s.plan}</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Plano pago sem assinatura" hint="Cortesia. Informativo, nao e bug.">
        {local.data && (local.data.plano_sem_subscription.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {local.data.plano_sem_subscription.map((p) => (
              <li key={p.user_id} className="flex flex-wrap items-center gap-2">
                <Link to={`/users/${p.user_id}`} className="underline">{p.user_email}</Link>
                <Badge>{p.plan}</Badge>
                <span className="text-xs text-ink-secondary">cortesia, ok</span>
              </li>
            ))}
          </ul>
        ))}
      </Section>

      <Section title="Past due em grace">
        {local.data && (local.data.past_due_em_grace.length === 0 ? <Empty /> : (
          <ul className="space-y-1 text-sm text-ink">
            {local.data.past_due_em_grace.map((g) => (
              <li key={g.id}>{g.user_email} &middot; grace ate {g.grace_period_ends_at ? new Date(g.grace_period_ends_at).toLocaleString('pt-BR') : '-'}</li>
            ))}
          </ul>
        ))}
      </Section>
    </div>
  );
}
