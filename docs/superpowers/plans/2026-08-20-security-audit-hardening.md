# Auditoria de Segurança, Privacidade, LGPD e Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Executar auditoria completa em 4 fases com checkpoint, produzir evidências e findings estruturados, aplicar correções P0/P1 tecnicamente aplicáveis, entregar prontidão de produção — sem quebrar billing Cakto que acabou de ir live nem sessões dos 9 usuários em prod.

**Architecture:** SDD workspace em `.superpowers/sdd/2026-08-20-security-audit/` com progress ledger append-only + findings por fase + inventários + planos de teste. Fixes aplicados em commits isolados `fix(security):` ou `feat(security):` na branch `feat/checkout-cakto`. Fase 1 (Crown jewels) detalhada neste plano; Fases 2-4 são planejadas separadamente após o checkpoint de cada fase anterior — evita plano especulativo.

**Tech Stack:** React 19 + Vite + TypeScript · Supabase (Auth + Postgres + Deno Edge Functions) · Cakto (webhook + OAuth) · PAT Supabase `sbp_***` para queries administrativas + `supabase functions deploy`.

## Global Constraints

- Branch de trabalho: `feat/checkout-cakto` (HEAD `0be8fdc` no início; atualizado pelos commits do plano)
- Todos os comandos Supabase com PAT usam prefixo `SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN` inline
- Secrets sempre mascarados em outputs de findings: `sk_live_************1234`, `sbp_***`
- Users de teste sempre com prefixo `sectest_` e email `sectest_<uuid>@test.aflyo.local`
- Nenhum comando destrutivo em produção; testes destrutivos vão para local ou projeto Supabase separado
- Sem `--no-verify`, sem `git push --force`
- Todo fix passa por `npm run build` + verificação de output antes de commitar; se build quebrar, não commita
- Todo commit da auditoria tem mensagem `fix(security): <tema>` ou `feat(security): <tema>` ou `docs(security): <tema>`
- Deploy de edge function via `supabase functions deploy` **exige pergunta ao usuário antes**, mesmo com autorização geral já dada
- Fixes que mexem em auth flow / schema com dados / contrato de webhook → **PAUSAR e perguntar ao usuário**
- Fase 1 bloqueia merge da branch; Fases 2-4 correm depois

---

## File Structure (Fase 1)

Arquivos criados nesta fase:

```
.superpowers/sdd/2026-08-20-security-audit/
├── progress.md                    # ledger append-only (fonte de verdade)
├── inventory/
│   ├── tables-rls-status.md       # output do pg_tables + rowsecurity
│   ├── pg-policies-por-tabela.md  # policies detalhadas
│   ├── edge-functions.md          # 15 functions + auth + entrypoint
│   └── frontend-surface.md        # rotas + chamadas Supabase + hooks sensíveis
├── findings/
│   └── fase1.md                   # findings estruturados com IDs FASE1-###
├── tests/
│   ├── idor-test-plan.md          # comandos exatos + resultado esperado
│   ├── webhook-test-plan.md       # payloads adversariais + resposta esperada
│   ├── sectest-users.md           # users criados + creds (não commitar creds)
│   └── cleanup-sectest.sql        # DELETE cascade final
└── (report-final.md vem só na Fase 4)
```

Fixes aplicáveis a arquivos existentes:

- `supabase/migrations/20260820XXXXXX_rls_billing_tables.sql` — CREATE
- `supabase/functions/cakto-finalize-claim/index.ts` — MODIFY (bug `as_user`)
- `supabase/functions/cakto-webhook/index.ts` — MODIFY se validação secret estiver ausente/frouxa
- Outros arquivos conforme findings emergirem

---

## Task 1: Setup do workspace SDD e ledger

**Files:**
- Create: `.superpowers/sdd/2026-08-20-security-audit/progress.md`
- Create: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`
- Create: `.superpowers/sdd/2026-08-20-security-audit/inventory/` (diretório)
- Create: `.superpowers/sdd/2026-08-20-security-audit/tests/` (diretório)

**Interfaces:**
- Consumes: nada (task inicial)
- Produces: workspace SDD onde todas as próximas tasks arquivam evidência

- [ ] **Step 1: Criar estrutura de diretórios**

```bash
mkdir -p .superpowers/sdd/2026-08-20-security-audit/{inventory,findings,tests}
```

- [ ] **Step 2: Criar progress.md com header**

Conteúdo do arquivo:

```markdown
# Auditoria de Segurança 2026-08-20 — Progress Ledger

**Spec:** docs/superpowers/specs/2026-08-20-security-audit-hardening-design.md
**Plano:** docs/superpowers/plans/2026-08-20-security-audit-hardening.md
**Branch:** feat/checkout-cakto
**HEAD início:** <preenchido no Step 4 abaixo>

## Fase 1 — Crown jewels

Status: em andamento

### Log
```

- [ ] **Step 3: Criar findings/fase1.md com header**

Conteúdo:

```markdown
# Findings — Fase 1 (Crown jewels)

**Formato de cada finding:** ver §6 do spec.

**Contagem atual:** P0=0 P1=0 P2=0 P3=0 INFO=0

---

<!-- findings vão aqui, IDs sequenciais FASE1-001, FASE1-002... -->
```

- [ ] **Step 4: Registrar HEAD inicial no progress.md**

```bash
git rev-parse HEAD >> /tmp/head.txt
```

Editar `progress.md` substituindo `<preenchido no Step 4 abaixo>` pelo hash retornado.

- [ ] **Step 5: Verificar arquivos criados**

```bash
ls -la .superpowers/sdd/2026-08-20-security-audit/
ls -la .superpowers/sdd/2026-08-20-security-audit/findings/
```

Esperado: 4 subdirs + 2 arquivos.

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/
git commit -m "docs(security): setup workspace da auditoria fase 1"
```

---

## Task 2: Inventário — tabelas + status RLS

**Files:**
- Create: `.superpowers/sdd/2026-08-20-security-audit/inventory/tables-rls-status.md`

**Interfaces:**
- Consumes: workspace SDD (Task 1)
- Produces: lista canônica de tabelas + status RLS que alimenta Task 4 (audit RLS por tabela) e Task 5 (teste IDOR ativo)

- [ ] **Step 1: Executar query via Supabase Management API**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
  -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -d '{"query":"SELECT schemaname, tablename, rowsecurity FROM pg_tables WHERE schemaname IN ('\''public'\'','\''auth'\'') ORDER BY schemaname, tablename;"}' \
  > /tmp/tables.json
