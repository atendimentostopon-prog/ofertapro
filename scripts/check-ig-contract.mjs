// scripts/check-ig-contract.mjs
// Contrato do módulo de Instagram: espelho de limites, RLS nas tabelas,
// ausência de segredos em VITE_* e paridade das variáveis de template.
// Uso: npm run check:ig-contract  (exit 1 se divergir)
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
// Leitura tolerante: arquivo ausente vira problema (nao stack trace de ENOENT).
const read = (p) => {
  if (!existsSync(join(root, p))) {
    problems.push(`${p}: arquivo nao existe`);
    return '';
  }
  return readFileSync(join(root, p), 'utf8');
};

const PLANS = ['free', 'starter', 'pro', 'enterprise'];
const MIGRATION = 'supabase/migrations/20261013120000_instagram_core.sql';
const plansTs = read('src/config/plans.ts');
const migration = read(MIGRATION);

// 1) Espelho de limites ------------------------------------------------
const MAP = {
  allowInstagram: 'allow_instagram',
  maxIgAccounts: 'max_ig_accounts',
  maxIgAutomations: 'max_ig_automations',
  maxIgDmsMonth: 'max_ig_dms_month',
};
const UNLIMITED_DB = 9999; // no banco "ilimitado" = 9999; no front = Infinity

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

function parseDb() {
  const out = {};
  const block = (migration.match(/INSERT INTO public\.plan_limits[\s\S]*?VALUES([\s\S]*?)ON CONFLICT/) || [])[1] || '';
  const rowRe = /\(\s*'(free|starter|pro|enterprise)'\s*,([^)]*)\)/g;
  let m;
  while ((m = rowRe.exec(block))) {
    const [allow, accounts, automations, dms] = m[2].split(',').map((s) => s.trim());
    out[m[1]] = {
      allow_instagram: allow,
      max_ig_accounts: accounts,
      max_ig_automations: automations,
      max_ig_dms_month: dms,
    };
  }
  return out;
}

const norm = (v) => {
  if (v === 'true' || v === 'false') return v;
  if (v === 'Infinity') return 'Infinity';
  return Number(v) >= UNLIMITED_DB ? 'Infinity' : String(Number(v));
};

const front = parseFront();
const db = parseDb();
for (const plan of PLANS) {
  if (!front[plan]) { problems.push(`front: bloco ${plan} nao encontrado em PLAN_CONFIGS`); continue; }
  if (!db[plan]) { problems.push(`banco: linha ${plan} nao encontrada no seed de ${MIGRATION}`); continue; }
  for (const [fk, dc] of Object.entries(MAP)) {
    const fv = front[plan][fk];
    if (fv === undefined) { problems.push(`front ${plan}.${fk}: ausente`); continue; }
    if (norm(fv) !== norm(db[plan][dc])) {
      problems.push(`${plan}.${fk} (front=${fv}) != ${dc} (banco=${db[plan][dc]})`);
    }
  }
}

// 2) RLS em toda tabela ig_* --------------------------------------------
const created = [...migration.matchAll(/CREATE TABLE IF NOT EXISTS public\.(ig_\w+)/g)].map((m) => m[1]);
for (const t of created) {
  if (!new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`, 'i').test(migration)) {
    problems.push(`${t}: sem ENABLE ROW LEVEL SECURITY na migration`);
  }
}
if (created.length < 6) problems.push(`esperadas 6 tabelas ig_*, achei ${created.length}`);

// 3) Nenhum segredo em VITE_* -------------------------------------------
const scan = [];
function walk(dir) {
  for (const e of readdirSync(join(root, dir), { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|mjs|env\.example)$/.test(e.name)) scan.push(p);
  }
}
walk('src');
if (existsSync(join(root, '.env.example'))) scan.push('.env.example');
for (const f of scan) {
  const c = read(f);
  if (/VITE_IG_(APP_SECRET|ACCESS_TOKEN|STATE_SECRET|WEBHOOK)/.test(c)) {
    problems.push(`${f}: segredo do Instagram exposto via VITE_*`);
  }
}

// 4) Paridade das variaveis de template (server x client) -----------------
const serverTpl = read('supabase/functions/_shared/instagram/template.ts');
const clientTpl = read('src/lib/instagram.ts');
const VAR_SIG = '(usuario|link)';
if (!serverTpl.includes(VAR_SIG)) problems.push('template.ts: variaveis divergem de (usuario|link)');
if (!clientTpl.includes(VAR_SIG)) problems.push('src/lib/instagram.ts: variaveis divergem de (usuario|link)');

// 5) Edge Functions esperadas ------------------------------------------
for (const fn of [
  'ig-webhook', 'ig-worker', 'ig-oauth-start', 'ig-oauth-callback', 'ig-oauth-complete', 'ig-account-disconnect',
  'ig-deauthorize', 'ig-data-deletion', 'ig-token-refresh', 'ig-media-list',
]) {
  if (!existsSync(join(root, `supabase/functions/${fn}/index.ts`))) {
    problems.push(`supabase/functions/${fn}/index.ts nao existe`);
  }
}

if (problems.length) {
  console.error('check:ig-contract -- problemas encontrados:\n');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log('check:ig-contract -- OK');
