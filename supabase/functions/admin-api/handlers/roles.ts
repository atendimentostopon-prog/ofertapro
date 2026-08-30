import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

function reqString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

export const list: Handler = async () => {
  const svc = serviceClient();
  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    svc.from('admin_roles').select('key, label, description').order('key'),
    svc.from('admin_permissions').select('key, grp, description').order('grp'),
    svc.from('admin_role_permissions').select('role_key, permission_key'),
  ]);
  const permsByRole = new Map<string, string[]>();
  for (const row of rp ?? []) {
    const arr = permsByRole.get(row.role_key) ?? [];
    arr.push(row.permission_key);
    permsByRole.set(row.role_key, arr);
  }
  return {
    roles: (roles ?? []).map((r) => ({ ...r, permissions: permsByRole.get(r.key) ?? [] })),
    permissions: perms ?? [],
  };
};

export const assign: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const roleKey = reqString(params, 'roleKey');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_assign_role', {
    p_actor: identity.adminId, p_target: adminId, p_role_key: roleKey, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const revoke: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const roleKey = reqString(params, 'roleKey');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_revoke_role', {
    p_actor: identity.adminId, p_target: adminId, p_role_key: roleKey, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
