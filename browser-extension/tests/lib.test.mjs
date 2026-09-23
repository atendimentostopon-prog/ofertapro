import test from 'node:test';
import assert from 'node:assert/strict';
import { filterSessionCookies, cookieFingerprint, isLoggedIn, nickname, shouldSync, diagnose, HEARTBEAT_MS } from '../mercadolivre/lib.js';

const C = (name, value) => ({ name, value, domain: '.mercadolivre.com.br' });
const base = [C('ssid', 'a'), C('orgnickp', 'JOAO'), C('_gcl_au', 'trk'), C('_fbp', 'x'), C('ssid', 'a'), C('cp', '1')];

test('allowlist remove rastreadores e duplicatas, só name/value', () => {
  const r = filterSessionCookies(base);
  assert.deepEqual(r.map((c) => c.name), ['ssid', 'orgnickp', 'cp']);
  assert.deepEqual(Object.keys(r[0]), ['name', 'value']);
});
test('sem ssid não está logado', () => {
  assert.equal(isLoggedIn([C('cp', '1')]), false);
  assert.equal(isLoggedIn(base), true);
});
test('nickname', () => {
  assert.equal(nickname(base), 'JOAO');
  assert.equal(nickname([C('ssid', 'a')]), null);
});
test('fingerprint estável, independe de ordem e ignora rastreadores', () => {
  const f = cookieFingerprint(base);
  assert.equal(f, cookieFingerprint([...base].reverse()));
  assert.equal(f, cookieFingerprint([...base, C('_ga', 'zzz')]));
  assert.notEqual(f, cookieFingerprint([C('ssid', 'b'), C('orgnickp', 'JOAO'), C('cp', '1')]));
});
test('shouldSync', () => {
  const now = 10_000_000_000, fresh = now - 60_000;
  assert.equal(shouldSync({ now, lastSyncAt: fresh, lastFingerprint: 'x', newFingerprint: 'x', force: false }), false);
  assert.equal(shouldSync({ now, lastSyncAt: fresh, lastFingerprint: 'x', newFingerprint: 'x', force: true }), true);
  assert.equal(shouldSync({ now, lastSyncAt: fresh, lastFingerprint: 'x', newFingerprint: 'y' }), true);
  assert.equal(shouldSync({ now, lastSyncAt: now - HEARTBEAT_MS, lastFingerprint: 'x', newFingerprint: 'x' }), true);
  assert.equal(shouldSync({ now, lastSyncAt: new Date(fresh).toISOString(), lastFingerprint: 'x', newFingerprint: 'x' }), false);
  assert.equal(shouldSync({ now, lastSyncAt: null, lastFingerprint: 'x', newFingerprint: 'x' }), true);
});
const ok = { connected: true, updated_at: 't', tag: 'minhatag', health: null };
const byId = (items, id) => items.find((i) => i.id === id);
test('diagnose: tudo ok', () => {
  const items = diagnose({ loggedIn: true, nick: 'JOAO', connected: true, serverState: ok, localState: {} });
  assert.ok(items.every((i) => i.ok === true));
  assert.match(byId(items, 'tag').label, /minhatag/);
});
test('diagnose: sem login no ML', () => {
  const i = byId(diagnose({ loggedIn: false, nick: null, connected: true, serverState: ok, localState: {} }), 'ml_login');
  assert.equal(i.ok, false);
  assert.match(i.hint, /faça login/);
});
test('diagnose: sem etiqueta / chave inválida', () => {
  const items = diagnose({ loggedIn: true, connected: true, serverState: { ...ok, tag: null }, localState: {} });
  assert.equal(byId(items, 'tag').ok, false);
  assert.match(byId(items, 'tag').hint, /Configurações > Bot/);
  const bad = diagnose({ loggedIn: true, connected: false, serverState: null, localState: {} });
  assert.equal(byId(bad, 'aflyo').ok, false);
});
test('diagnose: ML recusou a sessão', () => {
  const now = Date.now();
  const at = new Date(now - 7 * 60000).toISOString();
  const items = diagnose({ loggedIn: true, connected: true, serverState: { ...ok, health: { status: 'invalid', code: 401, at } }, localState: {}, now });
  const s = byId(items, 'session');
  assert.equal(s.ok, false);
  assert.match(s.hint, /há 7 min/);
});

test('batimento do alarme (25 min após a última sync) nunca é pulado', () => {
  const now = 10_000_000_000;
  const lastSyncAt = now - (25 * 60 * 1000 - 3000); // sync terminou 3 s depois do disparo anterior
  assert.equal(shouldSync({ now, lastSyncAt, lastFingerprint: 'x', newFingerprint: 'x' }), true);
});
