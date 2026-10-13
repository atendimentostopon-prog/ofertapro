// Dispara 1 evento por severidade via ops_emit (PostgREST, service_role).
// Uso (as variaveis vem do seu shell; este script NUNCA le arquivos .env):
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops-test-alert.mjs
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}

const stamp = Date.now();
const cases = [
  ['critical', 'health', 'Teste: alerta critico'],
  ['error', 'edge_error', 'Teste: alerta de erro'],
  ['business', 'signup', 'Teste: evento de negocio'],
  ['info', 'cron', 'Teste: informativo'],
];

let failed = 0;
for (const [severity, category, title] of cases) {
  const res = await fetch(`${url}/rest/v1/rpc/ops_emit`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_severity: severity,
      p_category: category,
      p_title: title,
      p_detail: { origem: 'scripts/ops-test-alert.mjs' },
      p_dedupe_key: `smoke:${stamp}:${severity}`,
    }),
  });
  const body = await res.text();
  const ok = res.ok && body && body !== 'null';
  if (!ok) failed++;
  console.log(`${ok ? 'OK ' : 'ERRO'} ${severity.padEnd(8)} http=${res.status} ${ok ? '' : body}`);
}

console.log(
  failed === 0
    ? 'Enviado. Confira: #criticos + Telegram, #erros, #negocio + Telegram, #info.'
    : `${failed} evento(s) falharam. Veja docs/OPS_ALERTS.md, secao Diagnostico.`,
);
process.exit(failed === 0 ? 0 : 1);
