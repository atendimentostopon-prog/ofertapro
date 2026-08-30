import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { clampPage } from './audit.ts';

Deno.test('clampPage normaliza', () => {
  assertEquals(clampPage({ page: 0, pageSize: 999 }), { page: 1, pageSize: 100, offset: 0 });
  assertEquals(clampPage({}), { page: 1, pageSize: 25, offset: 0 });
  assertEquals(clampPage({ page: 3, pageSize: 10 }), { page: 3, pageSize: 10, offset: 20 });
});
