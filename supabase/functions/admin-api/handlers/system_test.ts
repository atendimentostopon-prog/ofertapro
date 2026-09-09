import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseFlagValue, reqStr } from './system.ts';

Deno.test('reqStr devolve o valor', () => {
  assertEquals(reqStr({ key: ' signups_enabled ' }, 'key'), 'signups_enabled');
});
Deno.test('reqStr ausente lanca', () => {
  assertThrows(() => reqStr({}, 'key'));
  assertThrows(() => reqStr({ key: '' }, 'key'));
});
Deno.test('parseFlagValue: bool, json, string crua', () => {
  assertEquals(parseFlagValue('true'), true);
  assertEquals(parseFlagValue('false'), false);
  assertEquals(parseFlagValue('42'), 42);
  assertEquals(parseFlagValue('{"a":1}'), { a: 1 });
  assertEquals(parseFlagValue('nao e json'), 'nao e json');
});
