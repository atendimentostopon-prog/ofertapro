import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqUserId } from './users.ts';

Deno.test('reqUserId devolve o id', () => {
  assertEquals(reqUserId({ userId: ' abc ' }), 'abc');
});
Deno.test('reqUserId sem id lanca', () => {
  assertThrows(() => reqUserId({}));
  assertThrows(() => reqUserId({ userId: '' }));
});