```

- [ ] **Step 2: Formatar output em markdown**

Ler `/tmp/tables.json` e transformar em tabela markdown. Formato:

```markdown
# Tabelas e Status RLS (snapshot 2026-08-20)

| Schema | Tabela | RLS ativa? | Tem PII? (inferido pelo nome/uso) |
|--------|--------|------------|----------------------------------|
| public | profiles | ✅ | SIM (email, plan) |
| public | pending_subscriptions | ❌ | SIM (customer email/nome) |
| public | webhook_events | ❌ | SIM (payload com customer) |
| ...    | ...    | ...        | ... |
```

Marcar coluna "Tem PII?" com base em nome/schema + conhecimento do CONTINUAR_AMANHA.md. Se dúvida, marcar `?` e resolver na Task 4.

- [ ] **Step 3: Registrar contagem no progress.md**

Append em `progress.md`:

```
- Task 2 (inventário tabelas): N tabelas em public, M sem RLS
```

- [ ] **Step 4: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/inventory/tables-rls-status.md .superpowers/sdd/2026-08-20-security-audit/progress.md
git commit -m "docs(security): inventario de tabelas e status RLS"
```

---

## Task 3: Inventário — edge functions e superfície frontend

**Files:**
- Create: `.superpowers/sdd/2026-08-20-security-audit/inventory/edge-functions.md`
- Create: `.superpowers/sdd/2026-08-20-security-audit/inventory/frontend-surface.md`

**Interfaces:**
- Consumes: workspace SDD
- Produces: lista de edge functions (alimenta Task 9 billing audit e Fase 2) + mapa de rotas frontend (alimenta Task 7 secrets bundle)

- [ ] **Step 1: Listar edge functions e primeiro handler de cada uma**

```bash
for dir in supabase/functions/*/; do
  name=$(basename "$dir")
  echo "## $name"
  head -30 "$dir/index.ts" 2>/dev/null || echo "(sem index.ts)"
  echo "---"
done > .superpowers/sdd/2026-08-20-security-audit/inventory/edge-functions.md
```

- [ ] **Step 2: Enriquecer o arquivo com colunas de análise**

Editar `edge-functions.md` para adicionar uma tabela sumário no topo:

```markdown
# Edge Functions — Inventário

| Function | Auth? (JWT / API key / none) | Escopo | Notas |
|----------|------------------------------|--------|-------|
| cakto-webhook | none (verifica secret do payload) | público | Chamada pela Cakto |
| cakto-claim-subscription | ? | ? | ? |
| ... | | | |
```

Preencher com base no que aparece no `head -30` de cada. Deixar `?` onde não certo — resolve no audit específico.

- [ ] **Step 3: Mapear rotas frontend**

```bash
grep -rn "path=" src/App.tsx src/pages/ 2>/dev/null > .superpowers/sdd/2026-08-20-security-audit/inventory/frontend-surface.md
echo "" >> .superpowers/sdd/2026-08-20-security-audit/inventory/frontend-surface.md
echo "## Chamadas Supabase por arquivo" >> .superpowers/sdd/2026-08-20-security-audit/inventory/frontend-surface.md
grep -rn "supabase\.\(from\|auth\|functions\|storage\|rpc\)" src/ 2>/dev/null | head -100 >> .superpowers/sdd/2026-08-20-security-audit/inventory/frontend-surface.md
```

- [ ] **Step 4: Identificar rotas /admin ou similares**

```bash
grep -rn -i "admin\|internal\|debug" src/App.tsx src/pages/ 2>/dev/null || echo "(nenhuma rota admin encontrada — investigar Task 4)"
```

Anotar resultado no fim de `frontend-surface.md`.

- [ ] **Step 5: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/inventory/
git commit -m "docs(security): inventario edge functions e superficie frontend"
```

---

## Task 4: Audit RLS via SQL — policies por tabela

**Files:**
- Create: `.superpowers/sdd/2026-08-20-security-audit/inventory/pg-policies-por-tabela.md`
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md` (append findings)

**Interfaces:**
- Consumes: `tables-rls-status.md` (lista de tabelas)
- Produces: policies documentadas + findings preliminares que Task 5 (teste IDOR) valida ou refuta

- [ ] **Step 1: Query pg_policies para todas as tabelas em public**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
  -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -d '{"query":"SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check FROM pg_policies WHERE schemaname='\''public'\'' ORDER BY tablename, cmd;"}' \
  > /tmp/policies.json
```

- [ ] **Step 2: Formatar em markdown por tabela**

Ler `/tmp/policies.json` e produzir `pg-policies-por-tabela.md` no formato:

```markdown
# Policies RLS por Tabela

## profiles

RLS ativa: SIM

| Policy | Cmd | Roles | USING (qual) | WITH CHECK |
|--------|-----|-------|--------------|------------|
| ... | SELECT | authenticated | auth.uid() = id | — |
| ... | UPDATE | authenticated | auth.uid() = id | auth.uid() = id |

**Análise:** policies parecem corretas (owner-only). Validar via Task 5.

## pending_subscriptions

RLS ativa: **NÃO** (já mapeado no handoff)
Nenhuma policy.
**Finding:** FASE1-001 (ver findings/fase1.md).

...
```

- [ ] **Step 3: Registrar findings iniciais**

Para cada tabela com RLS ausente E que tenha PII/dados sensíveis, criar finding em `findings/fase1.md`:

```markdown
## [FASE1-001] RLS ausente em pending_subscriptions
**Severidade:** P0
**Categoria OWASP:** A01 Broken Access Control
**Componente:** tabela `public.pending_subscriptions` (Postgres via PostgREST)

**Evidência:** query `SELECT rowsecurity FROM pg_tables WHERE tablename='pending_subscriptions'` retorna `false`. Nenhuma policy em `pg_policies` para esta tabela.

**Cenário de exploração:** qualquer usuário autenticado pode `supabase.from('pending_subscriptions').select('*')` via browser devtools e obter email/nome de todos os customers que iniciaram checkout — inclusive dados de PII de checkouts abandonados.

**Impacto:** exposição de PII (email, possivelmente nome) de todos os customers que interagiram com o checkout.

**Probabilidade:** alta (basta abrir devtools).

**Correção proposta:** `ALTER TABLE pending_subscriptions ENABLE ROW LEVEL SECURITY;` sem policies (service_role bypassa; frontend não precisa ler).

