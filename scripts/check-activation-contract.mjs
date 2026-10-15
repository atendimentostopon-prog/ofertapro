import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  new URL('../supabase/migrations/20261015000000_history_origin.sql', import.meta.url),
  'utf8',
);

const requiredContracts = [
  /ALTER TABLE public\.history[\s\S]*ADD COLUMN IF NOT EXISTS origin text/,
  /CHECK \(origin IS NULL OR origin IN \('manual', 'automation'\)\)/,
  /CREATE OR REPLACE FUNCTION public\.set_history_origin\(\)/,
  /SET search_path = public, pg_temp/,
  /auth\.role\(\) = 'authenticated'/,
  /IF auth\.role\(\) = 'authenticated' THEN\s+NEW\.origin := 'manual'/,
  /ELSIF NEW\.origin IS NULL THEN\s+NEW\.origin := 'automation'/,
  /CREATE OR REPLACE FUNCTION public\.protect_history_origin\(\)[\s\S]*SET search_path = public, pg_temp[\s\S]*NEW\.origin := OLD\.origin/,
  /DROP TRIGGER IF EXISTS protect_history_origin_before_update ON public\.history/,
  /CREATE TRIGGER protect_history_origin_before_update[\s\S]*BEFORE UPDATE OF origin ON public\.history[\s\S]*EXECUTE FUNCTION public\.protect_history_origin\(\)/,
  /DROP TRIGGER IF EXISTS set_history_origin_before_insert ON public\.history/,
  /CREATE TRIGGER set_history_origin_before_insert[\s\S]*BEFORE INSERT ON public\.history/,
  /CREATE INDEX IF NOT EXISTS history_user_origin_idx/,
];

for (const contract of requiredContracts) {
  assert.match(migration, contract, `Contrato ausente na migration: ${contract}`);
}

console.log('check-activation-contract: ok');
