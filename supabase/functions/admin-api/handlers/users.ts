import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqUserId(params: Record<string, unknown>): string {
  const v = params.userId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'userId e obrigatorio.');
  return v.trim();
}

export const list: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_users_list', {
    p_search: typeof params.search === 'string' ? params.search : '',
    p_page: Number(params.page) || 1,
    p_page_size: Number(params.pageSize) || 25,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const get: Handler = async (params) => {
  const userId = reqUserId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_detail', { p_target: userId });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Usuario nao encontrado.');
  return data;
};
