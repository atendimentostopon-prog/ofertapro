import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqId, reqUserId } from './security.ts';

Deno.test('reqUserId devolve o id', () => {
  assertEquals(reqUserId({ userId: ' u1 ' }), 'u1');
});
Deno.test('reqUserId ausente lanca', () => {
  assertThrows(() => reqUserId({}));
});
Deno.test('reqId por chave', () => {
  assertEquals(reqId({ blocklistId: ' b1 ' }, 'blocklistId'), 'b1');
  assertThrows(() => reqId({}, 'blocklistId'));
});