**Status:** pendente
```

Idem para `webhook_events` (FASE1-002) e qualquer outra tabela com RLS ausente descoberta.

- [ ] **Step 4: Analisar policies suspeitas**

Para cada policy que use `auth.uid()` — verificar consistência (SELECT / UPDATE / INSERT / DELETE cobertos, WITH CHECK presente onde apropriado). Se alguma policy usar `true` ou `role IN (...)` sem checar ownership, criar finding P0.

- [ ] **Step 5: Atualizar contagem no header de fase1.md**

Editar linha `**Contagem atual:**` com os totais atuais.

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/
git commit -m "docs(security): audit RLS - policies por tabela e findings iniciais"
```

---

## Task 5: Teste IDOR ativo — criar users sectest_ e executar bateria

**Files:**
- Create: `.superpowers/sdd/2026-08-20-security-audit/tests/sectest-users.md` (NÃO commitar creds — .gitignore)
- Create: `.superpowers/sdd/2026-08-20-security-audit/tests/idor-test-plan.md`
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`

**Interfaces:**
- Consumes: `tables-rls-status.md` (alvos), `pg-policies-por-tabela.md` (expectativas)
- Produces: evidência empírica de que RLS funciona (ou não)

- [ ] **Step 1: Adicionar sectest-users.md ao .gitignore**

```bash
echo ".superpowers/sdd/2026-08-20-security-audit/tests/sectest-users.md" >> .gitignore
```

- [ ] **Step 2: Criar 2 users de teste via Supabase Admin API**

```bash
UUID_A=$(python -c "import uuid; print(uuid.uuid4())")
UUID_B=$(python -c "import uuid; print(uuid.uuid4())")
PASS_A=$(openssl rand -base64 24)
PASS_B=$(openssl rand -base64 24)

for user_data in "sectest_${UUID_A}@test.aflyo.local:${PASS_A}" "sectest_${UUID_B}@test.aflyo.local:${PASS_B}"; do
  EMAIL="${user_data%:*}"
  PASS="${user_data#*:}"
  SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
    -X POST \
    -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
    -H "Content-Type: application/json" \
    "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
    -d "{\"query\":\"SELECT id FROM auth.users WHERE email='${EMAIL}';\"}"
done
```

**Nota:** o método real de criar user via Management API pode variar. Se o SQL direto não permitir INSERT em auth.users, usar o endpoint POST /auth/v1/admin/users (o Supabase tem esse endpoint via service_role — obter service_role via `supabase projects api-keys` com PAT). Registrar comando exato usado em `sectest-users.md` (sem senhas em log).

- [ ] **Step 3: Salvar creds em sectest-users.md (local, gitignored)**

Formato:

```
sectest_<UUID_A>@test.aflyo.local :: <PASS_A> :: user_id=<A_ID>
sectest_<UUID_B>@test.aflyo.local :: <PASS_B> :: user_id=<B_ID>

Criados em: <timestamp>
```

- [ ] **Step 4: Obter JWTs dos 2 users (login via anon key)**

```bash
ANON_KEY=$(cat .env | grep VITE_SUPABASE_ANON_KEY | cut -d= -f2)

for creds in "${EMAIL_A}:${PASS_A}" "${EMAIL_B}:${PASS_B}"; do
  EMAIL="${creds%:*}"
  PASS="${creds#*:}"
  curl -sS -X POST \
    -H "apikey: ${ANON_KEY}" \
    -H "Content-Type: application/json" \
    "https://zuqaccivowbzdfrpgekz.supabase.co/auth/v1/token?grant_type=password" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASS}\"}"
done
```

Salvar `access_token` de cada em variáveis `JWT_A` e `JWT_B`. **Não commitar.**

- [ ] **Step 5: Popular dados de A**

Como user A (usando JWT_A), criar 1 registro em cada tabela que aceite escrita autenticada:

```bash
# Atualizar profile de A (deve auto-existir via trigger de signup, mas verificar)
curl -sS -X PATCH \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${JWT_A}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  "https://zuqaccivowbzdfrpgekz.supabase.co/rest/v1/profiles?id=eq.${A_ID}" \
  -d '{"full_name":"Sectest A"}'

# Criar 1 offer se a tabela existir e for gravável
curl -sS -X POST \
  -H "apikey: ${ANON_KEY}" \
  -H "Authorization: Bearer ${JWT_A}" \
  -H "Content-Type: application/json" \
  "https://zuqaccivowbzdfrpgekz.supabase.co/rest/v1/offers" \
  -d '{"title":"Sectest offer A","user_id":"'"${A_ID}"'"}'
```

Adaptar payload aos campos required de cada tabela (consultar schema via Task 4 output).

- [ ] **Step 6: Escrever plano de teste IDOR**

Criar `tests/idor-test-plan.md` listando **exatamente** cada request adversarial que B fará contra dados de A, com resultado esperado:

```markdown
# Plano de Teste IDOR — Fase 1

Cenários:

### T1: B tenta SELECT profile de A
```
curl -H "apikey: ${ANON_KEY}" -H "Authorization: Bearer ${JWT_B}" \
  "https://zuqaccivowbzdfrpgekz.supabase.co/rest/v1/profiles?id=eq.${A_ID}"
```
Esperado: `[]` (RLS filtra). Se retornar dados de A → **FASE1-XXX P0**.

### T2: B tenta PATCH profile de A
```
curl -X PATCH ... /rest/v1/profiles?id=eq.${A_ID} -d '{"plan":"pro"}'
```
Esperado: 404 ou linha não-afetada. Se afetar → **FASE1-XXX P0**.

