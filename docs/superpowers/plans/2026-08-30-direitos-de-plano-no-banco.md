# SP1 — Direitos de plano no banco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer de `public.plan_limits` a fonte única dos direitos de plano (triggers leem dela), tornar ofertas ilimitadas em todos os planos, recalibrar o Starter e colocar o selo "Aflyo" na vitrine pública com gate por plano.

**Architecture:** Tabela lookup `plan_limits` (1 linha por plano) é a autoridade do enforcement server-side; os 3 triggers de limite passam a `SELECT` dela em vez de `CASE` hardcoded. `src/config/plans.ts` (`PLAN_CONFIGS`) continua sendo o espelho que o front lê pra UX, validado por um script `check-plan-limits`. O selo da vitrine é gated por um booleano derivado `hide_branding` exposto na view `public_profiles` (sem vazar o `plan`).

**Tech Stack:** Supabase (Postgres + PL/pgSQL migrations), Vite + React 19 + TypeScript, Tailwind, Node ESM script (sem dependência nova).

## Global Constraints

- **Sem novos unit tests de componente** (regra do projeto). Verificação = `tsc -b && vite build`, `npx eslint <arquivos>`, `npm run check:plan-limits`, queries SQL de verificação e QA manual no navegador. O `scripts/check-plan-limits.mjs` é ferramenta de verificação, não unit test — pode ser criado.
- **Sem dependência npm nova.** O script de verificação usa só Node builtin.
- **1 commit = 1 tema**, mensagem `feat(...)` / `fix(...)` / `chore(...)` / `docs(...)` em pt-BR. Não traduzir código/comandos/identificadores.
- **Sem travessão (—) em copy de produto** (UI, e-mails, textos visíveis). Comentários de código idem por segurança.
- **Não deletar classes CSS globais** (`.btn-gradient`, `.glass-card`, etc.).
- **Migrations nomeadas** `supabase/migrations/YYYYMMDDHHMMSS_nome.sql`. As deste plano: `20260831000000_plan_limits_table.sql`, `20260831000100_triggers_read_plan_limits.sql`, `20260831000200_drop_offer_limit.sql`. Rodam em ordem de timestamp.
- **Valores canônicos por plano** (copiar verbatim; `pro` = "Profissional", `enterprise` = "Business"; fechados com o usuário em 2026-08-30):

  | coluna / campo | free | starter | pro | enterprise |
  |---|---|---|---|---|
  | `max_source_groups` / `maxSourceGroups` | 0 | 2 | 6 | 15 |
  | `max_whatsapp_instances` / `maxWhatsappConnections` | 0 | 1 | 2 | 4 |
  | `max_whatsapp_dest_groups` / `maxWhatsappGroups` | 0 | 5 | 12 | 20 |
  | `max_telegram_dest_groups` / `maxTelegramGroups` | 0 | 5 | 12 | 20 |
  | `maxTelegramConnections` (só front, sem trigger, herdado) | 0 | 1 | 2 | 5 |
  | `allow_shortener` / `allowShortener` | false | false | true | true |
  | `allow_analytics` / `advancedAnalytics` | false | false | true | true |
  | `allow_scheduling` / `futureScheduling` | false | true | true | true |
  | `remove_branding` / `removeBranding` | false | false | false | true |
  | ofertas | ilimitado em todos (sem coluna, sem trigger) | | | |
  | templates | editável em todos (sem coluna, `customTemplates` sai do front) | | | |
  | suporte prioritário | só bullet de marketing no `FEATURES_BY_PLAN.enterprise` (sem coluna, sem código) | | | |

---

## File Structure

| Arquivo | Cria/Modifica | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260831000000_plan_limits_table.sql` | Cria | Tabela `plan_limits` + RLS + seed; recria view `public_profiles` com `hide_branding` |
| `supabase/migrations/20260831000100_triggers_read_plan_limits.sql` | Cria | Reescreve `enforce_whatsapp_instance_limit`, `enforce_channel_limit`, `enforce_source_group_limit` pra ler de `plan_limits`; dropa trigger duplicado `channels_plan_limit` |
| `supabase/migrations/20260831000200_drop_offer_limit.sql` | Cria | Dropa trigger `offers_plan_limit` + função `enforce_offer_limit` |
| `scripts/check-plan-limits.mjs` | Cria | Compara `PLAN_CONFIGS` (plans.ts) com o seed da migration `plan_limits`; exit 1 se divergir |
| `package.json` | Modifica | Adiciona script `check:plan-limits` |
| `src/config/plans.ts` | Modifica | Tipo `PlanLimits` (+`allowShortener`, −`customTemplates`), `PLAN_CONFIGS` recalibrado, `canCreateOffer` sempre true, branch `!FEATURES.billing` |
| `src/config/planCatalog.ts` | Modifica | `FEATURES_BY_PLAN.starter`: tira "20.000 ofertas", troca linha de templates |
| `src/components/settings/TemplatesTab.tsx` | Modifica | Remove o gate `limits.customTemplates` (editor sempre liberado) + prop `onUpgradeClick` |
| `src/pages/Settings.tsx` | Modifica | Tira `onUpgradeClick` do `<TemplatesTab />` |
| `src/pages/Dashboard.tsx` | Modifica | Remove o card "Ofertas"; card "Canais" não mostra "Limite atingido" com limite ≤ 0 |
| `src/pages/PublicPage.tsx` | Modifica | Rodapé "Powered by Aflyo" e badge fixo no canto só quando `!profile.hide_branding` |

---

## Task 1: Migration — tabela `plan_limits` + view `public_profiles`

**Files:**
- Create: `supabase/migrations/20260831000000_plan_limits_table.sql`

**Interfaces:**
- Produces: tabela `public.plan_limits(plan text PK, max_source_groups int, max_whatsapp_instances int, max_whatsapp_dest_groups int, max_telegram_dest_groups int, allow_shortener bool, allow_analytics bool, allow_scheduling bool, remove_branding bool, updated_at timestamptz)`; view `public.public_profiles` com as 15 colunas atuais + `hide_branding boolean`.

- [ ] **Step 1: Criar o arquivo da migration com o conteúdo abaixo**

```sql
-- SP1: fonte única dos direitos de plano.
-- Antes, cada trigger de limite tinha os números em CASE plan WHEN ... hardcoded
-- (20260821000000, 20260830000000), desalinhados entre si e do front
-- (src/config/plans.ts). Esta tabela vira a autoridade do enforcement; os
-- triggers passam a ler dela (migration 20260831000100). O front mantém
-- PLAN_CONFIGS como espelho, verificado por `npm run check:plan-limits`.
--
-- Sem coluna de ofertas (ilimitado em todos os planos) e sem coluna de
-- templates (editável em todos os planos).

