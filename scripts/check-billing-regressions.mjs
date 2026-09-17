import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { DatabaseSync } from 'node:sqlite';

// Executa os handlers reais com as dependencias externas substituidas.
async function load(file, dependencies) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/gm, '');
  const { outputText } = ts.transpileModule(dependencies + '\n' + source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return import('data:text/javascript;base64,' + Buffer.from(outputText + '\n//# sourceURL=' + file).toString('base64'));
}

function database({ existing = null, fail = '' } = {}) {
  const writes = [];
  return {
    writes,
    from(table) {
      let operation = 'select', patch;
      const query = {
        select() { return query; }, eq() { return query; },
        order() { return query; }, limit() { return query; },
        update(value) { operation = 'update'; patch = value; return query; },
        insert(value) { operation = 'insert'; patch = value; return query; },
        upsert(value) { operation = 'upsert'; patch = value; return query; },
        maybeSingle() { return query; },
        then(resolve, reject) {
          const error = fail === `${table}:${operation}` ? { message: 'simulated failure' } : null;
          if (operation !== 'select') writes.push({ table, operation, patch });
          const data = table === 'profiles' ? { id: 'user1' } : existing;
          return Promise.resolve({ data, error }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}

const handlers = await load('supabase/functions/cakto-webhook/handlers.ts', `
const getSupabaseAdmin = () => globalThis.billingDb;
const mapCaktoOfferId = () => null;
const sendBillingEmail = async () => {};
const planLabel = x => x;
const planAmount = () => 0;
`);
const existing = {
  id: 'old', user_id: 'user1', provider_subscription_id: 'old-provider',
  status: 'expired', plan_code: 'starter', billing_cycle: 'monthly',
  cancel_at_period_end: true, paid_payments_quantity: 1,
};
const created = {
  id: 'new-provider', amount: 100, next_payment_date: '2030-10-17T00:00:00Z',
  metadata: { supabase_user_id: 'user1', plan_code: 'pro', billing_cycle: 'yearly' },
};

for (const handler of [handlers.subscriptionCanceled, handlers.subscriptionRenewalRefused]) {
  globalThis.billingDb = database({ existing, fail: 'subscriptions:update' });
  await assert.rejects(handler({ subscription: { id: 'old-provider' } }), /simulated failure/);
}

globalThis.billingDb = database({ existing: { ...existing, status: 'active' } });
await handlers.subscriptionCanceled({ subscription: { id: 'old-provider' } });
assert.equal(billingDb.writes[0].patch.cancel_at_period_end, true);
assert.equal(billingDb.writes[0].patch.status, undefined);
assert(!billingDb.writes.some(w => w.table === 'profiles' || w.table === 'bot_configs'));

globalThis.billingDb = database({ existing });
await handlers.subscriptionRenewalRefused({ subscription: { id: 'old-provider' } });
assert.equal(billingDb.writes[0].patch.status, 'past_due');
assert(Date.parse(billingDb.writes[0].patch.grace_period_ends_at) > Date.now());
assert(!billingDb.writes.some(w => w.table === 'profiles' || w.table === 'bot_configs'));

globalThis.billingHandlers = handlers.HANDLERS;
await load('supabase/functions/cakto-webhook/index.ts', `
const serve = handler => { globalThis.webhookHandler = handler; };
const validateSecret = () => true;
const recordEventIfNew = async () => true;
const getEventId = payload => payload.event + ':' + payload.data.id;
const deleteEventRecord = async id => { globalThis.deletedEvent = id; };
const HANDLERS = globalThis.billingHandlers;
`);
for (const event of ['subscription_canceled', 'subscription_renewal_refused']) {
  globalThis.billingDb = database({ existing, fail: 'subscriptions:update' });
  globalThis.deletedEvent = null;
  const response = await webhookHandler(new Request('http://localhost/webhook', {
    method: 'POST', body: JSON.stringify({ event, data: { id: 'old-provider' } }),
  }));
  assert.equal(response.status, 500);
  assert.equal(deletedEvent, event + ':old-provider');
}

for (const fail of ['subscriptions:select', 'subscriptions:update']) {
  globalThis.billingDb = database({ existing, fail });
  await assert.rejects(handlers.subscriptionRenewed({ subscription: { id: 'old-provider' } }), /simulated failure/);
  assert(!billingDb.writes.some(w => w.table === 'profiles'));
}
globalThis.billingDb = database();
await assert.rejects(handlers.subscriptionRenewed({ subscription: { id: 'missing' } }), /nao encontrada/);

globalThis.billingDb = database({ existing });
await handlers.subscriptionCreated(created);
const refreshed = billingDb.writes.find(w => w.table === 'subscriptions').patch;
assert.equal(refreshed.provider_subscription_id, 'new-provider');
assert.equal(refreshed.plan_code, 'pro');
assert.equal(refreshed.billing_cycle, 'yearly');
assert.equal(refreshed.current_period_end, created.next_payment_date);
assert.equal(refreshed.cancel_at_period_end, false);
assert.equal(refreshed.canceled_at, null);
assert.equal(refreshed.grace_period_ends_at, null);
assert(billingDb.writes.some(w => w.table === 'profiles' && w.patch.account_status === 'active'));
assert(billingDb.writes.some(w => w.table === 'bot_configs' && w.patch.status === 'active'));

globalThis.billingDb = database({ existing });
await handlers.purchaseApproved(created);
assert.equal(billingDb.writes[0].patch.provider_subscription_id, 'new-provider');
assert.equal(billingDb.writes[0].patch.cancel_at_period_end, false);

globalThis.billingDb = database({ existing });
await assert.rejects(handlers.subscriptionCreated({ id: 'new', metadata: { supabase_user_id: 'user1' } }), /indefinidos/);
assert.equal(billingDb.writes.length, 0);

const paid = {
  ...existing, status: 'active', cancel_at_period_end: false,
  amount: 99, installments: 3, current_period_start: '2030-09-17T00:00:00Z',
  current_period_end: '2030-10-17T00:00:00Z', provider_customer_id: 'buyer@example.com',
};
globalThis.billingDb = database({ existing: paid });
await handlers.subscriptionCreated({ id: 'new-provider', metadata: { supabase_user_id: 'user1' } });
for (const field of ['amount', 'installments', 'current_period_start', 'current_period_end', 'provider_customer_id']) {
  assert.equal(billingDb.writes[0].patch[field], paid[field], `partial creation preserves ${field}`);
}

globalThis.billingDb = database({ existing });
await handlers.subscriptionRenewed({ subscription: { id: 'old-provider', next_payment_date: created.next_payment_date } });
assert.equal(billingDb.writes[0].patch.paid_payments_quantity, 2);
assert.equal(billingDb.writes[0].patch.current_period_end, created.next_payment_date);

await load('supabase/functions/cakto-cancel-subscription/index.ts', `
const serve = handler => { globalThis.cancelHandler = handler; };
const Deno = { env: { get: () => '' } };
const createClient = () => ({
  auth: { getUser: async () => ({ data: { user: { id: 'user1' } } }) },
  from: (...args) => globalThis.billingDb.from(...args),
});
const getSupabaseAdmin = () => globalThis.billingDb;
const caktoFetch = async () => {
  globalThis.providerCalls++;
  return new Response(null, { status: globalThis.providerStatus });
};
`);
const request = () => new Request('http://localhost/cancel', {
  method: 'POST', body: JSON.stringify({ subscription_id: 'provider' }),
});
for (const status of [400, 404, 500, 204]) {
  globalThis.billingDb = database({ existing: { user_id: 'user1', cancel_at_period_end: false } });
  globalThis.providerStatus = status;
  globalThis.providerCalls = 0;
  const response = await cancelHandler(request());
  assert.equal(response.status, status === 204 ? 200 : 502);
  assert.equal(billingDb.writes.length, status === 204 ? 1 : 0);
}
globalThis.billingDb = database({ existing: { user_id: 'user1', cancel_at_period_end: true } });
globalThis.providerCalls = 0;
assert.equal((await cancelHandler(request())).status, 200);
assert.equal(providerCalls, 0);

globalThis.billingDb = database({ existing: { user_id: 'user1' }, fail: 'subscriptions:update' });
globalThis.providerStatus = 204;
assert.equal((await cancelHandler(request())).status, 500);

console.log('Billing regression checks passed (renewal, resubscription, cancellation).');

// Exercita o SQL real do cron em SQLite em memoria. Nao substitui aplicar a
// migration em PostgreSQL, mas verifica os filtros com varias assinaturas.
const migration = fs.readFileSync('supabase/migrations/20260917000000_fix_subscription_expiration.sql', 'utf8');
const cronSql = migration.split('$SUBCRON$')[1].replaceAll('public.', '');
const sql = new DatabaseSync(':memory:');
sql.function('now', () => '2030-09-17T00:00:00Z');
sql.exec(`
  CREATE TABLE profiles (id TEXT, plan TEXT, account_status TEXT, trial_ends_at TEXT);
  CREATE TABLE subscriptions (
    user_id TEXT, status TEXT, cancel_at_period_end INTEGER,
    current_period_end TEXT, grace_period_ends_at TEXT
  );
`);
const past = '2030-09-16T00:00:00Z', future = '2030-10-17T00:00:00Z';
const cases = [
  { name: 'old expired plus active', rows: [['expired', 1, past, null], ['active', 0, future, null]], keep: true },
  { name: 'old expired plus paid cancellation period', rows: [['expired', 1, past, null], ['active', 1, future, null]], keep: true },
  { name: 'old expired plus grace period', rows: [['expired', 1, past, null], ['past_due', 0, past, future]], keep: true },
  { name: 'canceled period ended', rows: [['active', 1, past, null]], keep: false },
  { name: 'grace ended', rows: [['past_due', 0, past, past]], keep: false },
  { name: 'trial remains valid', rows: [['expired', 1, past, null]], trial: true, keep: true },
  { name: 'no subscriptions', rows: [], keep: true },
];
for (const scenario of cases) {
  sql.prepare('INSERT INTO profiles VALUES (?, ?, ?, ?)').run(scenario.name, 'pro', scenario.trial ? 'trialing' : 'active', scenario.trial ? future : null);
  for (const row of scenario.rows) sql.prepare('INSERT INTO subscriptions VALUES (?, ?, ?, ?, ?)').run(scenario.name, ...row);
}
for (let run = 0; run < 2; run++) {
  sql.exec(cronSql);
  for (const scenario of cases) {
    const profile = sql.prepare('SELECT * FROM profiles WHERE id = ?').get(scenario.name);
    assert.equal(profile.plan, scenario.keep ? 'pro' : 'free', scenario.name);
    assert.equal(profile.account_status, scenario.keep ? (scenario.trial ? 'trialing' : 'active') : 'canceled', scenario.name);
  }
}
sql.close();
console.log('Expiration SQL regression checks passed (7 scenarios, two cron runs).');
