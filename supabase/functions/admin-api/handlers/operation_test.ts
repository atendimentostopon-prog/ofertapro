import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqOfferId } from './operation.ts';

Deno.test('reqOfferId devolve o id', () => {
  assertEquals(reqOfferId({ offerId: ' o1 ' }), 'o1');
});
Deno.test('reqOfferId sem id lanca', () => {
  assertThrows(() => reqOfferId({}));
  assertThrows(() => reqOfferId({ offerId: '' }));
});
