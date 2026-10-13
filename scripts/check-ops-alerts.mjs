import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const core = read('supabase/migrations/20261013000000_ops_events_and_emit.sql');
const sources = read('supabase/migrations/20261013000100_ops_business_sources.sql');
const handler = read('supabase/functions/notify/handler.ts');
const deliver = read('supabase/functions/_shared/ops/deliver.ts');
const emit = read('supabase/functions/_shared/ops/emit.ts');

const coreContracts = [
  /alter table public\.ops_events enable row level security/i,
  /revoke all on table public\.ops_events from anon, authenticated/i,
  /revoke all on function public\.ops_emit\([^)]*\) from public, anon, authenticated/i,
  /grant execute on function public\.ops_emit\([^)]*\) to service_role/i,
  /exception when others then[\s\S]*return null/i,
  /pg_advisory_xact_lock/i,
  /v_occ in \(5, 25, 100\)/i,
  /vault\.decrypted_secrets/i,
  /app_service_role_key/i,
  /functions\.supabase\.co\/notify/i,
];
for (const c of coreContracts) assert.match(core, c, `Contrato ausente na migration core: ${c}`);
assert.doesNotMatch(core, /alter database/i, 'a migration core nao pode usar alter database (permission denied no SQL Editor)');
assert.doesNotMatch(core, /current_setting\('app\./i, 'ops_emit nao pode ler app.* (producao usa Vault)');
assert.doesNotMatch(core, /create policy[^;]*ops_events/i, 'ops_events nao pode ter policy publica');
assert.doesNotMatch(core, /references\s+public\.profiles/i, 'ops_events.user_id nao pode ter FK para profiles');

const sourceContracts = [
  /after insert on auth\.users/i,
  /revoke all on function public\.ops_on_signup\(\)/i,
  /revoke all on function public\.ops_trial_expiring_scan\(\)/i,
  /'signup:' \|\| new\.id::text/i,
  /'trial_expiring:' \|\| r\.id::text/i,
];
for (const c of sourceContracts) assert.match(sources, c, `Contrato ausente na migration de fontes: ${c}`);

assert.match(handler, /timingSafeEqual/, 'notify precisa comparar a chave em tempo constante');
assert.match(handler, /!deps\.serviceKey/, 'notify nao pode autorizar com serviceKey vazia');
assert.match(deliver, /http_\$\{res\.status\}/, 'erros de entrega nao podem carregar corpo/URL');
assert.match(emit, /catch \(e\)/, 'emitOps precisa ser fail-open');

// Nenhum segredo de alerta pode aparecer no front ou no admin.
const SECRET_RE = /TELEGRAM_BOT_TOKEN|TELEGRAM_CHAT_ID|DISCORD_WEBHOOK_/;
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|jsx|mjs|html)$/.test(name)) out.push(p);
  }
  return out;
}
for (const root of ['src', 'admin/src']) {
  const dir = fileURLToPath(new URL(`../${root}`, import.meta.url));
  if (!existsSync(dir)) continue; // admin/src pode nao existir; qualquer outro erro DEVE falhar o check
  const files = walk(dir);
  for (const f of files) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), SECRET_RE, `Segredo de alerta referenciado no front: ${f}`);
  }
}

console.log('Ops alerts contract checks passed.');