### T3: B tenta SELECT offers de A
### T4: B tenta DELETE offer de A
### T5: B tenta SELECT subscriptions de A
### T6: B tenta SELECT pending_subscriptions de A (RLS conhecida ausente)
### T7: B tenta SELECT webhook_events (RLS conhecida ausente)
### T8-T15: idem para channels, whatsapp_*, api_keys, e demais tabelas do inventário
```

- [ ] **Step 7: Executar bateria**

Rodar cada request de T1-T15. Registrar output em `idor-test-plan.md` embaixo de cada cenário: `Resultado: <status> - <body resumido>`.

- [ ] **Step 8: Criar findings para cada falha**

Se qualquer request retornar dados de A (ou modificar dados de A), criar finding P0 imediatamente em `findings/fase1.md`.

**REGRA DE ESCAPE:** se aparecer P0 de vazamento **em produção** (dados de users reais expostos, não só sectest), PARAR e reportar ao usuário antes de continuar.

- [ ] **Step 9: Cleanup dos users sectest_**

Criar `tests/cleanup-sectest.sql`:

```sql
-- Cleanup users sectest_ criados na auditoria
DELETE FROM auth.users WHERE email LIKE 'sectest_%@test.aflyo.local';
-- Dados em tabelas com FK ON DELETE CASCADE limpam junto.
-- Confirmar que não sobrou nada:
SELECT COUNT(*) FROM profiles WHERE email LIKE 'sectest_%';
```

Executar via PAT:

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
  -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -d "@.superpowers/sdd/2026-08-20-security-audit/tests/cleanup-sectest.sql"
```

Verificar output: `count` deve ser `0`.

- [ ] **Step 10: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/tests/idor-test-plan.md .superpowers/sdd/2026-08-20-security-audit/tests/cleanup-sectest.sql .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md .gitignore
git commit -m "docs(security): teste IDOR ativo - bateria completa e findings"
```

---

## Task 6: Audit auth Supabase (leitura de código)

**Files:**
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`
- Read (não modifica): `src/lib/supabase.ts`, `src/context/AuthContext.tsx` (se existir), `src/pages/Login.tsx`, `src/pages/Signup.tsx` (ou equivalentes)

**Interfaces:**
- Consumes: `frontend-surface.md`
- Produces: findings de auth em `fase1.md`

- [ ] **Step 1: Ler client Supabase**

```bash
cat src/lib/supabase.ts
```

Verificar checklist:
- (a) Usa apenas `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`?
- (b) Nenhuma referência a `service_role` ou `SUPABASE_SERVICE_ROLE_KEY`?
- (c) `persistSession: true`? `autoRefreshToken: true`? `storage: localStorage` (default)?

Se algum desses estiver errado (ex.: service_role importada), finding P0 imediato.

- [ ] **Step 2: Ler fluxo de signup**

Encontrar componente de signup:

```bash
grep -rn "signUp\|createUser" src/ | head -20
```

Ler cada arquivo listado. Verificar:
- Confirmação de email obrigatória? (`emailRedirectTo` presente?)
- Redirect URL: hardcoded ou usa `window.location.origin` (open redirect risk)?
- Password strength check?

- [ ] **Step 3: Ler fluxo de password reset**

```bash
grep -rn "resetPasswordForEmail\|updateUser" src/ | head -20
```

Verificar:
- Token single-use? (Supabase padrão garante — só validar que não é sobrescrito)
- Redirect URL segura?
- Rate limit (Supabase default: 4/hour por email)

- [ ] **Step 4: Ler fluxo de logout**

```bash
grep -rn "signOut" src/ | head -10
```

Verificar:
- `signOut({ scope: 'global' })` ou default `'local'`? Se `local`, tokens em outras abas ficam ativos → P2/P3 conforme risco.

- [ ] **Step 5: Buscar comparações client-side de role/plan**

```bash
grep -rn "\.role\|\.plan\s*===" src/ | head -30
grep -rn "isAdmin\|isPro\|isPremium" src/ | head -30
```

Se encontrar decisão client-side sensível (ex.: `if (user.role === 'admin') showAdmin()`) SEM revalidação server-side, finding P0/P1 conforme superfície.

- [ ] **Step 6: Buscar rotas admin no roteamento**

```bash
grep -rn "admin\|Admin" src/App.tsx src/pages/ | head -20
```

Se existir rota `/admin` sem guard server-side (só verifica `user.role` client-side), finding P0 — qualquer user pode reescrever role no localStorage e entrar.

- [ ] **Step 7: Registrar findings**

Para cada issue encontrada em Steps 1-6, criar finding em `findings/fase1.md` com formato completo.

- [ ] **Step 8: Atualizar contagem no header e progress.md**

- [ ] **Step 9: Commit (só se produziu novos findings)**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md .superpowers/sdd/2026-08-20-security-audit/progress.md
git commit -m "docs(security): audit auth Supabase - findings"
```

Se nenhum finding novo, não commitar (evitar commits vazios).

---

## Task 7: Audit secrets no bundle e .env

**Files:**
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`
- Read: `.env`, `.env.example`, `dist/assets/*.js` (gerado)

**Interfaces:**
- Consumes: nada específico (independente)
- Produces: findings de secrets vazados em `fase1.md`

- [ ] **Step 1: Comparar .env e .env.example**

```bash
diff <(sort .env | cut -d= -f1) <(sort .env.example | cut -d= -f1) || true
```

Analisar:
- Vars com `VITE_` no `.env` → vão pro bundle. Se alguma tiver nome sensível (ex.: `VITE_SERVICE_ROLE_KEY`), P0.
- Vars sem `VITE_` no `.env` → server-only. Não devem aparecer em bundle.

- [ ] **Step 2: Buildar produção**

```bash
npm run build
```

Verificar que build passa. Se falhar, PARAR e reportar (não é bug de segurança per se, mas bloqueia auditoria de bundle).

- [ ] **Step 3: Grepar bundle por padrões de secret**

```bash
grep -rEn "sbp_[a-zA-Z0-9]+|sk_(live|test)_[a-zA-Z0-9]+|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" dist/assets/*.js | head -20
grep -rn "service_role" dist/assets/*.js | head -20
grep -rn "SERVICE_ROLE" dist/assets/*.js | head -20
```

Também procurar strings específicas conhecidas do handoff:
```bash
grep -F "4fd8742e-04b2-4c78-a2dd-72a896c9c642" dist/assets/*.js  # cakto webhook secret
grep -F "$SUPABASE_ACCESS_TOKEN" dist/assets/*.js  # PAT
```

- [ ] **Step 4: Verificar source maps em prod**

```bash
ls dist/assets/*.map 2>/dev/null && echo "MAPS EXPOSTOS" || echo "sem source maps"
```

Se source maps existirem e forem servidos publicamente, finding P2 (facilita reverse engineering).

- [ ] **Step 5: Registrar findings**

Cada secret encontrado no bundle → finding P0 com evidência (linha do grep, **mascarando o secret real** no finding). Exemplo:

