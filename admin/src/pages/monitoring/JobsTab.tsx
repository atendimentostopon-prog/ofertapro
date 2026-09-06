import { useState } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Job = {
  jobid: number; jobname: string; schedule: string; active: boolean;
  last_status: string | null; last_return_message: string | null;
  last_start: string | null; last_end: string | null; last_duration_ms: number | null;
  runs_24h: number; fails_24h: number;
};
type Run = { runid: number; status: string; return_message: string | null; start_time: string; end_time: string | null; duration_ms: number | null };

const TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  succeeded: 'success', failed: 'danger', running: 'warning',
};
function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

function JobRow({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const runs = useAsync(
    () => (open
      ? callAdminApi<{ items: Run[] }>('monitoring', 'cron-runs', { job: job.jobname, page: 1, pageSize: 20 })
      : Promise.resolve(null)),
    [open, job.jobname],
  );
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="font-display text-sm font-bold text-ink">{job.jobname}</span>
        <span className="font-mono text-xs text-ink-secondary">{job.schedule}</span>
        <Badge tone={TONE[job.last_status ?? ''] ?? 'neutral'}>{job.last_status ?? 'sem execucao'}</Badge>
        <span className="text-xs text-ink-secondary">
          {fmt(job.last_start)} {job.last_duration_ms != null ? `- ${job.last_duration_ms}ms` : ''}
        </span>
        {job.fails_24h > 0 && <Badge tone="danger">{job.fails_24h} falha(s) 24h</Badge>}
      </button>
      {job.last_return_message && (
        <p className="mt-1 font-mono text-[11px] text-ink-secondary">{job.last_return_message}</p>
      )}
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {runs.loading && <Skeleton className="h-24 w-full" />}
          {runs.data && (
            <table className="w-full text-left text-xs">
              <thead className="text-ink-secondary">
                <tr><th className="py-1">Quando</th><th>Status</th><th>Duracao</th><th>Mensagem</th></tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => (
                  <tr key={r.runid} className="border-t border-line-subtle">
                    <td className="py-1">{fmt(r.start_time)}</td>
                    <td><Badge tone={TONE[r.status] ?? 'neutral'}>{r.status}</Badge></td>
                    <td>{r.duration_ms != null ? `${r.duration_ms}ms` : '-'}</td>
                    <td className="font-mono">{r.return_message ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobsTab() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Job[] }>('monitoring', 'cron-jobs', {}),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-3">
      {data.items.map((j) => <JobRow key={j.jobid} job={j} />)}
    </div>
  );
}
