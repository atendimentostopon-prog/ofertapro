import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqStr(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

// Converte o valor do input do front pra jsonb: 'true'/'false' -> bool,
// senao tenta JSON.parse, senao string crua.
export function parseFlagValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  try { return JSON.parse(t); } catch { return raw; }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const planLimits: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_plan_limits_list', {});
  if (error) throw new Error(error.message);
  return data;
};

export const flags: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_system_flags_list', {});
  if (error) throw new Error(error.message);
  return data;
};

export const announcements: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_announcements_list', {});
  if (error) throw new Error(error.message);
  return data;
};

export const activeAnnouncement: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_active_announcement', {});
  if (error) throw new Error(error.message);
  return data ?? null;
};

export const planLimitsUpdate: Handler = async (params, identity, ctx) => {
  const plan = reqStr(params, 'plan');
  const patch = params.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new RbacError('validation', 'patch deve ser um objeto.');
  }
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_plan_limits_update', {
    p_actor: identity.adminId, p_plan: plan, p_patch: patch, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const flagSet: Handler = async (params, identity, ctx) => {
  const key = reqStr(params, 'key');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_system_flag_set', {
    p_actor: identity.adminId, p_key: key,
    p_value: parseFlagValue(params.value),
    p_description: typeof params.description === 'string' ? params.description : null,
    p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const flagDelete: Handler = async (params, identity, ctx) => {
  const key = reqStr(params, 'key');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_system_flag_delete', {
    p_actor: identity.adminId, p_key: key, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const announcementUpsert: Handler = async (params, identity, ctx) => {
  const message = reqStr(params, 'message');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_announcement_upsert', {
    p_actor: identity.adminId,
    p_id: typeof params.id === 'string' && params.id ? params.id : null,
    p_message: message,
    p_level: typeof params.level === 'string' ? params.level : 'info',
    p_active: params.active === true,
    p_starts_at: str(params.startsAt),
    p_ends_at: str(params.endsAt),
    p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const announcementDelete: Handler = async (params, identity, ctx) => {
  const id = reqStr(params, 'id');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_announcement_delete', {
    p_actor: identity.adminId, p_id: id, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