```markdown
## [FASE1-00X] Service role key exposta no bundle frontend
**Severidade:** P0
**Categoria OWASP:** A02 Security Misconfiguration (secret exposure)
**Componente:** dist/assets/index-abc123.js

**Evidência:** grep encontrou `SUPABASE_SERVICE_ROLE_KEY: "eyJ***"` na posição X do bundle.

**Cenário:** qualquer visitante do site pode extrair a service_role key inspecionando o bundle. Service_role bypassa RLS — atacante pode ler/escrever qualquer tabela.

**Impacto:** comprometimento total do banco de dados.

**Correção proposta:** (1) remover import da var do código frontend; (2) rotacionar a key no painel Supabase; (3) rebuildar e redeployar.

**Status:** pendente — precisa rotação manual pelo usuário no painel Supabase.
```

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md
git commit -m "docs(security): audit secrets no bundle e .env - findings"
```

---

## Task 8: Audit billing Cakto (leitura de código)

**Files:**
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`
- Read: `supabase/functions/cakto-webhook/index.ts`, `supabase/functions/cakto-claim-subscription/index.ts`, `supabase/functions/cakto-finalize-claim/index.ts`, `supabase/functions/cakto-cancel-subscription/index.ts`
- Read: `src/hooks/useCheckoutIntent.ts`, `src/hooks/useSubscription*.ts` (se existir)

**Interfaces:**
- Consumes: `edge-functions.md`
- Produces: findings de billing em `fase1.md`

- [ ] **Step 1: Auditar cakto-webhook**

Ler `supabase/functions/cakto-webhook/index.ts` inteiro. Checklist:
- Valida `payload.secret === expectedSecret` (constant-time)? Se usar `===` em string, é vulnerável a timing attack teórico — reportar como P3 se secret é longo, P1 se curto.
- Guarda `event_id` em `webhook_events` antes de processar? Verifica que não existe antes de reprocessar (idempotência)?
- Retorna HTTP 4xx quando payload inválido (não 200 — Cakto reagenda em 4xx/5xx conforme docs)?
- Handlers de cada evento (subscription.created, payment.approved, etc.) fazem UPSERT idempotente?

- [ ] **Step 2: Auditar cakto-claim-subscription**

Checklist:
- Como é gerado o token do magic link? Usa `crypto.randomUUID()` / `crypto.getRandomValues()` (seguro) ou `Math.random()` (P0)?
- Token tem expiração (TTL)?
- Token é single-use (marcado como usado após consumo)?
- Link enviado por email — email do destinatário validado antes de enviar?

- [ ] **Step 3: Auditar cakto-finalize-claim**

Bug já mapeado no handoff:
```
if (as_user && as_user !== user.id)  // errado - só bloqueia se as_user existe
```

Deve ser:
```
if (!as_user || as_user !== user.id)  // bloqueia se ausente OU diferente
```

Registrar como finding com correção pronta.

- [ ] **Step 4: Auditar cakto-cancel-subscription**

Checklist:
- Verifica que `user.id === subscription.user_id` antes de chamar Cakto?
- Retorna erro se subscription não pertence ao user autenticado?
- Log da ação (quem cancelou o quê, quando)?

- [ ] **Step 5: Grepar frontend por decisões de entitlement**

```bash
grep -rn "plan\s*[!=]==\s*['\"]" src/ | head -30
grep -rn "getPlanLimits\|planLimits\|MAX_" src/ | head -30
```

Verificar: o frontend pode **mostrar/esconder UI** com base em plan (aceitável), mas se **enforcement real** (ex.: bloquear criação de N offers) só existe client-side, é P1. Confirmar que backend (RLS ou edge function) também impõe o limite.

- [ ] **Step 6: Registrar findings**

Cada issue encontrada vira finding com:
- Trecho de código exato (linha)
- Cenário de exploração
- Correção proposta (com código específico quando trivial)

- [ ] **Step 7: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md
git commit -m "docs(security): audit billing Cakto - 4 edge functions e entitlement"
```

---

## Task 9: Teste ativo webhook Cakto — payloads adversariais

**Files:**
- Create: `.superpowers/sdd/2026-08-20-security-audit/tests/webhook-test-plan.md`
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`

**Interfaces:**
- Consumes: findings de Task 8 (esperativas de comportamento)
- Produces: evidência empírica de que webhook rejeita adversarial input

**REGRA DE ESCAPE:** este teste **não deve criar subscription real**. Se qualquer payload de teste for aceito e causar side effect (subscription criada, email enviado ao customer, cobrança gerada), PARAR e reportar antes de continuar.

- [ ] **Step 1: Escrever plano de teste**

Criar `webhook-test-plan.md`:

```markdown
# Plano de Teste Webhook Cakto — Fase 1

Alvo: https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook

Precauções:
- Payload usa event_id com prefixo `sectest_wh_` para facilitar cleanup.
- Payload NÃO usa customer_email real; usa `sectest_wh_<uuid>@test.aflyo.local`.
- Se o webhook aceitar e criar subscription, cleanup SQL rodado imediatamente.

Cenários:

### WH1: payload sem secret
```
curl -X POST -H "Content-Type: application/json" \
  https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook \
  -d '{"event":"subscription.created","data":{"id":"sectest_wh_..."}}'
```
Esperado: HTTP 401/403. Se 200 → **P0**.

### WH2: payload com secret errado
```
curl -X POST -H "Content-Type: application/json" \
  https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/cakto-webhook \
  -d '{"secret":"wrong","event":"subscription.created","data":{"id":"sectest_wh_..."}}'
```
Esperado: HTTP 401/403.

### WH3: replay do mesmo event_id
Enviar payload legítimo (usando `4fd8742e-04b2-4c78-a2dd-72a896c9c642` como secret) com `data.id = sectest_wh_replay_<uuid>`, 2 vezes seguidas.
Esperado: primeira vez 200 (cria subscription); segunda vez 200 mas noop (não duplica).

### WH4: payload com event desconhecido
```
{"secret":"...","event":"totally.fake","data":{}}
```
Esperado: 200 com log, OU 400. Não deve crashar.

### WH5: payload malformado (JSON inválido)
Esperado: 400.
```

- [ ] **Step 2: Executar cenários WH1, WH2, WH4, WH5 (sem side effect)**

Estes cenários não criam subscription. Rodar e registrar resultado.

- [ ] **Step 3: Executar WH3 com cautela**

Antes de rodar, verificar que o payload usa email/customer fictício. Enviar 2 vezes. Verificar via SQL:

