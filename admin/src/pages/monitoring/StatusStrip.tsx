import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-success/25 bg-success-bg text-success-ink',
  warning: 'border-warning/25 bg-warning-bg text-warning-ink',
  danger: 'border-danger/25 bg-danger-bg text-danger-ink',
  neutral: 'border-line bg-surface-1 text-ink-secondary',
};

function Pill({ tone, label, onClick }: { tone: Tone; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-80 ${TONE_CLASSES[tone]}`}
    >
      {label}
    </button>
  );
}

function isAuthFailureLine(row: Record<string, unknown>): boolean {
  return /login|password|invalid|denied|fail/i.test(String(row.event_message ?? ''));
}

function JobsPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading } = useAsync(
    () => callAdminApi<{ items: Array<{ fails_24h: number }> }>('monitoring', 'cron-jobs', {}),
    [],
  );
  if (loading || !data) return <Pill tone="neutral" label="Jobs · ..." onClick={() => onJumpTo('jobs')} />;
  const fails = data.items.reduce((sum, j) => sum + j.fails_24h, 0);
  return fails > 0
    ? <Pill tone="danger" label={`Jobs · ${fails} falha(s) (24h)`} onClick={() => onJumpTo('jobs')} />
    : <Pill tone="success" label="Jobs · OK" onClick={() => onJumpTo('jobs')} />;
}

function ErrorsPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading } = useAsync(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 3600_000);
    return callAdminApi<{ totals: { error_rate: number } }>('monitoring', 'dispatch-errors', {
      from: from.toISOString(), to: to.toISOString(),
    });
  }, []);
  if (loading || !data) return <Pill tone="neutral" label="Erros · ..." onClick={() => onJumpTo('erros')} />;
  const rate = data.totals.error_rate;
  const tone: Tone = rate > 5 ? 'danger' : rate >= 1 ? 'warning' : 'success';
  const label = rate < 1 ? 'Erros · OK' : `Erros · ${rate}%`;
  return <Pill tone={tone} label={label} onClick={() => onJumpTo('erros')} />;
}

function BancoPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading } = useAsync(
    () => callAdminApi<{ slow_by_mean: Array<{ mean_ms: number }> }>('monitoring', 'db-health', {}),
    [],
  );
  if (loading || !data) return <Pill tone="neutral" label="Banco · ..." onClick={() => onJumpTo('saude')} />;
  const meanMs = data.slow_by_mean[0]?.mean_ms;
  if (meanMs == null || meanMs < 200) return <Pill tone="success" label="Banco · OK" onClick={() => onJumpTo('saude')} />;
  const tone: Tone = meanMs >= 1000 ? 'danger' : 'warning';
  return <Pill tone={tone} label={`Banco · ${Math.round(meanMs)}ms`} onClick={() => onJumpTo('saude')} />;
}

function AuthPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading, error } = useAsync(
    () => callAdminApi<{ items: Array<Record<string, unknown>> }>('monitoring', 'logs', { source: 'auth', hours: 24 }),
    [],
  );
  if (error) return <Pill tone="neutral" label="Auth · indisponível" onClick={() => onJumpTo('auth')} />;
  if (loading || !data) return <Pill tone="neutral" label="Auth · ..." onClick={() => onJumpTo('auth')} />;
  const fails = data.items.filter(isAuthFailureLine).length;
  return fails > 0
    ? <Pill tone="warning" label={`Auth · ${fails} falha(s) login (24h)`} onClick={() => onJumpTo('auth')} />
    : <Pill tone="success" label="Auth · OK" onClick={() => onJumpTo('auth')} />;
}

export default function StatusStrip({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const can = (p: string) => hasPermission(perms, p);
  return (
    <div className="flex flex-wrap gap-2">
      {can('jobs.read') && <JobsPill onJumpTo={onJumpTo} />}
      {can('errors.read') && <ErrorsPill onJumpTo={onJumpTo} />}
      {can('system_health.read') && <BancoPill onJumpTo={onJumpTo} />}
      {can('system_health.read') && <AuthPill onJumpTo={onJumpTo} />}
    </div>
  );
}
