import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveRange } from './dashboard.ts';

Deno.test('resolveRange 7d', () => {
  const { from, to } = resolveRange({ range: '7d' });
  assertEquals(to.getTime() - from.getTime() >= 6 * 864e5, true);
});

Deno.test('resolveRange custom exige from/to', () => {
  const { from, to } = resolveRange({ range: 'custom', from: '2026-08-01', to: '2026-08-10' });
  assertEquals(from.getUTCMonth(), 7);
  assertEquals(to.getUTCDate(), 10);
});

Deno.test('resolveRange default (sem range) = 7d', () => {
  const { from, to } = resolveRange({});
  assertEquals(to.getTime() - from.getTime() >= 6 * 864e5, true);
});
