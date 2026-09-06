import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { groupAdvisors, reqStr } from './monitoring.ts';

Deno.test('reqStr devolve o valor', () => {
  assertEquals(reqStr({ job: ' expire_trials ' }, 'job'), 'expire_trials');
});
Deno.test('reqStr ausente lanca', () => {
  assertThrows(() => reqStr({}, 'job'));
  assertThrows(() => reqStr({ job: '' }, 'job'));
});

Deno.test('groupAdvisors filtra INFO e agrupa por name', () => {
  const out = groupAdvisors([
    { name: 'a', title: 'A', level: 'INFO', categories: ['PERFORMANCE'], detail: 'x', remediation: 'u' },
    { name: 'b', title: 'B', level: 'WARN', categories: ['SECURITY'], detail: 'y1', remediation: 'u' },
    { name: 'b', title: 'B', level: 'WARN', categories: ['SECURITY'], detail: 'y2', remediation: 'u' },
    { name: 'c', title: 'C', level: 'ERROR', categories: ['SECURITY'], detail: 'z', remediation: 'u' },
  ]);
  assertEquals(out.groups.length, 2);
  const b = out.groups.find((g) => g.name === 'b');
  assertEquals(b?.count, 2);
  assertEquals(b?.examples.length, 2);
});
