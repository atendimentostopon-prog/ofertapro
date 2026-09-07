import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqUserId(params: Record<string, unknown>): string {
  const v = params.userId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'userId e obrigatorio.');
  return v.trim();
}
export function reqId(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const posture: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_security_posture', {});
  if (error) throw new Error(error.message);
  return data;
};

export const riskAccounts: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_risk_accounts', {});
  if (error) throw new Error(error.message);
  return data;
};

export const blocklistList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_blocklist_list', { p_search: str(params.search) });
  if (error) throw new Error(error.message);
  return data;
};

export const ban: Handler = async (params, identity, ctx) => {
  const target = reqUserId(params);
  const reason = str(params.reason);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_ban', {
    p_actor: identity.adminId, p_target: target, p_reason: reason, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const unban: Handler = async (params, identity, ctx) => {
  const target = reqUserId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_unban', {
    p_actor: identity.adminId, p_target: target, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const blocklistAdd: Handler = async (params, identity, ctx) => {
  const kind = str(params.kind);
  const value = str(params.value).trim();
  if (!value) throw new RbacError('validation', 'value e obrigatorio.');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_blocklist_add', {
    p_actor: identity.adminId, p_kind: kind, p_value: value,
    p_reason: str(params.reason), p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const blocklistRemove: Handler = async (params, identity, ctx) => {
  const id = reqId(params, 'blocklistId');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_blocklist_remove', {
    p_actor: identity.adminId, p_id: id, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
