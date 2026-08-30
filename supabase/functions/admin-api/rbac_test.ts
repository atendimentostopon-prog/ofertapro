import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { authorize, requirePermission, RbacError, type RbacDeps } from './rbac.ts';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://admin-api.test', { method: 'POST', headers });
}

const okDeps = (over: Partial<RbacDeps> = {}): RbacDeps => ({
  getUser: async () => ({ userId: 'u1', email: 'a@b.c', aal: 'aal2' }),
  loadAdmin: async () => ({ adminId: 'ad1', status: 'active', roleKeys: ['DEVELOPER'], permissions: ['dashboard.read', 'jobs.retry'] }),
  ...over,
});

Deno.test('sem Authorization -> unauthenticated', async () => {
  const e = await assertRejects(() => authorize(req(), okDeps()), RbacError);
  assertEquals((e as RbacError).code, 'unauthenticated');
});

Deno.test('JWT invalido -> unauthenticated', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ getUser: async () => null })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'unauthenticated');
});

Deno.test('sem AAL2 -> forbidden', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ getUser: async () => ({ userId: 'u1', email: 'a@b.c', aal: 'aal1' }) })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('nao e admin -> forbidden', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ loadAdmin: async () => null })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('admin suspenso -> forbidden', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ loadAdmin: async () => ({ adminId: 'ad1', status: 'suspended', roleKeys: [], permissions: [] }) })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('admin ativo com AAL2 -> identidade', async () => {
  const id = await authorize(req({ Authorization: 'Bearer x' }), okDeps());
  assertEquals(id.adminId, 'ad1');
  assertEquals(id.permissions.has('dashboard.read'), true);
});

Deno.test('requirePermission nega quando falta', () => {
  const id = { adminId: 'ad1', userId: 'u1', email: 'a@b.c', roleKeys: ['DEVELOPER'], permissions: new Set(['dashboard.read']) };
  const e = (() => { try { requirePermission(id, 'users.suspend'); } catch (x) { return x; } })();
  assertEquals(e instanceof RbacError, true);
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('SUPER_ADMIN passa em qualquer permissao', () => {
  const id = { adminId: 'ad1', userId: 'u1', email: 'a@b.c', roleKeys: ['SUPER_ADMIN'], permissions: new Set<string>() };
  requirePermission(id, 'anything.at.all'); // nao lanca
});
