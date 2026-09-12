import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapPgError } from './_pg-errors.ts';

Deno.test('reconhece ADMIN_EXISTS via hint', () => {
  assertEquals(mapPgError({ hint: 'ADMIN_EXISTS', message: 'ja e admin' })?.code, 'conflict');
});
Deno.test('reconhece NOT_FOUND', () => {
  assertEquals(mapPgError({ hint: 'NOT_FOUND', message: 'x' })?.code, 'not_found');
});
Deno.test('reconhece LAST_SUPER_ADMIN', () => {
  assertEquals(mapPgError({ hint: 'LAST_SUPER_ADMIN', message: 'x' })?.code, 'conflict');
});
Deno.test('reconhece CANNOT_SUSPEND_SELF', () => {
  assertEquals(mapPgError({ hint: 'CANNOT_SUSPEND_SELF', message: 'x' })?.code, 'validation');
});
Deno.test('pg P0002 sem hint -> not_found', () => {
  assertEquals(mapPgError({ code: 'P0002', message: 'x' })?.code, 'not_found');
});
Deno.test('reconhece HAS_SUBSCRIPTION via hint', () => {
  assertEquals(mapPgError({ hint: 'HAS_SUBSCRIPTION', message: 'x' })?.code, 'conflict');
});
Deno.test('reconhece INVALID_PLAN via hint', () => {
  assertEquals(mapPgError({ hint: 'INVALID_PLAN', message: 'x' })?.code, 'validation');
});
Deno.test('desconhecido -> null', () => {
  assertEquals(mapPgError({ message: 'boom' }), null);
});
