import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { assertNormalized, normalizeCaktoStatus, normalizeCaktoSubscription, reqId } from './integrations.ts';

Deno.test('reqId devolve o id', () => {
  assertEquals(reqId({ id: ' s1 ' }), 's1');
  assertEquals(reqId({ providerSubscriptionId: ' abc ' }, 'providerSubscriptionId'), 'abc');
});
Deno.test('reqId sem valor lanca', () => {
  assertThrows(() => reqId({}));
  assertThrows(() => reqId({ id: '' }));
});

Deno.test('normalizeCaktoStatus mapeia os enums da Cakto', () => {
  assertEquals(normalizeCaktoStatus('active'), 'active');
  assertEquals(normalizeCaktoStatus('trial'), 'active');
  assertEquals(normalizeCaktoStatus('paused'), 'past_due');
  assertEquals(normalizeCaktoStatus('inactive'), 'expired');
  assertEquals(normalizeCaktoStatus('canceled'), 'canceled');
  assertEquals(normalizeCaktoStatus('expired'), 'expired');
});
Deno.test('normalizeCaktoStatus desconhecido lanca', () => {
  assertThrows(() => normalizeCaktoStatus('sei_la'));
});
Deno.test('normalizeCaktoSubscription extrai os campos', () => {
  const n = normalizeCaktoSubscription({
    id: 'sub_1', status: 'active', amount: '47.90',
    next_payment_date: '2026-10-01T00:00:00-03:00',
    canceledAt: null, createdAt: '2026-09-01T00:00:00-03:00',
    customer: { email: 'C@x.com' }, offer: { id: '38r43o4' },
  });
  assertEquals(n.provider_subscription_id, 'sub_1');
  assertEquals(n.status, 'active');
  assertEquals(n.customer_email, 'c@x.com');
  assertEquals(n.plan_code, 'pro');
  assertEquals(n.billing_cycle, 'monthly');
  assertEquals(n.amount, 47.9);
  assertEquals(n.current_period_end, '2026-10-01T00:00:00-03:00');
});

Deno.test('assertNormalized aceita shape valido', () => {
  const x = assertNormalized({ status: 'active', current_period_end: '2026-10-01', cancel_at_period_end: false, plan_code: 'pro', amount: 47.9 });
  assertEquals(x.status, 'active');
  assertEquals(x.plan_code, 'pro');
});
Deno.test('assertNormalized rejeita status fora do enum', () => {
  assertThrows(() => assertNormalized({ status: 'weird', cancel_at_period_end: false, amount: 0 }));
});
Deno.test('assertNormalized rejeita nao-objeto', () => {
  assertThrows(() => assertNormalized(null));
  assertThrows(() => assertNormalized('x'));
});
