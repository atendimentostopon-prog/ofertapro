import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(file, 'utf8');
const migration = read('supabase/migrations/20260831010200_bot_configs_api_key_vault.sql');
const generate = read('supabase/functions/api-key-generate/index.ts');
const reveal = read('supabase/functions/api-key-reveal/index.ts');
const revoke = read('supabase/functions/api-key-revoke/index.ts');
const deployGuide = read('API_E_INTEGRACOES_LINK_OFERTA.md');

for (const signature of [
  'public.get_bot_config_api_key(p_user_id uuid)',
  'public.set_bot_config_api_key(p_user_id uuid, p_key text)',
]) {
  assert(migration.includes(signature), `migration sem ${signature}`);
}

for (const fn of ['get_bot_config_api_key', 'set_bot_config_api_key']) {
  assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^;]+ TO service_role;`));
  assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^;]+ FROM public, anon, authenticated;`));
}

assert(generate.includes(".rpc('set_bot_config_api_key'"), 'generate nao grava no Vault');
assert(reveal.includes(".rpc('get_bot_config_api_key'"), 'reveal nao le do Vault');
assert(revoke.includes(".rpc('get_bot_config_api_key'"), 'revoke nao confere o Vault');
assert(revoke.includes(".rpc('set_bot_config_api_key'"), 'revoke nao limpa o Vault');

const migrationStep = deployGuide.indexOf('20260831010200_bot_configs_api_key_vault.sql');
const deploySteps = ['api-key-generate', 'api-key-reveal', 'api-key-revoke']
  .map((name) => deployGuide.indexOf(`supabase functions deploy ${name}`));
assert(migrationStep >= 0, 'guia nao menciona a migration do Vault');
assert(deploySteps.every((position) => position > migrationStep), 'migration deve preceder os tres deploys api-key-*');

console.log('API key rollout checks passed (Vault contract and coordinated deploy order).');
