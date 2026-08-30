import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';
import { ROLE_KEYS } from '../_roles.ts';

function reqString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

export const list: Handler = async () => {
  const svc = serviceClient();
  const { data: accounts, error } = await svc
    .from('admin_accounts')
    .select('id, user_id, email, status, mfa_enrolled_at, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const { data: roleRows } = await svc.from('admin_user_roles').select('admin_id, role_key');
  const rolesByAdmin = new Map<string, string[]>();
  for (const r of roleRows ?? []) {
    const arr = rolesByAdmin.get(r.admin_id) ?? [];
    arr.push(r.role_key);
    rolesByAdmin.set(r.admin_id, arr);
  }

  const admins = (accounts ?? []).map((a) => ({
    id: a.id,
    email: a.email,
    status: a.status,
    roleKeys: rolesByAdmin.get(a.id) ?? [],
    mfaEnrolled: !!a.mfa_enrolled_at,
    lastSignInAt: null as string | null,
    createdAt: a.created_at,
  }));
  return { admins };
};

export const invite: Handler = async (params, identity, ctx) => {
  const email = reqString(params, 'email');
  const roleKeys = Array.isArray(params.roleKeys) ? (params.roleKeys as string[]) : [];
  for (const rk of roleKeys) {
    if (!ROLE_KEYS.includes(rk as (typeof ROLE_KEYS)[number])) {
      throw new RbacError('validation', `Cargo invalido: ${rk}`);
    }
  }
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_invite', {
    p_actor: identity.adminId,
    p_email: email,
    p_role_keys: roleKeys,
    p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const suspend: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const reason = typeof params.reason === 'string' ? params.reason : null;
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_suspend', {
    p_actor: identity.adminId, p_target: adminId, p_reason: reason, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const reactivate: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_reactivate', {
    p_actor: identity.adminId, p_target: adminId, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