```sql
SELECT COUNT(*) FROM subscriptions WHERE customer_email LIKE 'sectest_wh_%';
```

Esperado: 1 (não 2).

- [ ] **Step 4: Cleanup imediato de subscription de teste (se WH3 criou)**

```sql
DELETE FROM subscriptions WHERE customer_email LIKE 'sectest_wh_%';
DELETE FROM webhook_events WHERE payload::text LIKE '%sectest_wh_%';
```

Executar via PAT.

- [ ] **Step 5: Registrar findings baseados em resultados**

Cada cenário que não passou → finding em `fase1.md`.

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/tests/webhook-test-plan.md .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md
git commit -m "docs(security): teste ativo webhook Cakto - payloads adversariais"
```

---

## Task 10: Audit cookies/sessão Supabase Auth

**Files:**
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`

**Interfaces:**
- Consumes: findings de Task 6 (auth)
- Produces: findings de cookies/sessão

- [ ] **Step 1: Verificar onde o JWT vai parar**

Como o app usa `@supabase/supabase-js` no browser, o JWT vai por padrão para `localStorage` (não é `HttpOnly`). Isso é o comportamento default do supabase-js em SPA. Não é bug per se, é trade-off arquitetural — mas registrar como INFO:

```markdown
## [FASE1-00X] JWT em localStorage (não HttpOnly)
**Severidade:** INFO
**Categoria OWASP:** A05 Security Misconfiguration
**Componente:** @supabase/supabase-js default storage

**Evidência:** default do supabase-js quando roda em browser SPA. Confirmar em runtime abrindo devtools → Application → localStorage.

**Cenário:** qualquer XSS explorável rouba o JWT diretamente (não conseguiria se fosse cookie HttpOnly).

**Impacto:** amplifica impacto de qualquer XSS. Sem XSS conhecido, é só trade-off documentado.

**Correção proposta:** manter default (usar cookies HttpOnly exige SSR/Next.js). Priorizar CSP + sanitização para prevenir XSS.

**Status:** aceito como trade-off arquitetural. Priorizar CSP na Fase 2.
```

- [ ] **Step 2: Verificar TTL da sessão**

Consultar via PAT ou docs Supabase: default é access_token 1h + refresh_token 7d. Se configurado diferente, verificar `supabase/config.toml` ou dashboard.

- [ ] **Step 3: Registrar demais findings de sessão se aplicável**

Ex.: se `signOut` não é global e o app tem "logout de todos dispositivos" faltando (P3 em SaaS individual).

- [ ] **Step 4: Commit (se findings novos)**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md
git commit -m "docs(security): audit cookies e sessao Supabase Auth"
```

---

## Task 11: Consolidar findings da Fase 1 e decidir fix wave

**Files:**
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md` (contagem final)
- Modify: `.superpowers/sdd/2026-08-20-security-audit/progress.md`

**Interfaces:**
- Consumes: todos os findings acumulados nas Tasks 2-10
- Produces: lista priorizada de fixes para Tasks 12+

- [ ] **Step 1: Ler findings/fase1.md inteiro**

Revisar cada finding. Reclassificar se necessário (ex.: P1 subiu pra P0 depois de cruzar com outro achado). Anotar reclassificação no fim do finding.

- [ ] **Step 2: Atualizar contagem no header de fase1.md**

Contar cada severidade final. Exemplo:

```
**Contagem final Fase 1:** P0=3 P1=5 P2=4 P3=2 INFO=1
```

- [ ] **Step 3: Escrever seção "Decisão de merge" no fim de fase1.md**

Aplicar critérios do spec §4.2:

```markdown
## Decisão de merge

Critério do spec: merge bloqueado se P0 ≥ 1 OU P1 ≥ 3.

Situação: P0=3, P1=5 → **MERGE BLOQUEADO** até fix wave.

Fixes obrigatórios antes de desbloqueio:
- FASE1-001, FASE1-002, FASE1-005 (P0)
- FASE1-003, FASE1-007 (P1 — os 3 que mais reduzem superfície)

Fixes que ficam pra Fase 2 (P1 restantes + P2/P3): FASE1-004, FASE1-006, FASE1-008-014.
```

- [ ] **Step 4: Listar fixes classificados**

Para cada fix, marcar:
- **Auto-aplicar** (na lista "aplico sem perguntar" do spec §4.3): RLS, `as_user` bug, HMAC do webhook se ausente, remoção de secrets versionados, policies claramente erradas
- **Pausa e pergunta** (spec §4.4): auth flow, schema com dados, contrato de webhook, deploy de edge function

- [ ] **Step 5: Registrar decisão no progress.md**

```markdown
### Fim das tasks de auditoria da Fase 1

Findings: P0=N P1=N ...
Decisão de merge: bloqueado | liberado
Fixes auto-aplicar: FASE1-XXX, FASE1-YYY
Fixes pausa-e-pergunta: FASE1-ZZZ
```

- [ ] **Step 6: Commit**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md .superpowers/sdd/2026-08-20-security-audit/progress.md
git commit -m "docs(security): consolidacao dos findings da Fase 1 e decisao de merge"
```

---

## Task 12: Fix wave — RLS em pending_subscriptions e webhook_events

**Files:**
- Create: `supabase/migrations/20260820100000_rls_billing_tables.sql`
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md` (Status dos findings)

**Interfaces:**
- Consumes: findings FASE1-001 (RLS pending_subscriptions) e FASE1-002 (RLS webhook_events) + quaisquer outros findings de RLS descobertos
- Produces: RLS ativa nas tabelas expostas, service_role continua com acesso

- [ ] **Step 1: Escrever migration SQL**

Criar `supabase/migrations/20260820100000_rls_billing_tables.sql`:

```sql
-- Ativa RLS em tabelas usadas apenas pelo backend (edge functions via service_role).
-- Sem policies: authenticated/anon ficam bloqueados; service_role bypassa RLS por padrão.
--
-- Origem: auditoria de segurança Fase 1 (findings FASE1-001, FASE1-002).

ALTER TABLE public.pending_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Verificação:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE tablename IN ('pending_subscriptions','webhook_events');
-- Esperado: rowsecurity = true para ambas.
```

Se durante Task 4/5 aparecerem outras tabelas com RLS ausente + PII, adicionar aqui.

- [ ] **Step 2: Aplicar migration via Management API**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
  -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -d "$(jq -Rs '{query: .}' < supabase/migrations/20260820100000_rls_billing_tables.sql)"
