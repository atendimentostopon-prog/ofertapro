import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/subscription.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { hasSubscriptionAccess, resolveAccountPlan } = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const subscription = {
  plan_code: 'pro', status: 'active', cancel_at_period_end: false,
  current_period_end: '2030-10-18T00:00:00Z', grace_period_ends_at: '2030-10-21T00:00:00Z',
};
const now = Date.parse('2030-10-19T00:00:00Z');
assert.equal(hasSubscriptionAccess(null, now), false);
assert.equal(hasSubscriptionAccess(subscription, now), true, 'normal active renewal preserves server-authorized access');
assert.equal(hasSubscriptionAccess({ ...subscription, cancel_at_period_end: true }, now), false, 'cancellation period ended');
assert.equal(hasSubscriptionAccess({ ...subscription, cancel_at_period_end: true }, now - 2 * 86400000), true, 'paid cancellation period remains available');
assert.equal(hasSubscriptionAccess({ ...subscription, status: 'past_due' }, now), true, 'payment grace period');
assert.equal(hasSubscriptionAccess({ ...subscription, status: 'past_due' }, now + 4 * 86400000), false, 'grace period ended');
assert.equal(hasSubscriptionAccess({ ...subscription, status: 'expired' }, now), false);
assert.deepEqual(resolveAccountPlan({ plan: 'starter', account_status: 'trialing' }, subscription), { plan: 'pro', accountStatus: 'active' }, 'upgrade replaces a previously paid plan as well as free');
assert.deepEqual(resolveAccountPlan({ plan: 'enterprise', account_status: 'active' }, { ...subscription, plan_code: 'starter' }), { plan: 'starter', accountStatus: 'active' }, 'downgrade is reflected');
assert.deepEqual(resolveAccountPlan({ plan: 'starter', account_status: 'trialing' }, null), { plan: 'starter', accountStatus: 'trialing' }, 'trial remains a trial');
assert.deepEqual(resolveAccountPlan({ plan: 'free', account_status: 'expired' }, null), { plan: 'free', accountStatus: 'expired' }, 'expired account is never promoted to a fabricated plan');
console.log('Account state: 11 regression scenarios passed.');
