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

export const suspend: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const reason = typeof params.reason === 'string' ? params.reason : '';
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_suspend', {
    p_actor: identity.adminId, p_target: userId, p_reason: reason, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const reactivate: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_reactivate', {
    p_actor: identity.adminId, p_target: userId, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const setPlan: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const plan = typeof params.plan === 'string' ? params.plan : '';
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_set_plan', {
    p_actor: identity.adminId, p_target: userId, p_plan: plan, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const extendTrial: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const days = Number(params.days);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_extend_trial', {
    p_actor: identity.adminId, p_target: userId, p_days: Number.isFinite(days) ? days : 0, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const addNote: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const body = typeof params.body === 'string' ? params.body : '';
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_add_note', {
    p_actor: identity.adminId, p_target: userId, p_body: body, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const setTags: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const tags = Array.isArray(params.tags) ? (params.tags as unknown[]).map(String) : [];
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_set_tags', {
    p_actor: identity.adminId, p_target: userId, p_tags: tags, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