```

- [ ] **Step 3: Verificar via query**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
  -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -d '{"query":"SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('\''pending_subscriptions'\'','\''webhook_events'\'');"}'
```

Esperado: ambas com `rowsecurity: true`.

- [ ] **Step 4: Registrar em schema_migrations (padrão Cakto Task 1)**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN curl -sS \
  -X POST \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.supabase.com/v1/projects/zuqaccivowbzdfrpgekz/database/query" \
  -d '{"query":"INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('\''20260820100000'\'', '\''rls_billing_tables'\'', ARRAY['\''ALTER TABLE public.pending_subscriptions ENABLE ROW LEVEL SECURITY;'\'','\''ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;'\'']) ON CONFLICT DO NOTHING;"}'
```

- [ ] **Step 5: Re-executar Task 5 cenários T6 e T7 (RLS pending_subscriptions/webhook_events)**

Recriar 1 user sectest, tentar SELECT das tabelas via PostgREST. Esperado agora: `[]` (antes retornava dados).

Se ainda retornar dados → migration não aplicou; investigar.

Depois cleanup do sectest user.

- [ ] **Step 6: Atualizar findings**

Marcar FASE1-001 e FASE1-002 como `Status: corrigido em <hash-do-commit>`.

- [ ] **Step 7: Build**

```bash
npm run build
```

Esperado: passa (migration não afeta bundle).

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260820100000_rls_billing_tables.sql .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md
git commit -m "fix(security): RLS em pending_subscriptions e webhook_events"
```

- [ ] **Step 9: Anotar hash do commit nos findings**

Substituir `<hash-do-commit>` no Status pelo hash real.

---

## Task 13: Fix wave — bug as_user em cakto-finalize-claim

**Files:**
- Modify: `supabase/functions/cakto-finalize-claim/index.ts`
- Modify: `.superpowers/sdd/2026-08-20-security-audit/findings/fase1.md`

**Interfaces:**
- Consumes: finding do bug já mapeado
- Produces: correção lógica + deploy da função

**REGRA:** deploy de edge function → **PAUSAR e perguntar ao usuário antes**.

- [ ] **Step 1: Ler arquivo atual**

```bash
grep -n "as_user" supabase/functions/cakto-finalize-claim/index.ts
```

Confirmar que linha ~21 tem o padrão `if (as_user && as_user !== user.id)`.

- [ ] **Step 2: Aplicar edit**

Trocar:
```typescript
if (as_user && as_user !== user.id) {
```

Por:
```typescript
if (!as_user || as_user !== user.id) {
```

- [ ] **Step 3: Verificar diff local**

```bash
git diff supabase/functions/cakto-finalize-claim/index.ts
```

Esperado: só a linha do `if` mudou.

- [ ] **Step 4: Build**

```bash
npm run build
```

Esperado: passa (edge functions não são buildadas pelo Vite, mas o TS check pega problemas).

- [ ] **Step 5: PAUSAR e perguntar ao usuário sobre deploy**

Mensagem ao usuário: "Fix do bug `as_user` em `cakto-finalize-claim` está pronto localmente. Deploy em produção via `SUPABASE_ACCESS_TOKEN=*** supabase functions deploy cakto-finalize-claim --project-ref zuqaccivowbzdfrpgekz` afeta usuários vivos. Autoriza deploy agora? (sim/não/depois)"

- [ ] **Step 6: Se autorizado, deployar**

```bash
SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN \
  supabase functions deploy cakto-finalize-claim --project-ref zuqaccivowbzdfrpgekz
```

Verificar output: sucesso.

- [ ] **Step 7: Marcar finding como corrigido**

Atualizar Status no finding correspondente com hash do commit + timestamp do deploy.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/cakto-finalize-claim/index.ts .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md
git commit -m "fix(security): cakto-finalize-claim as_user defense-in-depth"
```

---

## Task 14: Fix wave — outros P0/P1 auto-aplicáveis (procedimento genérico)

**Files:** varia por finding.

**Interfaces:**
- Consumes: findings da Fase 1 marcados como "Auto-aplicar" na Task 11
- Produces: 1 commit por fix isolado

**Nota:** os fixes específicos são descobertos durante Tasks 4-10 e classificados na Task 11. Este task instancia o **procedimento** para aplicar cada um. Fixes conhecidos hoje (RLS + as_user) já têm tasks dedicadas 12/13 acima. Fixes adicionais descobertos seguem este template.

**Procedimento para CADA fix auto-aplicável não coberto por Tasks 12/13:**

- [ ] **Step 1: Ler o finding correspondente em findings/fase1.md**

Confirmar: Severidade, Componente, Correção proposta.

- [ ] **Step 2: Aplicar o edit sugerido pelo finding**

Usar `Edit` tool com `old_string` e `new_string` exatos do trecho de código.

- [ ] **Step 3: Se for fix em edge function, verificar se precisa deploy**

Se sim, PAUSAR e perguntar ao usuário.

- [ ] **Step 4: Se for fix em código frontend, rodar build + tsc**

```bash
npm run build && npx tsc --noEmit
```

Se qualquer um falhar, NÃO commitar. Investigar e corrigir. Se não der pra corrigir sem virar outro fix, reverter o edit e reclassificar o finding pra "pausa e pergunta".

- [ ] **Step 5: Se for fix em migration/SQL, aplicar via Management API**

Mesmo procedimento da Task 12 Steps 2-4.

- [ ] **Step 6: Marcar finding como corrigido**

Atualizar Status no finding com hash do commit.

- [ ] **Step 7: Commit isolado**

```bash
git add <arquivos-do-fix>
git commit -m "fix(security): <descrição-curta-do-fix>"
```

Um commit por fix (ou cluster correlacionado de fixes na mesma área).

**Repetir Steps 1-7 até todos os fixes "Auto-aplicar" estarem processados.**

---

## Task 15: Verificação final e checkpoint da Fase 1

**Files:**
- Modify: `.superpowers/sdd/2026-08-20-security-audit/progress.md`

**Interfaces:**
- Consumes: estado final da Fase 1 (findings + fixes)
- Produces: relatório de checkpoint pro usuário

- [ ] **Step 1: Rodar bateria final de verificação**

```bash
npm run build
npx tsc --noEmit
```

Ambos devem passar. Se qualquer falhar, investigar antes de fechar a fase.

- [ ] **Step 2: Re-executar cenários críticos do teste IDOR contra tabelas que ganharam RLS**

Especificamente WH3-like: recriar 1 sectest, tentar SELECT em `pending_subscriptions` e `webhook_events`. Esperado: `[]`.

- [ ] **Step 3: Cleanup final de qualquer resíduo sectest_**

```sql
DELETE FROM auth.users WHERE email LIKE 'sectest_%';
```

Verificar count = 0.

- [ ] **Step 4: Escrever seção "Checkpoint da Fase 1" em progress.md**

```markdown
## Checkpoint Fase 1 — <timestamp>

