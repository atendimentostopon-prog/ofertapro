import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';
import { mgmtConfigured, mgmtFetch, projectRef } from '../_shared/supabase-mgmt.ts';

export function reqStr(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

export const cronJobs: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cron_jobs', {});
  if (error) throw new Error(error.message);
  return data;
};

export const cronRuns: Handler = async (params) => {
  const job = reqStr(params, 'job');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cron_runs', {
    p_job: job, p_page: num(params.page, 1), p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const dispatchErrors: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_dispatch_errors', {
    p_from: str(params.from), p_to: str(params.to),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const dbHealth: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_db_health', {});
  if (error) throw new Error(error.message);
  return data;
};

export const authOverview: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_auth_overview', {
    p_from: str(params.from), p_to: str(params.to),
  });
  if (error) throw new Error(error.message);
  return data;
};

// ---------------------------------------------------------------------------
// Fase B: acao + Management API
// ---------------------------------------------------------------------------

type Lint = { name: string; title: string; level: string; categories?: string[]; detail?: string; remediation?: string };
type AdvGroup = { name: string; title: string; level: string; category: string; count: number; remediation: string; examples: string[] };

export function groupAdvisors(lints: Lint[]): { groups: AdvGroup[] } {
  const byName = new Map<string, AdvGroup>();
  for (const l of lints) {
    if (l.level === 'INFO') continue;
    const g: AdvGroup = byName.get(l.name) ?? {
      name: l.name, title: l.title, level: l.level,
      category: (l.categories ?? [])[0] ?? '', count: 0, remediation: l.remediation ?? '', examples: [],
    };
    g.count += 1;
    if (g.examples.length < 3 && l.detail) g.examples.push(l.detail);
    byName.set(l.name, g);
  }
  return { groups: [...byName.values()].sort((a, b) => b.count - a.count) };
}

function requireMgmt(): void {
  if (!mgmtConfigured() || !projectRef()) {
    throw new RbacError('internal', 'Management API nao configurada (SUPABASE_MGMT_TOKEN).');
  }
}

export const runJob: Handler = async (params, identity, ctx) => {
  const jobid = num(params.jobid, NaN);
  if (!Number.isFinite(jobid)) throw new RbacError('validation', 'jobid e obrigatorio.');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cron_run_now', {
    p_actor: identity.adminId, p_jobid: jobid, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const advisors: Handler = async () => {
  requireMgmt();
  const ref = projectRef();
  const out: Lint[] = [];
  for (const type of ['security', 'performance']) {
    const res = await mgmtFetch(`/v1/projects/${ref}/advisors/${type}`);
    if (!res.ok) throw new Error(`advisors/${type} -> ${res.status}`);
    const body = await res.json();
    for (const l of (body?.result?.lints ?? body?.lints ?? [])) out.push(l as Lint);
  }
  return groupAdvisors(out);
};

export const logsQuery: Handler = async (params) => {
  requireMgmt();
  const ref = projectRef();
  const source = ['function_edge_logs', 'auth', 'postgres_logs'].includes(str(params.source))
    ? str(params.source) : 'function_edge_logs';
  const hours = Math.min(24, Math.max(1, num(params.hours, 6)));
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const sql = `select id, timestamp, event_message from ${source} order by timestamp desc limit 100`;
  const qs = new URLSearchParams({
    sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString(),
  });
  const res = await mgmtFetch(`/v1/projects/${ref}/analytics/endpoints/logs.all?${qs.toString()}`);
  if (!res.ok) throw new Error(`logs.all -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const rows = (body?.result ?? body?.data ?? []) as Array<Record<string, unknown>>;
  return { source, hours, items: rows.slice(0, 100) };
};
