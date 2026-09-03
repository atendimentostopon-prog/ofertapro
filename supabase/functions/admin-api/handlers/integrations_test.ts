import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqId } from './integrations.ts';

Deno.test('reqId devolve o id', () => {
  assertEquals(reqId({ id: ' s1 ' }), 's1');
  assertEquals(reqId({ providerSubscriptionId: ' abc ' }, 'providerSubscriptionId'), 'abc');
});
Deno.test('reqId sem valor lanca', () => {
  assertThrows(() => reqId({}));
  assertThrows(() => reqId({ id: '' }));
});
