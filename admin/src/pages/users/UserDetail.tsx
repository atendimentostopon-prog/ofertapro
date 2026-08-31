import { useCallback, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { StatCard } from '../../components/ui/StatCard';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  account_status: string | null;
  trial_started_at: string | null;
  trial_ends_at: string | null;
  created_at: string;
};
type Detail = {
  profile: Profile;
  counts: { offers: number; channels: number; sends_30d: number; clicks_30d: number };
  subscription: { status: string; provider: string; current_period_end: string | null } | null;
  tags: string[];
  notes: Array<{ id: string; admin_email: string | null; body: string; created_at: string }>;
};

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success',
  trialing: 'warning',
  expired: 'danger',
  canceled: 'danger',
  suspended: 'danger',
};
const PLANS = ['free', 'starter', 'pro', 'enterprise'];

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}
function fmtDateTime(v: string): string {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h2 className="font-display text-sm font-bold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

export default function UserDetail() {
  const { id } = useParams();
  const { identity } = useAdminAuth();
  const toast = useToast();
  const perms = identity?.permissions ?? [];
  const canSuspend = hasPermission(perms, 'users.suspend');
  const canReactivate = hasPermission(perms, 'users.reactivate');
  const canBilling = hasPermission(perms, 'users.billing.manage');
  const canNotes = hasPermission(perms, 'users.notes.manage');
  const canTags = hasPermission(perms, 'users.tags.manage');

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Detail>('users', 'get', { userId: id }),
    [id],
  );

  const [busy, setBusy] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [planChoice, setPlanChoice] = useState('pro');
  const [days, setDays] = useState(7);
  const [newTag, setNewTag] = useState('');
  const [noteBody, setNoteBody] = useState('');

  const run = useCallback(
    async (action: string, params: Record<string, unknown>, ok: string) => {
      setBusy(true);
      try {
        await callAdminApi('users', action, { userId: id, ...params });
        toast(ok, 'success');
        reload();
        return true;
      } catch (e) {
        toast(e instanceof AdminApiError || e instanceof Error ? e.message : 'Falha na operação.', 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [id, toast, reload],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-24 w-full" />
      </section>
    );
  }

  const p = data.profile;
  const tone = STATUS_TONE[p.account_status ?? ''] ?? 'neutral';

  async function saveTags(next: string[]) {
    await run('set-tags', { tags: next }, 'Tags atualizadas.');
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    if (!noteBody.trim()) return;
    const okDone = await run('add-note', { body: noteBody.trim() }, 'Nota adicionada.');
    if (okDone) setNoteBody('');
  }

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Conta do cliente</h1>
        <p className="mt-1 text-sm text-ink-secondary">Resumo e ações da conta.</p>
      </header>

      <Card title="Perfil">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-base font-bold text-ink">{p.email}</h3>
            <p className="text-sm text-ink-secondary">{p.full_name || 'Sem nome'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge>{p.plan}</Badge>
              <Badge tone={tone}>{p.account_status ?? '-'}</Badge>
            </div>
          </div>
          <dl className="text-xs text-ink-secondary">
            <div className="flex gap-2"><dt>Trial:</dt><dd>{fmtDate(p.trial_started_at)} a {fmtDate(p.trial_ends_at)}</dd></div>
            <div className="flex gap-2"><dt>Criado em:</dt><dd>{fmtDate(p.created_at)}</dd></div>
          </dl>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Ofertas" value={data.counts.offers} available />
        <StatCard label="Canais" value={data.counts.channels} available />
        <StatCard label="Envios (30d)" value={data.counts.sends_30d} available />
        <StatCard label="Cliques (30d)" value={data.counts.clicks_30d} available />
      </div>

      <Card title="Assinatura">
        {data.subscription ? (
          <p className="text-sm text-ink">
            {data.subscription.status} ({data.subscription.provider}), termina em {fmtDate(data.subscription.current_period_end)}
          </p>
        ) : (
          <p className="text-sm text-ink-secondary">Sem assinatura (cortesia ou trial).</p>
        )}
      </Card>

      <Card title="Tags">
        <div className="flex flex-wrap gap-2">
          {data.tags.length === 0 && <span className="text-xs text-ink-tertiary">nenhuma</span>}
          {data.tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-ink-secondary">
              {t}
              {canTags && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Remover ${t}`}
                  onClick={() => { void saveTags(data.tags.filter((x) => x !== t)); }}
                  className="rounded-full px-1 text-ink-tertiary hover:text-danger-ink disabled:opacity-50"
                >
                  x
                </button>
              )}
            </span>
          ))}
        </div>
        {canTags && (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = newTag.trim().toLowerCase();
              if (t && !data.tags.includes(t)) { void saveTags([...data.tags, t]); setNewTag(''); }
            }}
          >
            <input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="nova-tag"
              className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-sm text-ink outline-none focus:shadow-focus"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-1 disabled:opacity-50"
            >
              Adicionar
            </button>
          </form>
        )}
      </Card>

      <Card title="Notas internas">
        {data.notes.length === 0 && <p className="text-xs text-ink-tertiary">nenhuma nota</p>}
        <ul className="space-y-3">
          {data.notes.map((n) => (
            <li key={n.id} className="border-b border-line-subtle pb-2 last:border-0">
              <p className="text-sm text-ink">{n.body}</p>
              <p className="text-[11px] text-ink-tertiary">{n.admin_email ?? 'admin'} - {fmtDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
        {canNotes && (
          <form className="mt-3 space-y-2" onSubmit={addNote}>
            <textarea
              rows={2}
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="Escreva uma nota interna"
              className="w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
            />
            <button
              type="submit"
              disabled={busy || !noteBody.trim()}
              className="rounded-lg bg-graphite-900 px-3 py-1.5 text-sm font-semibold text-ink-inverse hover:bg-graphite-700 disabled:opacity-50"
            >
              Adicionar nota
            </button>
          </form>
        )}
      </Card>

      {(canSuspend || canReactivate || canBilling) && (
        <Card title="Ações">
          <div className="flex flex-wrap items-end gap-4">
            {p.account_status === 'suspended'
              ? canReactivate && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { void run('reactivate', {}, 'Conta reativada.'); }}
                    className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-1 disabled:opacity-50"
                  >
                    Reativar
                  </button>
                )
              : canSuspend && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => { setReason(''); setSuspendOpen(true); }}
                    className="rounded-lg border border-danger/30 bg-surface-0 px-3 py-2 text-sm font-semibold text-danger-ink hover:bg-danger-bg disabled:opacity-50"
                  >
                    Suspender
                  </button>
                )}

            {canBilling && (
              <>
                <label className="flex flex-col text-xs font-semibold text-ink-secondary">
                  Plano de cortesia
                  <select
                    value={planChoice}
                    onChange={(e) => setPlanChoice(e.target.value)}
                    className="mt-1 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
                  >
                    {PLANS.map((pl) => (
                      <option key={pl} value={pl}>{pl}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void run('set-plan', { plan: planChoice }, 'Plano de cortesia aplicado.'); }}
                  className="rounded-lg bg-graphite-900 px-3 py-2 text-sm font-semibold text-ink-inverse hover:bg-graphite-700 disabled:opacity-50"
                >
                  Cortesia de plano
                </button>

                <label className="flex flex-col text-xs font-semibold text-ink-secondary">
                  Estender trial (dias)
                  <input
                    type="number"
                    min={1}
                    max={90}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="mt-1 w-24 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => { void run('extend-trial', { days }, 'Trial estendido.'); }}
                  className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm font-semibold text-ink hover:bg-surface-1 disabled:opacity-50"
                >
                  Estender trial
                </button>
              </>
            )}
          </div>
        </Card>
      )}

      {suspendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-graphite-900/40 px-4">
          <div className="w-full max-w-md rounded-2xl border border-line bg-surface-0 p-6 shadow-lg">
            <h2 className="font-display text-base font-bold text-ink">Suspender {p.email}</h2>
            <p className="mt-1 text-xs text-ink-secondary">
              A conta perde o acesso na hora e o bot e pausado. Informe o motivo.
            </p>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-4 w-full rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendOpen(false)}
                className="rounded-lg border border-line bg-surface-0 px-3 py-1.5 text-sm font-semibold text-ink hover:bg-surface-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy || !reason.trim()}
                onClick={async () => {
                  const okDone = await run('suspend', { reason: reason.trim() }, 'Conta suspensa.');
                  if (okDone) setSuspendOpen(false);
                }}
                className="rounded-lg bg-danger px-3 py-1.5 text-sm font-semibold text-ink-inverse hover:opacity-90 disabled:opacity-50"
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