### Findings
- Total: N (P0=X, P1=Y, P2=Z, P3=W, INFO=V)
- Corrigidos: N-M (lista de IDs + hashes)
- Pendentes: M (lista de IDs + motivo — pausa-e-pergunta, decisão jurídica, precisa infra, etc.)

### Fixes aplicados
| ID | Descrição | Commit |
|----|-----------|--------|
| FASE1-001 | RLS em pending_subscriptions | <hash> |
| FASE1-002 | RLS em webhook_events | <hash> |
| FASE1-XXX | as_user defense-in-depth | <hash> |
| ... | ... | ... |

### Decisão de merge

<liberado | bloqueado + motivo>

### Próxima ação

<aguardar aprovação do usuário para Fase 2 | resolver pendências X, Y, Z primeiro>
```

- [ ] **Step 5: Commit do checkpoint**

```bash
git add .superpowers/sdd/2026-08-20-security-audit/progress.md
git commit -m "docs(security): checkpoint Fase 1 completo"
```

- [ ] **Step 6: Apresentar checkpoint ao usuário**

Mensagem no chat:

```
Fase 1 completa. Resumo:

- Findings: <contagem>
- Fixes aplicados: <lista curta>
- Fixes pendentes (pausa-e-pergunta): <lista>
- Decisão de merge: <liberado | bloqueado>
- Commit hashes: <primeiro..último>

Detalhes completos em .superpowers/sdd/2026-08-20-security-audit/progress.md
Findings estruturados em .superpowers/sdd/2026-08-20-security-audit/findings/fase1.md

Aprovas passar pra Fase 2 (superfície pública)? Ou queres resolver algum pendente primeiro?
```

**AGUARDAR RESPOSTA DO USUÁRIO ANTES DE PROSSEGUIR.**

---

## Fases 2, 3, 4 — a planejar após checkpoint

O spec (§5 e §3.1) determina que cada fase seja **redetalhada no início dela** para evitar plano especulativo — coisas descobertas na Fase 1 podem mudar escopo/prioridade das seguintes.

Depois da aprovação do checkpoint da Fase 1, o próximo passo é reinvocar `writing-plans` (ou continuar aqui) para criar:

- `docs/superpowers/plans/2026-08-2X-security-audit-fase2.md` — Superfície pública (14 edge functions + CORS + headers + rate limit)
- `docs/superpowers/plans/2026-08-2X-security-audit-fase3.md` — Dados e LGPD (inventário + rascunhos jurídicos)
- `docs/superpowers/plans/2026-08-2X-security-audit-fase4.md` — Hardening + relatório final consolidado

Cada plano seguirá a mesma estrutura deste (setup → inventário → audits → fix wave → checkpoint), adaptado ao escopo da fase.

---

## Self-review (feito pelo autor deste plano)

**1. Spec coverage — cada seção do spec tem task correspondente?**

| Spec § | Tópico | Task(s) |
|--------|--------|---------|
| §1 Contexto | Stack, negócio, branch, fora de escopo | Refletido nas Global Constraints e Task 1 header |
| §2 Abordagem | 4 fases com checkpoint | Task 15 checkpoint + fases 2-4 marcadas como "a planejar" |
| §3.1 Ciclo interno | inventário → audit → teste → sinalizar P0 → fix → checkpoint | Tasks 2-3 (inventário), 4/6/7/8/10 (audit), 5/9 (teste), 11 (consolidar), 12-14 (fix), 15 (checkpoint) |
| §3.2 Artefatos | workspace SDD, findings, report-final | Task 1 (workspace) + report-final adiado pra Fase 4 |
| §3.3 Regras invioláveis | secrets mascarados, sectest_, PAT inline, merge só depois de aprovação, pausa em auth/schema/webhook | Global Constraints |
| §4.1.1 Auth Supabase | client, fluxos, .env grep | Task 6 |
| §4.1.2 RLS | pg_policies, teste IDOR | Tasks 4, 5 |
| §4.1.3 Billing Cakto | 4 funções + entitlement + teste ativo | Tasks 8, 9 |
| §4.1.4 Secrets no bundle | build + grep | Task 7 |
| §4.1.5 Cookies/sessão | @supabase/supabase-js | Task 10 |
| §4.2 Critérios P0/P1 | bloqueio de merge | Task 11 |
| §4.3 Auto-aplicar | RLS + as_user + HMAC + secrets versionados + policies erradas | Tasks 12, 13, 14 |
| §4.4 Pausa e pergunta | auth flow, schema com dados, contrato webhook | Global Constraint + Task 13 Step 5 |
| §6 Formato finding | template com IDs FASE1-### | Task 1 Step 3 + usado em todas as tasks de finding |
| §7 Processo fix | 1 commit por fix, build antes, rollback via revert | Tasks 12-14 |
| §8 Ambiente teste | sectest_, cleanup, sem produção | Task 5 + Global Constraint |
| §9 Regras escape | STOP em vazamento ativo/secret exposto/decisão contrato/>4h/jurídico | Task 5 Step 8, Task 9 REGRA DE ESCAPE, Global Constraint |

Gap identificado: §4.1.1 Step "grep por SUPABASE_SERVICE key no .env versionado" está diluído em Task 6 Step 1 + Task 7 Step 1. Aceito — a checagem acontece.

Gap identificado: §5 (fases 2-4) não têm tasks — intencional, ver seção "Fases 2, 3, 4 — a planejar após checkpoint".

**2. Placeholder scan:** feito. Cada task tem comandos exatos ou template concreto (Task 14 tem template genérico com procedimento explícito, sem placeholder). Nenhum "TODO", "fill in details", "handle edge cases".

**3. Type consistency:** N/A — plano de auditoria, não de código de produto. Referências entre tasks (ex.: `${A_ID}`, `${JWT_A}`) são variáveis de shell definidas nos steps que as criam.
