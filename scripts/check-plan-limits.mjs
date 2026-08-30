// Compara PLAN_CONFIGS (src/config/plans.ts) com o seed da migration
// plan_limits. Roda sem dependência: parse por regex dos dois arquivos.
// Uso: npm run check:plan-limits  (exit 1 se divergir)
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const plansTs = readFileSync(join(root, 'src/config/plans.ts'), 'utf8');
const migration = readFileSync(
  join(root, 'supabase/migrations/20260831000000_plan_limits_table.sql'),
  'utf8',
);

// front campo -> banco coluna. maxTelegramConnections é só front (sem trigger).
const MAP = {
  maxSourceGroups: 'max_source_groups',
  maxWhatsappConnections: 'max_whatsapp_instances',
  maxWhatsappGroups: 'max_whatsapp_dest_groups',
  maxTelegramGroups: 'max_telegram_dest_groups',
  allowShortener: 'allow_shortener',
  advancedAnalytics: 'allow_analytics',
  futureScheduling: 'allow_scheduling',
  removeBranding: 'remove_branding',
};
const PLANS = ['free', 'starter', 'pro', 'enterprise'];

// --- front: extrai cada bloco `plan: { ... }` de PLAN_CONFIGS ---
function parseFront() {
  const out = {};
  for (const plan of PLANS) {
    const re = new RegExp(`\\b${plan}:\\s*{([\\s\\S]*?)}\\s*,`, 'm');
    const body = (plansTs.match(re) || [])[1];
    if (!body) { out[plan] = null; continue; }
    const fields = {};
    for (const key of Object.keys(MAP)) {
      const m = body.match(new RegExp(`${key}:\\s*(Infinity|true|false|\\d+)`));
      if (m) fields[key] = m[1];
    }
    out[plan] = fields;
  }
  return out;
}

// --- banco: extrai as linhas do bloco VALUES do INSERT INTO plan_limits ---
// (só o trecho entre VALUES e ON CONFLICT, pra não casar o CHECK (plan IN (...)))
function parseDb() {
  const cols = [
    'plan', 'max_source_groups', 'max_whatsapp_instances', 'max_whatsapp_dest_groups',
    'max_telegram_dest_groups', 'allow_shortener', 'allow_analytics',
    'allow_scheduling', 'remove_branding',
  ];
  const out = {};
  const valuesBlock = (migration.match(/VALUES([\s\S]*?)ON CONFLICT/) || [])[1] || '';
  const rowRe = /\(\s*'(free|starter|pro|enterprise)'\s*,([^)]*)\)/g;
  let m;
  while ((m = rowRe.exec(valuesBlock))) {
    const vals = [m[1], ...m[2].split(',').map((s) => s.trim())];
    const row = {};
    cols.forEach((c, i) => (row[c] = vals[i]));
    out[m[1]] = row;
  }
  return out;
}

const front = parseFront();
const db = parseDb();
const problems = [];

for (const plan of PLANS) {
  if (!front[plan]) { problems.push(`front: bloco ${plan} não encontrado em PLAN_CONFIGS`); continue; }
  if (!db[plan]) { problems.push(`banco: linha ${plan} não encontrada no seed`); continue; }
  for (const [frontKey, dbCol] of Object.entries(MAP)) {
    const fv = front[plan][frontKey];
    const dv = db[plan][dbCol];
    if (fv === undefined) { problems.push(`front ${plan}.${frontKey}: ausente`); continue; }
    const norm = (v) => (v === 'Infinity' ? 'Infinity' : v === 'true' ? 'true' : v === 'false' ? 'false' : String(Number(v)));
    if (norm(fv) !== norm(dv)) {
      problems.push(`${plan}.${frontKey} (front=${fv}) != ${dbCol} (banco=${dv})`);
    }
  }
}

if (problems.length) {
  console.error('check:plan-limits -- divergências entre plans.ts e a migration plan_limits:\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nAlinhe os dois lados (edite PLAN_CONFIGS ou crie uma migration de UPDATE).');
  process.exit(1);
}
console.log('check:plan-limits -- OK (front e banco batem).');
