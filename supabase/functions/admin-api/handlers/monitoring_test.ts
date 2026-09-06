import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqStr } from './monitoring.ts';

Deno.test('reqStr devolve o valor', () => {
  assertEquals(reqStr({ job: ' expire_trials ' }, 'job'), 'expire_trials');
});
Deno.test('reqStr ausente lanca', () => {
  assertThrows(() => reqStr({}, 'job'));
  assertThrows(() => reqStr({ job: '' }, 'job'));
});
