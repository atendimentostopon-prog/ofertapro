import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

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
