import type { ErrorCode } from './_lib.ts';
import { serviceClient } from './_lib.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class RbacError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type AdminIdentity = {
  adminId: string;
  userId: string;
  email: string;
  roleKeys: string[];
  permissions: Set<string>;
};

export type RbacDeps = {
  getUser(jwt: string): Promise<{ userId: string; email: string; aal: string } | null>;
  loadAdmin(userId: string): Promise<{ adminId: string; status: string; roleKeys: string[]; permissions: string[] } | null>;
};

function decodeAal(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.aal === 'string' ? payload.aal : 'aal1';
  } catch {
    return 'aal1';
  }
}

export async function authorize(req: Request, deps: RbacDeps): Promise<AdminIdentity> {
  const header = req.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw new RbacError('unauthenticated', 'Cabecalho Authorization ausente.');
  }
  const jwt = header.slice('Bearer '.length);
  const user = await deps.getUser(jwt);
  if (!user) throw new RbacError('unauthenticated', 'Token invalido ou expirado.');
  if (user.aal !== 'aal2') throw new RbacError('forbidden', 'MFA obrigatorio para o painel.');

  const admin = await deps.loadAdmin(user.userId);
  if (!admin || admin.status !== 'active') {
    throw new RbacError('forbidden', 'Conta sem acesso administrativo.');
  }
  return {
    adminId: admin.adminId,
    userId: user.userId,
    email: user.email,
    roleKeys: admin.roleKeys,
    permissions: new Set(admin.permissions),
  };
}

export function requirePermission(identity: AdminIdentity, perm: string): void {
  if (identity.roleKeys.includes('SUPER_ADMIN')) return;
  if (!identity.permissions.has(perm)) {
    throw new RbacError('forbidden', `Permissao ausente: ${perm}`);
  }
}

export function makeSupabaseDeps(): RbacDeps {
  return {
    async getUser(jwt) {
      const client = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
      );
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id, email: data.user.email ?? '', aal: decodeAal(jwt) };
    },
    async loadAdmin(userId) {
      const svc = serviceClient();
      const { data: acc, error: accErr } = await svc
        .from('admin_accounts')
        .select('id, status')
        .eq('user_id', userId)
        .maybeSingle();
      if (accErr) throw new RbacError('internal', 'Falha ao carregar a conta administrativa.');
      if (!acc) return null;
      const { data: roles, error: rolesErr } = await svc
        .from('admin_user_roles')
        .select('role_key')
        .eq('admin_id', acc.id);
      if (rolesErr) throw new RbacError('internal', 'Falha ao carregar os cargos.');
      const roleKeys = (roles ?? []).map((r: { role_key: string }) => r.role_key);
      const { data: perms, error: permsErr } = await svc
        .from('admin_role_permissions')
        .select('permission_key')
        .in('role_key', roleKeys.length ? roleKeys : ['__none__']);
      if (permsErr) throw new RbacError('internal', 'Falha ao carregar as permissoes.');
      return {
        adminId: acc.id,
        status: acc.status,
        roleKeys,
        permissions: (perms ?? []).map((p: { permission_key: string }) => p.permission_key),
      };
    },
  };
}
