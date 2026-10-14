import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const core = read('supabase/migrations/20261013000000_ops_events_and_emit.sql');
const sources = read('supabase/migrations/20261013000100_ops_business_sources.sql');
const rich = read('supabase/migrations/20261013000200_ops_rich_messages.sql');
const health = read('supabase/migrations/20261014000000_ops_phase2_health.sql');
const handler = read('supabase/functions/notify/handler.ts');
const deliver = read('supabase/functions/_shared/ops/deliver.ts');
const emit = read('supabase/functions/_shared/ops/emit.ts');
const sanitize = read('supabase/functions/_shared/ops/sanitize.ts');
const format = read('supabase/functions/_shared/ops/format.ts');

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

const richContracts = [
  /after update of email_confirmed_at on auth\.users/i,
  /when\s*\(\s*old\.email_confirmed_at\s+is\s+null\s+and\s+new\.email_confirmed_at\s+is\s+not\s+null\s*\)/i,
  /revoke all on function public\.ops_sales_today/i,
  /grant execute on function public\.ops_sales_today\(\) to service_role/i,
  /exception when others/i,
  /'email_confirmed:'/,
];
for (const c of richContracts) assert.match(rich, c, `Contrato ausente na migration de mensagens ricas: ${c}`);

const healthContracts = [
  /create or replace function public\.ops_health\(\)/i,
  /grant execute on function public\.ops_health\(\) to anon/i,
  /revoke all on function public\.ops_healthcheck\(\)/i,
  /revoke all on function public\.ops_retry_undelivered\(\)/i,
  /revoke all on function public\.ops_on_account_status_change\(\)/i,
  /trg_ops_account_status/,
  /'acct:'/,
  /cron\.schedule\('ops_healthcheck', '2-59\/5 \* \* \* \*'/,
  /'cron_timeouts:'/,
  /backend_type = 'client backend'/,
  /for update skip locked/i,
  /old\.account_status is distinct from new\.account_status/i,
];
for (const c of healthContracts) assert.match(health, c, `Contrato ausente na migration de saude: ${c}`);
assert.doesNotMatch(health, /'\*\/5 \* \* \* \*'/, 'healthcheck nao pode rodar no minuto cheio (usar 2-59/5)');
assert.doesNotMatch(health, /alter database/i, 'a migration de saude nao pode usar alter database');

// withAlerts: aplicado nas 14 functions previstas e ausente nas excluidas.
const withAlertsFns = [
  'public-api', 'enrich-product', 'evolution-webhook', 'evolution-groups-select',
  'evolution-groups-sync', 'evolution-instance-create', 'evolution-instance-delete',
  'evolution-instance-status', 'api-key-generate', 'api-key-reveal', 'api-key-revoke',
  'cakto-create-payment', 'cakto-cancel-subscription', 'cleanup-storage',
];
for (const fn of withAlertsFns) {
  assert.ok(
    read(`supabase/functions/${fn}/index.ts`).includes(`withAlerts("${fn}"`),
    `function ${fn} precisa usar withAlerts("${fn}"`,
  );
}
for (const fn of ['admin-api', 'send-email', 'email-hook', 'notify']) {
  assert.ok(
    !read(`supabase/functions/${fn}/index.ts`).includes('withAlerts('),
    `function ${fn} nao pode usar withAlerts(`,
  );
}
assert.doesNotMatch(health, /current_setting\('app\./i, 'a migration de saude nao pode ler app.* (producao usa Vault)');

assert.match(handler, /timingSafeEqual/, 'notify precisa comparar a chave em tempo constante');
assert.match(handler, /!deps\.serviceKey/, 'notify nao pode autorizar com serviceKey vazia');
assert.match(deliver, /http_\$\{res\.status\}/, 'erros de entrega nao podem carregar corpo/URL');
assert.match(emit, /catch \(e\)/, 'emitOps precisa ser fail-open');
assert.match(sanitize, /export function cleanString\(s: string, opts\?: SanitizeOptions\)/, 'sanitize precisa exportar cleanString(s, opts)');
assert.match(sanitize, /keepEmails\?: boolean/, 'SanitizeOptions precisa declarar keepEmails');
assert.match(sanitize, /opts\?\.keepEmails \? redacted : maskEmail\(redacted\)/, 'keepEmails so pode pular o mascaramento de e-mail');
assert.match(sanitize, /export function sanitizeDetail\(value: unknown, depth = 0, opts\?: SanitizeOptions\)/, 'sanitizeDetail precisa aceitar opts (keepEmails)');
assert.match(sanitize, /SECRET_KEY_RE\.test\(k\)/, 'redacao por nome de chave nao pode depender de keepEmails');
assert.ok(format.includes(String.raw`/^https:\/\/admin\.aflyo\.com\.br\/[^\s"'<>]*$/`), 'format so pode linkificar o prefixo https://admin.aflyo.com.br/');
assert.equal((format.match(/<a href=/g) ?? []).length, 1, 'format so pode gerar um link <a href>, o do painel validado');
assert.match(format, /keepEmails: true/, 'render precisa sanitizar com keepEmails');

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
