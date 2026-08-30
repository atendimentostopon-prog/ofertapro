import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';

export function clampPage(p: { page?: unknown; pageSize?: unknown }): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(p.pageSize) || 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const list: Handler = async (params) => {
  const { page, pageSize, offset } = clampPage(params);
  const svc = serviceClient();
  let q = svc
    .from('admin_audit_log')
    .select('id, admin_id, admin_email, action, entity_type, entity_id, before, after, reason, ip, user_agent, request_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (typeof params.action === 'string') q = q.eq('action', params.action);
  if (typeof params.entityType === 'string') q = q.eq('entity_type', params.entityType);
  if (typeof params.adminId === 'string') q = q.eq('admin_id', params.adminId);
  if (typeof params.from === 'string') q = q.gte('created_at', params.from);
  if (typeof params.to === 'string') q = q.lte('created_at', params.to);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { items: data ?? [], page, pageSize, total: count ?? 0 };
};