CREATE TABLE IF NOT EXISTS public.plan_limits (
  plan text PRIMARY KEY
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  max_source_groups        int NOT NULL DEFAULT 0,
  max_whatsapp_instances   int NOT NULL DEFAULT 0,
  max_whatsapp_dest_groups int NOT NULL DEFAULT 0,
  max_telegram_dest_groups int NOT NULL DEFAULT 0,
  allow_shortener  boolean NOT NULL DEFAULT false,
  allow_analytics  boolean NOT NULL DEFAULT false,
  allow_scheduling boolean NOT NULL DEFAULT false,
  remove_branding  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plan_limits leitura autenticada" ON public.plan_limits;
CREATE POLICY "plan_limits leitura autenticada"
  ON public.plan_limits FOR SELECT
  TO authenticated
  USING (true);
-- Sem policy de INSERT/UPDATE/DELETE: só service_role (migrations) escreve.

INSERT INTO public.plan_limits
  (plan, max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups,
   max_telegram_dest_groups, allow_shortener, allow_analytics, allow_scheduling, remove_branding)
VALUES
  ('free',        0, 0,  0,  0, false, false, false, false),
  ('starter',     2, 1,  5,  5, false, false, true,  false),
  ('pro',         6, 2, 12, 12, true,  true,  true,  false),
  ('enterprise', 15, 4, 20, 20, true,  true,  true,  true)
ON CONFLICT (plan) DO UPDATE SET
  max_source_groups        = EXCLUDED.max_source_groups,
  max_whatsapp_instances   = EXCLUDED.max_whatsapp_instances,
  max_whatsapp_dest_groups = EXCLUDED.max_whatsapp_dest_groups,
  max_telegram_dest_groups = EXCLUDED.max_telegram_dest_groups,
  allow_shortener  = EXCLUDED.allow_shortener,
  allow_analytics  = EXCLUDED.allow_analytics,
  allow_scheduling = EXCLUDED.allow_scheduling,
  remove_branding  = EXCLUDED.remove_branding,
  updated_at = now();

-- Recria a view pública adicionando hide_branding (derivado de plan_limits).
-- Mantém as 15 colunas atuais 1:1 (qualquer coluna a menos quebra PublicPage.tsx).
-- security_invoker = false: a view roda com os privilégios do dono, então o
-- sub-SELECT em plan_limits funciona pra visitante anônimo mesmo a policy de
-- plan_limits sendo só TO authenticated.
DROP VIEW IF EXISTS public.public_profiles;
CREATE VIEW public.public_profiles
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.full_name,
  p.username,
  p.public_url,
  p.bio,
  p.avatar_url,
  p.public_avatar_url,
  p.public_display_name,
  p.public_name,
  p.public_theme,
  p.public_page_active,
  p.public_page_created,
  p.whatsapp_group_url,
  p.telegram_group_url,
  p.discord_group_url,
  EXISTS (
    SELECT 1 FROM public.plan_limits pl
    WHERE pl.plan = COALESCE(p.plan, 'free') AND pl.remove_branding
  ) AS hide_branding
FROM public.profiles p
WHERE p.public_page_active = true AND p.public_page_created = true;

GRANT SELECT ON public.public_profiles TO anon, authenticated;
```

- [ ] **Step 2: Aplicar a migration no ambiente de teste**

Se houver Supabase local linkado: `supabase db reset` (roda todas as migrations do zero) OU `supabase migration up`.
Se não houver: aplicar o SQL acima no SQL Editor do projeto de staging/dev (nunca prod ainda).
Expected: sem erro. `plan_limits` criada com 4 linhas; `public_profiles` recriada.

- [ ] **Step 3: Rodar as queries de verificação**

```sql
-- 4 linhas, valores batendo com a tabela do Global Constraints:
SELECT * FROM public.plan_limits ORDER BY
  CASE plan WHEN 'free' THEN 0 WHEN 'starter' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END;

-- hide_branding presente e coerente (true só onde o dono é enterprise):
SELECT id, username, hide_branding FROM public.public_profiles LIMIT 20;

-- a view ainda tem exatamente 16 colunas (15 antigas + hide_branding):
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'public_profiles'
ORDER BY ordinal_position;

-- PII continua fechada pra anônimo (rode deslogado):
-- GET /rest/v1/profiles?select=email,phone  → [] ou permission denied
```

Expected: `plan_limits` com free `0/0/0/0/f/f/f/f`, starter `2/1/5/5/f/f/t/f`, pro `5/2/10/10/t/t/t/f`, enterprise `15/3/15/15/t/t/t/t`. `public_profiles` com 16 colunas.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260831000000_plan_limits_table.sql
git commit -m "feat(plans): tabela plan_limits (fonte unica) + hide_branding na view publica"
```

---

## Task 2: Migration — triggers leem de `plan_limits` + drop do limite de ofertas

**Files:**
- Create: `supabase/migrations/20260831000100_triggers_read_plan_limits.sql`
- Create: `supabase/migrations/20260831000200_drop_offer_limit.sql`

**Interfaces:**
- Consumes: tabela `public.plan_limits` (Task 1).
- Produces: funções `enforce_whatsapp_instance_limit`, `enforce_channel_limit`, `enforce_source_group_limit` lendo de `plan_limits`. Triggers mantidos: `whatsapp_instances_limit` (em `whatsapp_instances`), `channels_channel_limit` (em `channels`), `bot_configs_source_group_limit` (em `bot_configs`). Removidos: `channels_plan_limit` (duplicado), `offers_plan_limit`, função `enforce_offer_limit`.

- [ ] **Step 1: Criar `20260831000100_triggers_read_plan_limits.sql`**

```sql
-- SP1: os 3 triggers de limite passam a ler os caps de public.plan_limits
-- em vez de CASE plan WHEN ... hardcoded. Fonte única = a tabela.
-- Os CREATE TRIGGER não mudam (só as funções), exceto o DROP do trigger
-- duplicado channels_plan_limit (criado em 20260821000000, nunca removido
-- quando 20260830000000 passou a usar channels_channel_limit -> channels
-- rodava o enforce 2x).

-- Helper implícito: v_max := COALESCE(<coluna de plan_limits>, 0)
-- Plano ausente / valor inesperado em profiles.plan => tratado como free (0).

-- 1) Números de WhatsApp conectados (whatsapp_instances)
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_count int; v_max int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_whatsapp_instances INTO v_max
    FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  v_max := COALESCE(v_max, 0);

  SELECT count(*) INTO v_count FROM public.whatsapp_instances
    WHERE user_id = NEW.user_id AND status <> 'disconnected';

  IF v_count >= v_max
     AND (TG_OP = 'INSERT'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'disconnected' AND NEW.status <> 'disconnected')) THEN
    RAISE EXCEPTION 'Limite de números de WhatsApp do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- 2) Grupos/canais de destino pra disparo (channels)
CREATE OR REPLACE FUNCTION public.enforce_channel_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_count int; v_max int;
BEGIN
  IF NEW.type NOT IN ('whatsapp', 'telegram') THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('connected', 'active') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IN ('connected', 'active') THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  IF NEW.type = 'whatsapp' THEN
    SELECT max_whatsapp_dest_groups INTO v_max
      FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  ELSE
    SELECT max_telegram_dest_groups INTO v_max
      FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  END IF;
  v_max := COALESCE(v_max, 0);

  SELECT count(*) INTO v_count FROM public.channels
    WHERE user_id = NEW.user_id AND type = NEW.type AND status IN ('connected', 'active');

  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de canais/grupos % do plano % atingido (máximo: %).',
      NEW.type, COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- 3) Grupos monitorados / origem (bot_configs.grupos_origem)
CREATE OR REPLACE FUNCTION public.enforce_source_group_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_new_count int; v_old_count int; v_max int;
BEGIN
  v_new_count := COALESCE(array_length(NEW.grupos_origem, 1), 0);
  v_old_count := COALESCE(array_length(OLD.grupos_origem, 1), 0);
  IF v_new_count <= v_old_count THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_source_groups INTO v_max
    FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  v_max := COALESCE(v_max, 0);

  IF v_new_count > v_max THEN
    RAISE EXCEPTION 'Limite de grupos monitorados do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END; $$;

-- Trigger duplicado de channels (do 20260821000000). O enforce atual é chamado
-- por channels_channel_limit (20260830000000); sem este drop, roda 2x.
DROP TRIGGER IF EXISTS channels_plan_limit ON public.channels;
```

- [ ] **Step 2: Criar `20260831000200_drop_offer_limit.sql`**

```sql
-- SP1: ofertas passam a ser ilimitadas em todos os planos, em qualquer caminho
-- de escrita (front, public-api, PostgREST direto). Remove o enforce de
-- 20260821000000 (que ainda barrava starter em 20000).

DROP TRIGGER IF EXISTS offers_plan_limit ON public.offers;
DROP FUNCTION IF EXISTS public.enforce_offer_limit();
```

- [ ] **Step 3: Aplicar as duas migrations no ambiente de teste**

`supabase db reset` (ou `supabase migration up`), ou colar os dois SQLs no SQL Editor de staging.
Expected: sem erro.

- [ ] **Step 4: Rodar as queries de verificação de enforcement**

```sql
-- Só 1 trigger BEFORE em channels agora (channels_channel_limit):
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.channels'::regclass AND NOT tgisinternal;

-- enforce_offer_limit não existe mais:
SELECT proname FROM pg_proc WHERE proname = 'enforce_offer_limit';  -- 0 linhas

-- offers sem trigger de limite:
SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.offers'::regclass AND NOT tgisinternal;
```

Teste funcional (numa conta de teste com `plan='starter'` em staging):
- Inserir 25 linhas em `offers` com `status='active'` pro mesmo `user_id` → todas passam (sem `check_violation`).
- Tentar 2 linhas em `whatsapp_instances` (`status <> 'disconnected'`) pro mesmo user → a 2ª falha com `check_violation` e mensagem "Limite de números de WhatsApp do plano starter atingido (máximo: 1)".
- Tentar `UPDATE bot_configs SET grupos_origem = ARRAY['a','b','c']` (3 itens) pro user → falha "Limite de grupos monitorados do plano starter atingido (máximo: 2)".

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260831000100_triggers_read_plan_limits.sql supabase/migrations/20260831000200_drop_offer_limit.sql
git commit -m "feat(plans): triggers leem plan_limits + remove limite de ofertas"
```

---

## Task 3: Script `check-plan-limits` + `package.json`

**Files:**
- Create: `scripts/check-plan-limits.mjs`
- Modify: `package.json` (bloco `"scripts"`)

**Interfaces:**
- Consumes: `src/config/plans.ts` (texto), `supabase/migrations/20260831000000_plan_limits_table.sql` (texto).
- Produces: comando `npm run check:plan-limits` → exit 0 se front e banco batem, exit 1 + diff listado se não.

- [ ] **Step 1: Criar `scripts/check-plan-limits.mjs`**

```js
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
    const vals = [m[1], ...m[2].split(',').map(s => s.trim())];
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
    const norm = v => (v === 'Infinity' ? 'Infinity' : v === 'true' ? 'true' : v === 'false' ? 'false' : String(Number(v)));
    if (norm(fv) !== norm(dv)) {
      problems.push(`${plan}.${frontKey} (front=${fv}) ≠ ${dbCol} (banco=${dv})`);
    }
  }
}

if (problems.length) {
  console.error('check:plan-limits — divergências entre plans.ts e a migration plan_limits:\n');
  for (const p of problems) console.error('  - ' + p);
  console.error('\nAlinhe os dois lados (edite PLAN_CONFIGS ou crie uma migration de UPDATE).');
  process.exit(1);
}
console.log('check:plan-limits — OK (front e banco batem).');
```

- [ ] **Step 2: Adicionar o script no `package.json`**

No bloco `"scripts"`, depois de `"lint": "eslint ."`:

```json
    "lint": "eslint .",
    "check:plan-limits": "node scripts/check-plan-limits.mjs",
```

- [ ] **Step 3: Rodar contra o estado atual (deve FALHAR — plans.ts ainda não foi alinhado)**

Run: `npm run check:plan-limits`
Expected: exit 1, listando divergências (ex: `starter.maxWhatsappConnections (front=1) ≠ ...` pode bater, mas `starter.advancedAnalytics (front=true) ≠ allow_analytics (banco=false)` e `starter.allowShortener: ausente` devem aparecer). Confirma que o script detecta divergência.

- [ ] **Step 4: Commit**

```bash
git add scripts/check-plan-limits.mjs package.json
git commit -m "chore(plans): script check:plan-limits (front x banco)"
```

---

## Task 4: `TemplatesTab.tsx` + `Settings.tsx` — remove o gate `customTemplates`

Vem **antes** da Task 5 de propósito: a Task 5 tira `customTemplates` do tipo `PlanLimits`; se os consumidores no `TemplatesTab` não forem limpos primeiro, o build quebra entre as duas tasks.

**Files:**
- Modify: `src/components/settings/TemplatesTab.tsx`
- Modify: `src/pages/Settings.tsx:147-149`

**Interfaces:**
- Consumes: nada de tasks anteriores. Neste ponto `PlanLimits` ainda tem `customTemplates` (some na Task 5) — aqui só removemos os usos no front.
- Produces: editor de template sempre liberado (qualquer plano edita o template padrão); `TemplatesTab` sem prop `onUpgradeClick`.

- [ ] **Step 1: `TemplatesTab.tsx` — remover imports/vars órfãos**

- Remover a linha `import { getPlanLimits } from '../../config/plans';` (linha ~13). Volta no SP2 para `limits.allowShortener`.
- Remover a linha `const limits = getPlanLimits(user?.plan);` (linha ~437).

- [ ] **Step 2: `TemplatesTab.tsx` — remover o banner de upgrade**

Remover o bloco inteiro `{!limits.customTemplates && ( ... )}` que começa em `{!limits.customTemplates && (` (linha ~464) e termina no `)}` correspondente (logo após o `</div>` de fechamento do `<div className="p-4 bg-ice border border-mint-200 ...">`, linha ~480). É o card com "Customização disponível no plano Starter!" e botão "Fazer Upgrade".

- [ ] **Step 3: `TemplatesTab.tsx` — desamarrar o textarea**

No `<textarea>` (linhas ~522-535):
- `onChange`: remover a linha `if (!limits.customTemplates) return;` (deixar direto o `if (currentEditingTemplateTab === 'whatsapp') ...`).
- `disabled={!limits.customTemplates || loadingTemplates}` → `disabled={loadingTemplates}`.
- `className={`input-modern resize-none font-mono text-xs ${!limits.customTemplates ? 'bg-surface-1 cursor-not-allowed text-ink-tertiary' : ''}`}` → `className="input-modern resize-none font-mono text-xs"`.

- [ ] **Step 4: `TemplatesTab.tsx` — botões de formatação e variáveis**

- Botões de formatação (linha ~563): `onClick={() => limits.customTemplates && injectFormat(f.id as any)}` → `onClick={() => injectFormat(f.id as any)}`. No `className` (linhas ~564-566): remover a interpolação `${!limits.customTemplates ? 'opacity-50 cursor-not-allowed' : ''}`; se a string ficar sem nenhum `${...}`, converter de template literal (crase) pra string normal.
- Botões de variáveis (linha ~582): `onClick={() => limits.customTemplates && injectVariable(v.name)}` → `onClick={() => injectVariable(v.name)}`. `className` (linhas ~583-585): remover a mesma interpolação.

- [ ] **Step 5: `TemplatesTab.tsx` — botões Restaurar/Testar/Salvar**

Nos três `disabled={...}` (linhas ~597, ~607, ~621): remover o prefixo `!limits.customTemplates || ` de cada um. Ex: `disabled={!limits.customTemplates || loadingTemplates || restoringTemplate || savingTemplates}` → `disabled={loadingTemplates || restoringTemplate || savingTemplates}`.

- [ ] **Step 6: `TemplatesTab.tsx` — remover a prop `onUpgradeClick`**

- Na interface `TemplatesTabProps` (linhas ~31-33): remover `onUpgradeClick?: () => void;`. A interface fica vazia → remover a interface inteira e a anotação genérica.
- Na assinatura do componente: `export const TemplatesTab: React.FC<TemplatesTabProps> = ({ onUpgradeClick }) => {` → `export const TemplatesTab: React.FC = () => {`.

- [ ] **Step 7: `src/pages/Settings.tsx` — tirar `onUpgradeClick` do caller**

Linhas ~147-149:

```tsx
        {activeTab === 'templates' && (
          <TemplatesTab onUpgradeClick={() => handleTabChange('billing')} />
        )}
```

→

```tsx
        {activeTab === 'templates' && <TemplatesTab />}
```

`handleTabChange` continua usado pelos outros `<button>` de aba — deve seguir referenciado. Conferir no lint.

- [ ] **Step 8: Build + lint**

Run: `grep -rn "customTemplates" src/`
Expected: 0 resultados (todos os usos no front foram removidos; o campo ainda existe no tipo até a Task 5).

Run: `npm run build`
Expected: `✓ built`, sem erro TS.

Run: `npx eslint src/components/settings/TemplatesTab.tsx src/pages/Settings.tsx`
Expected: sem erro novo (sem "'limits' is declared but never used", sem "'onUpgradeClick' is declared but never used", sem "'getPlanLimits' is defined but never used").

- [ ] **Step 9: Commit**

```bash
git add src/components/settings/TemplatesTab.tsx src/pages/Settings.tsx
git commit -m "feat(plans): editor de template liberado em todos os planos"
```

---

## Task 5: `src/config/plans.ts` + `src/config/planCatalog.ts`

**Files:**
- Modify: `src/config/plans.ts`
- Modify: `src/config/planCatalog.ts`

**Interfaces:**
- Consumes: Task 4 já removeu todos os usos de `limits.customTemplates` no front (confirmado por `grep`), então dá pra tirar o campo do tipo sem quebrar o build.
- Produces: `PlanLimits` com `allowShortener: boolean` e sem `customTemplates`; `PLAN_CONFIGS` recalibrado; `canCreateOffer` retornando `true` sempre; `FEATURES_BY_PLAN.starter` sem menção a teto de ofertas.

- [ ] **Step 1: `src/config/plans.ts` — comentário de topo**

Adicionar na primeira linha do arquivo, antes dos imports:

```ts
// ESPELHO de public.plan_limits (migration 20260831000000). Mudou aqui?
// Rode `npm run check:plan-limits` e crie a migration de UPDATE correspondente.
```

- [ ] **Step 2: `src/config/plans.ts` — interface `PlanLimits`**

Trocar o bloco da interface (linhas ~4-17) por:

```ts
export interface PlanLimits {
  name: string;
  label: string;
  maxOffers: number; // sempre Infinity — ofertas ilimitadas (mantido por compat)
  maxWhatsappConnections: number; // Números / instâncias WhatsApp conectadas
  maxTelegramConnections: number; // Conexões / bots Telegram (só front)
  maxWhatsappGroups: number; // Grupos de destino WhatsApp
  maxTelegramGroups: number; // Grupos/canais de destino Telegram
  maxSourceGroups: number; // Grupos monitorados (origem)
  removeBranding: boolean;
  advancedAnalytics: boolean;
  futureScheduling: boolean;
  allowShortener: boolean; // Encurtador automático próprio (go.aflyo.com.br/o/...)
}
```

(sai `customTemplates`, entra `allowShortener`.)

- [ ] **Step 3: `src/config/plans.ts` — `PLAN_CONFIGS`**

Trocar o objeto `PLAN_CONFIGS` inteiro por:

```ts
export const PLAN_CONFIGS: Record<UserPlan, PlanLimits> = {
  free: {
    name: 'free',
    label: 'Plano Free',
    maxOffers: Infinity,
    maxWhatsappConnections: 0,
    maxTelegramConnections: 0,
    maxWhatsappGroups: 0,
    maxTelegramGroups: 0,
    maxSourceGroups: 0,
    removeBranding: false,
    advancedAnalytics: false,
    futureScheduling: false,
    allowShortener: false,
  },
  starter: {
    name: 'starter',
    label: 'Plano Starter',
    maxOffers: Infinity,
    maxWhatsappConnections: 1,
    maxTelegramConnections: 1,
    maxWhatsappGroups: 5,
    maxTelegramGroups: 5,
    maxSourceGroups: 2,
    removeBranding: false,
    advancedAnalytics: false,
    futureScheduling: true,
    allowShortener: false,
  },
  pro: {
    name: 'pro',
    label: 'Plano PRO', // não mexer aqui — o nome de venda ("Profissional") vem de PLAN_LABELS
    maxOffers: Infinity,
    maxWhatsappConnections: 2,
    maxTelegramConnections: 2,
    maxWhatsappGroups: 12,
    maxTelegramGroups: 12,
    maxSourceGroups: 6,
    removeBranding: false,
    advancedAnalytics: true,
    futureScheduling: true,
    allowShortener: true,
  },
  enterprise: {
    name: 'enterprise',
    label: 'Plano Enterprise', // idem — "Business" vem de PLAN_LABELS
    maxOffers: Infinity,
    maxWhatsappConnections: 4,
    maxTelegramConnections: 5,
    maxWhatsappGroups: 20,
    maxTelegramGroups: 20,
    maxSourceGroups: 15,
    removeBranding: true,
    advancedAnalytics: true,
    futureScheduling: true,
    allowShortener: true,
  },
};
```

- [ ] **Step 4: `src/config/plans.ts` — branch `!FEATURES.billing` de `getPlanLimits`**

No objeto retornado dentro de `if (!FEATURES.billing) { return { ... }; }` (linhas ~83-96): trocar `customTemplates: true,` por `allowShortener: true,`. Manter o resto (`maxOffers: Infinity`, tudo liberado).

- [ ] **Step 5: `src/config/plans.ts` — `canCreateOffer`**

Trocar o corpo da função por:

```ts
export function canCreateOffer(_activeOffersCount: number, _plan: UserPlan = 'free'): boolean {
  // Ofertas são ilimitadas em todos os planos (SP1). Mantida por compatibilidade
  // com os callers em useOfferForm.ts / Offers.tsx.
  return true;
}
```

- [ ] **Step 6: `src/config/plans.ts` — assinatura de `hasFeature`**

O tipo do parâmetro `feature` é `keyof Omit<PlanLimits, 'name' | 'label' | 'maxOffers' | 'maxWhatsappConnections' | 'maxTelegramConnections' | 'maxWhatsappGroups' | 'maxTelegramGroups' | 'maxSourceGroups'>`. Com `customTemplates` fora e `allowShortener` dentro, o `Omit` não precisa mudar (segue excluindo só as chaves numéricas + name/label). Nenhuma edição necessária aqui; conferir que compila.

- [ ] **Step 7: `src/config/planCatalog.ts` — `FEATURES_BY_PLAN`**

`starter: [ ... ]`:
- Remover a linha `'Até 20.000 ofertas ativas',`.
- Trocar `'Templates de mensagem customizados',` por `'Personalize o template de mensagem',`.

`pro: [ ... ]` (alinhar aos novos números; a linha de templates deixa de citar quantidade):
- `'Monitora até 5 grupos de origem'` → `'Monitora até 6 grupos de origem'`.
- `'Dispara para até 10 grupos de WhatsApp'` → `'Dispara para até 12 grupos de WhatsApp'`.
- `'Dispara para até 10 grupos do Telegram'` → `'Dispara para até 12 grupos do Telegram'`.
- Se houver linha citando "templates" com número, trocar por `'Personalize o template de mensagem'`.

`enterprise: [ ... ]`:
- `'Conecta até 3 números de WhatsApp'` → `'Conecta até 4 números de WhatsApp'`.
- `'Dispara para até 15 grupos de WhatsApp'` → `'Dispara para até 20 grupos de WhatsApp'`.
- `'Dispara para até 15 grupos do Telegram'` → `'Dispara para até 20 grupos do Telegram'`.
- Se houver linha citando "templates" com número, trocar por `'Personalize o template de mensagem'`.
- Adicionar a linha `'Suporte prioritário'` (só o Business tem).

Não inventar linhas novas além dessas; manter a ordem e o estilo das existentes. "Ofertas ilimitadas", se já for bullet de `pro`/`enterprise`, mantém.

- [ ] **Step 8: Rodar o check e o build**

Run: `npm run check:plan-limits`
Expected: `OK (front e banco batem).`

Run: `npm run build`
Expected: `✓ built`, sem erro TS.

Run: `npx eslint src/config/plans.ts src/config/planCatalog.ts`
Expected: sem erro novo.

- [ ] **Step 9: Commit**

```bash
git add src/config/plans.ts src/config/planCatalog.ts
git commit -m "feat(plans): PLAN_CONFIGS alinhado ao banco + ofertas ilimitadas + starter sem analytics/encurtador"
```

---

## Task 6: `src/pages/Dashboard.tsx` — remove card Ofertas + quick-fix Canais

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `getPlanLimits` (Task 4) — agora `limits.maxOffers` é `Infinity` em todos os planos.
- Produces: Dashboard sem o card "Ofertas"; card "Canais" não exibe "Limite atingido" / barra âmbar quando o limite calculado é `<= 0`.

- [ ] **Step 1: Remover as variáveis de limite de ofertas**

No bloco introduzido pelo comentário `// Estado de "limite atingido" para os cards de uso (Ofertas / Canais)` (linhas ~104-109), remover:

```ts
  const offersLimited = limits.maxOffers !== Infinity;
  const offersAtLimit = offersLimited && activeOffers >= limits.maxOffers;
```

Manter as três linhas de `channel*`.

- [ ] **Step 2: Endurecer o `channelsAtLimit`**

```ts
  const channelLimit = limits.maxWhatsappConnections + limits.maxTelegramConnections;
  const channelsLimited = limits.maxWhatsappConnections !== Infinity && channelLimit > 0;
  const channelsAtLimit = channelsLimited && connectedChannels >= channelLimit;
```

(o `&& channelLimit > 0` novo cobre o estado transiente `plan='free'`/carregando que gerava "0/0 · Limite atingido".)

- [ ] **Step 3: Remover o card "Ofertas" do JSX**

Remover o `<Card>` inteiro que começa no comentário `{/* Ofertas Ativas vs Limites */}` e vai até o `</Card>` correspondente (o card com `<span…>Ofertas</span>`, `<Package …/>`, o `{activeOffers}` e a barra `offersLimited && (...)` / `offersAtLimit && (...)`). Fica só o card `{/* Canais Conectados vs Limites */}` na grid.

Ajustar a `className` da grid de métricas se necessário: hoje é `grid ... lg:grid-cols-5` com 3 metric cards + Ofertas + Canais = 5. Sem Ofertas ficam 4 → trocar `lg:grid-cols-5` por `lg:grid-cols-4` no `<div className="grid grid-cols-1 xs:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">` (linha ~167).

- [ ] **Step 4: Remover o import de `activeOffers` se ficar órfão**

`activeOffers` vem do `stats` destructuring (linha ~52). Ele ainda é usado? Após remover o card de Ofertas, buscar `activeOffers` no arquivo. Se não houver mais uso, remover da lista de destructuring de `stats`. Se `useDashboardStats` exigir consumir a chave, deixar e adicionar `void activeOffers;` não — preferir remover do destructuring. Conferir no build.

- [ ] **Step 5: Build + lint**

Run: `npm run build`
Expected: `✓ built`, sem erro.

Run: `npx eslint src/pages/Dashboard.tsx`
Expected: sem erro novo (sem "'offersLimited' is assigned a value but never used" etc.).

- [ ] **Step 6: QA manual**

`npm run dev`, entrar como conta Starter (via `/login`, não hard-load — ver spec do fix de tela branca), ir ao Dashboard:
- Não há card "Ofertas".
- Card "Canais" não mostra "Limite atingido" nem barra âmbar quando o número é `0 / 0`.
- A grid de métricas não fica com buraco/quebra no layout em desktop e em 375px.

- [ ] **Step 7: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(dashboard): remove card de ofertas e corrige 'limite atingido' falso em canais"
```

---

## Task 7: `src/pages/PublicPage.tsx` — selo Aflyo com gate

**Files:**
- Modify: `src/pages/PublicPage.tsx`

**Interfaces:**
- Consumes: `public_profiles.hide_branding` (Task 1) — chega em `profile` (state `any`, carregado de `.from('public_profiles')`).
- Produces: rodapé "Powered by Aflyo" e badge fixo no canto só quando `!profile.hide_branding`.

- [ ] **Step 1: Gate no rodapé**

No `<footer>` (linha ~708), o bloco final:

```tsx
          <div className="text-center md:text-right">
            <span className="text-[10px] font-black text-ink-inverse/60 tracking-wider uppercase flex items-center gap-1.5 justify-center md:justify-end">
              Powered by 
              <a href="/login" className="text-mint-400 hover:text-mint-300 hover:underline">
                {APP_NAME}
              </a>
            </span>
          </div>
```

→ envolver em `{!profile?.hide_branding && ( ... )}`:

```tsx
          {!profile?.hide_branding && (
            <div className="text-center md:text-right">
              <span className="text-[10px] font-black text-ink-inverse/60 tracking-wider uppercase flex items-center gap-1.5 justify-center md:justify-end">
                Powered by{' '}
                <a href="https://aflyo.com.br" target="_blank" rel="noopener noreferrer" className="text-mint-400 hover:text-mint-300 hover:underline">
                  {APP_NAME}
                </a>
              </span>
            </div>
          )}
```

(também troca o link de `/login` pra `https://aflyo.com.br` — é vitrine pública, o CTA é a landing.)

- [ ] **Step 2: Badge fixo no canto**

Logo antes do `</div>` que fecha o container raiz da vitrine (o `<div className="min-h-screen bg-surface-1 text-ink font-sans antialiased selection:bg-ice">` da linha ~439, cujo fechamento fica na linha ~733, logo após o `</footer>`), adicionar:

```tsx
      {!profile?.hide_branding && (
        <a
          href="https://aflyo.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="fixed bottom-3 right-3 z-50 inline-flex items-center gap-1.5 rounded-full bg-surface-0 border border-line shadow-md px-3 py-1.5 text-[10px] font-bold text-ink-secondary hover:text-ink hover:border-line-strong transition-colors"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-mint-500" />
          Feito com {APP_NAME}
        </a>
      )}
```

- [ ] **Step 3: Build + lint**

Run: `npm run build`
Expected: `✓ built`, sem erro.

Run: `npx eslint src/pages/PublicPage.tsx`
Expected: sem erro novo.

- [ ] **Step 4: QA manual**

`npm run dev`. Abrir a vitrine pública de uma conta (`/<username>`):
- Conta free/Starter/Pro (`hide_branding = false`): "Powered by Aflyo" no rodapé **e** o badge "Feito com Aflyo" fixo no canto inferior direito ao rolar. O badge não cobre conteúdo essencial nem o botão de voltar ao topo (se houver).
- Conta Enterprise/Business (`hide_branding = true`): sem rodapé "Powered by", sem badge. (Se não houver conta enterprise em dev, simular com `UPDATE profiles SET plan='enterprise' WHERE username='<x>'` numa conta de teste e recarregar.)
- Em 375px: o badge não estoura a largura, fica clicável, e o rodapé continua legível.

- [ ] **Step 5: Commit**

```bash
git add src/pages/PublicPage.tsx
git commit -m "feat(plans): selo Aflyo na vitrine (rodape + badge) com gate por plano"
```

---

## Task 8: Verificação integrada + PR

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suite completa**

```bash
npm run check:plan-limits   # OK
npm run build               # ✓ built
npx eslint src              # sem erro novo (os pré-existentes de TemplateService.ts etc. podem permanecer)
```

- [ ] **Step 2: Checklist de QA manual (staging, com as 3 migrations aplicadas)**

- Conta Starter, Dashboard: sem card "Ofertas"; "Canais" sem "Limite atingido" falso.
- Conta Starter, aba Templates: edita, salva e restaura o template normalmente; sem banner de upgrade.
- Conta Starter: criar 30+ ofertas ativas → sem erro.
- Conta Starter: conectar 2º número de WhatsApp → bloqueado pelo trigger (`check_violation`).
- Conta Starter: adicionar 3º grupo de origem no BotTab → bloqueado.
- `/pricing` e Settings › Planos & Cobrança: sem "20.000 ofertas"; Starter mostra "Personalize o template de mensagem".
- Vitrine pública de conta Starter/Pro: selo no rodapé + badge no canto. Vitrine de conta Enterprise: sem selo, sem badge.

- [ ] **Step 3: Abrir o PR**

```bash
git push -u origin feat/plan-limits-source-of-truth
gh pr create --base main --title "feat(plans): SP1 direitos de plano no banco (plan_limits) + selo Aflyo" --body "Implementa docs/superpowers/specs/2026-08-30-direitos-de-plano-no-banco-design.md. Ver o spec pro racional. Migrations 20260831000000/000100/000200 precisam ser aplicadas no Supabase no deploy."
```

---

## Self-Review

**Spec coverage:**

| Requisito do spec | Task |
|---|---|
| Tabela `plan_limits` + RLS + seed | Task 1 |
| View `public_profiles` + `hide_branding` | Task 1 |
| 3 triggers leem de `plan_limits` | Task 2 |
| Drop trigger duplicado `channels_plan_limit` | Task 2 |
| Drop `enforce_offer_limit` / ofertas ilimitadas | Task 2 |
| Script `check:plan-limits` + `package.json` | Task 3 |
| `TemplatesTab` sem gate `customTemplates` | Task 4 |
| `Settings.tsx` sem `onUpgradeClick` | Task 4 (Step 7) |
| `PLAN_CONFIGS` recalibrado + `allowShortener` + `−customTemplates` | Task 5 |
| `canCreateOffer` → sempre true | Task 5 |
| branch `!FEATURES.billing` ajustado | Task 5 (Step 4) |
| `planCatalog.ts`: tira "20.000", troca linha de templates | Task 5 (Step 7) |
| Dashboard: remove card Ofertas | Task 6 |
| Dashboard: quick-fix "Limite atingido" em Canais | Task 6 (Step 2) |
| PublicPage: gate do rodapé + badge fixo | Task 7 |
| Verificação (build/lint/script/QA) | cada task + Task 8 |

Sem gaps.

**Placeholder scan:** nenhum "TBD/TODO"; todos os steps de código têm o conteúdo real; os steps de "remover linha X" citam o alvo exato + o resultado. As referências de linha (`~437`, `~464`) são aproximadas de propósito (o arquivo muda entre tasks) e cada uma vem com âncora textual inequívoca.

**Type consistency:** `allowShortener` (não `allow_shortener` nem `shortener`) em todo o front; `hide_branding` consistente entre a view (Task 1) e o consumo (Task 7); `PlanLimits` sem `customTemplates` (Task 4) casa com a remoção dos usos (Task 5); nomes de trigger (`channels_channel_limit`, `whatsapp_instances_limit`, `bot_configs_source_group_limit`) idênticos aos da migration `20260830000000`.
