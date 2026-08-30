# Painel Admin Aflyo, Arquitetura (SP1)

Escopo deste documento: a fundacao do painel administrativo entregue no SP1.
O que fica para SP2 em diante esta marcado como "SP2+".

## Visao geral

```
  navegador da equipe
        |
        |  https://admin.aflyo.com.br  (app Vite estatica, projeto Vercel proprio)
        v
  +-------------------+        POST {resource,action,params}        +----------------------+
  |   app  admin/     |  ------------------------------------------> |  Edge Function       |
  |  (React + Vite)   |     Authorization: Bearer <jwt AAL2>        |  admin-api (Deno)    |
  +-------------------+  <------------------------------------------ |  RBAC no servidor    |
        |                    { data } | { error:{code,message} }    +----------+-----------+
        |  supabase-js (anon key, storageKey sb-admin-auth)                    | service_role
        v                                                                     v
  +------------------------------------------------------------------------------------------+
  |  Supabase  zuqaccivowbzdfrpgekz  (o MESMO projeto do app do cliente em src/)            |
  |  Postgres + RLS  |  Auth (MFA TOTP / AAL2)  |  Edge Functions                           |
  +------------------------------------------------------------------------------------------+
        ^
        |  supabase-js (storageKey sb-auth, sessao separada)
  +-------------------+
  |   app  src/       |   app do cliente, aflyo.com.br  (inalterado, exceto a retirada do /admin)
  +-------------------+
```

O painel e o app do cliente compartilham o projeto Supabase `zuqaccivowbzdfrpgekz`.
Nao ha banco separado. O isolamento vem de: bundle proprio, origem (dominio)
propria, sessao de auth propria (`storageKey` diferente) e um backend
privilegiado unico (`admin-api`).

## Por que app separada

- **Isolamento de bundle:** nenhuma linha do painel entra no JS que o cliente
  baixa, e vice-versa.
- **Isolamento de origem:** `admin.aflyo.com.br` e `aflyo.com.br` sao origens
  diferentes. Cookie, `localStorage` e Service Worker nao cruzam.
- **Deploy independente:** um projeto Vercel para cada app, com headers de
  seguranca proprios (ver `ADMIN_SECURITY.md`).
- **Sem npm workspaces:** `admin/` tem `package.json` e `node_modules` proprios.
  `npm install` / `npm run build` na raiz continuam iguais. `shared/` guarda o
  que os dois lados usam (catalogo de permissoes, tokens de design, tipos).

## Guarda de hostname (nao e fronteira de seguranca)

`admin/src/lib/hostname-guard.ts` (`isAllowedHost`) so evita que o app renderize
se servido de um host inesperado em producao. E cosmetico. A seguranca real esta
no `admin-api` (JWT + AAL2 + conta admin ativa + permissao) e na RLS do Postgres.

## Fluxo de autenticacao

Maquina de estados em `admin/src/context/AdminAuthContext.tsx`, `phase`:

1. `resolving` -> le `getSession()`.
2. sem sessao -> `anon` -> tela de Login (`signInWithPassword`, sem cadastro).
3. com sessao, `getAuthenticatorAssuranceLevel()`:
   - sem fator TOTP -> `needs_mfa_enroll` -> tela MfaEnroll (`mfa.enroll` +
     `challenge` + `verify`).
   - fator existe mas sessao e AAL1 -> `needs_mfa_challenge` -> tela MfaChallenge.
   - sessao AAL2 -> chama `session/whoami` na `admin-api`.
4. `whoami` responde a identidade -> `phase = 'ready'`, monta o shell e as rotas.
   `whoami` responde `forbidden` / `unauthenticated` -> `phase = 'not_admin'` ->
   tela "Sua conta nao tem acesso".

Nenhuma rota da area logada monta antes de `phase === 'ready'` (sem flash).

## RBAC

Fonte unica do catalogo em `shared/admin-permissions.ts` (TS, consumido pelo
front) e no seed da migration `20260829130000` (SQL, a autoridade em runtime).

Tabelas (migration `20260829130000_admin_rbac_foundation.sql`):

| Tabela | Papel |
|---|---|
| `admin_accounts` | conta admin: `user_id` (FK `auth.users`), `email`, `status` (`active`/`suspended`), `mfa_enrolled_at`, `created_by`, `suspended_at/reason` |
| `admin_roles` | os 4 cargos (`key`, `label`, `description`, `is_system`) |
| `admin_permissions` | as 49 permissoes (`key`, `grp`, `description`) |
| `admin_role_permissions` | matriz cargo -> permissao |
| `admin_user_roles` | cargos atribuidos a cada `admin_id` |

Funcoes de leitura (`security definer`, `search_path = public`):

- `admin_is_active()` -> a conta de `auth.uid()` existe e esta `active`.
- `admin_has_permission(perm text)` -> tem a permissao (SUPER_ADMIN passa em
  tudo, via `role_key = 'SUPER_ADMIN'`).
- `admin_current_account()` -> a linha de `admin_accounts` do usuario atual.
- `is_current_user_admin()` -> redefinida como alias de `admin_is_active()`, para
  o `UserContext`/`Sidebar` do app do cliente continuarem funcionando.

RLS: `select` liberado para quem e admin ativo; `insert`/`update`/`delete` sem
policy para `authenticated`. Toda escrita passa pelo `service_role` via
`admin-api`.

### Os 4 cargos

| Cargo | Para que serve | Estado no SP1 |
|---|---|---|
| SUPER_ADMIN | controle total | 1 conta: `contatogivaldo@outlook.com` (bootstrap) |
| SUPPORT | operacao de usuarios, promocoes, links, envios, suporte | criado, sem ninguem atribuido |
| DEVELOPER | logs, erros, jobs, filas, webhooks, integracoes, system health | criado, sem ninguem atribuido; fluxo de convite documentado em `ADMIN_OPERATIONS.md` |
| ANALYST | leitura de dashboard, analytics, metricas | criado, sem ninguem atribuido |

A matriz cargo -> permissao completa esta no seed da migration
`20260829130000` e em `shared/admin-permissions.ts` (`ROLE_PERMISSIONS`).

## admin-api

Edge Function Deno em `supabase/functions/admin-api/`, modularizada como a
`cakto-webhook`.

- **Protocolo:** `POST` unico. Corpo `{ resource, action, params }`. Resposta
  `200 { data }` ou erro `{ error: { code, message } }` com status HTTP
  correspondente. Header `X-Request-Id` em toda resposta (ecoa `x-request-id` do
  request ou gera um).
- **Pipeline (`rbac.ts`):** `Authorization: Bearer` -> valida o JWT ->
  exige `aal === 'aal2'` -> `admin_accounts.status = 'active'` -> resolve cargos
  e permissoes -> checa a permissao da rota (quando nao e `null`).
- **Codigos de erro (`_lib.ts`):** `unauthenticated` 401, `forbidden` 403,
  `not_found` 404, `conflict` 409, `validation` 422, `rate_limited` 429 (reservado,
  ver `ADMIN_SECURITY.md`), `internal` 500.
- **Erros das RPCs de mutacao** viram codigo/mensagem pt-BR em
  `handlers/_pg-errors.ts` (`mapPgError`), lendo `hint` / `errcode`.

### Acoes do SP1

| resource/action | permissao | o que faz |
|---|---|---|
| `ping/read` | `dashboard.read` | teste de vida |
| `session/whoami` | `null` (so auth + AAL2) | devolve `{ adminId, email, roleKeys, permissions }` |
| `dashboard/summary` | `dashboard.read` | chama `admin_dashboard_summary`, devolve `metrics` + `feed` + `labels` |
| `admins/list` | `admins.read` | lista `admin_accounts` + cargos |
| `admins/invite` | `admins.manage` | `admin_invite(email, roleKeys)` |
| `admins/suspend` | `admins.manage` | `admin_suspend(adminId, reason)` |
| `admins/reactivate` | `admins.manage` | `admin_reactivate(adminId)` |
| `roles/list` | `roles.read` | cargos + permissoes + matriz |
| `roles/assign` | `roles.manage` | `admin_assign_role(adminId, roleKey)` |
| `roles/revoke` | `roles.manage` | `admin_revoke_role(adminId, roleKey)` |
| `audit/list` | `audit.read` | `admin_audit_log` paginado (pageSize 25, filtros opcionais) |

## Audit Log append-only

Tabela `admin_audit_log` (migration `20260829130100`):

- Sem FK em `admin_id` (referencia soft): o log sobrevive a exclusao da conta.
  Coluna `admin_email` denormalizada, preenchida na escrita.
- Trigger `admin_audit_log_block_mutation` antes de `update`/`delete` lanca
  excecao. `revoke update, delete` de `authenticated`/`anon`.
- Helper `admin_audit_write(...)` (`security definer`, so `service_role`).
- Toda funcao de mutacao (`admin_invite`, `admin_suspend`, `admin_reactivate`,
  `admin_assign_role`, `admin_revoke_role`) aplica a mudanca E grava a auditoria
  no mesmo corpo, logo na mesma transacao. Falha ao auditar reverte tudo.

## Dashboard executivo

- SQL: `admin_dashboard_summary(p_from timestamptz, p_to timestamptz)` (migration
  `20260829130300`). Agrega usuarios, assinaturas, promocoes, links, cliques,
  envios e webhooks reais das tabelas do app.
- Metricas sem fonte no SP1 (`jobs_failed`, `jobs_pending`, `queue_depth`,
  `errors_24h`, `services_degraded`, `webhooks_failed`) vem
  `{ value: null, available: false }`. A UI mostra "Dados indisponiveis". Nunca
  numero inventado. Elas voltam quando a fonte existir (SP4/SP5).
- `feed`: unifica cadastros, promocoes, envios, webhooks e `admin_audit_log`.
- Tela: `admin/src/pages/Dashboard.tsx`, filtro de periodo (hoje/7d/30d/90d).

## Rotas do app admin/

| Rota | Tela | Permissao |
|---|---|---|
| `/` | Dashboard | `dashboard.read` |
| `/admins` | Administradores (lista, suspender, reativar) | `admins.read` (acoes: `admins.manage`) |
| `/admins/invite` | Convidar admin | `admins.manage` |
| `/roles` | Cargos (matriz + atribuir/revogar) | `roles.read` (mutacoes: `roles.manage`) |
| `/audit` | Auditoria (paginada, `?page=`) | `audit.read` |

Todo o resto do menu (Usuarios, Operacao, Suporte, Integracoes, Monitoramento,
Seguranca, Sistema) aparece como "Em breve", sem rota.

`RequirePermission` mostra um 403 visual quando falta a permissao, nao
redireciona.

## Migrations

O spec previa 3 migrations. O SP1 tem 4: a `20260829130300_admin_dashboard_summary.sql`
foi acrescentada so como agregacao de leitura para o Dashboard. E coerente com o
SP1 (leitura, sem escrita, sem impacto de escopo). As 4 sao aplicadas na ordem
numerica (ver `ADMIN_DEPLOYMENT.md`).

## SP1 x SP2+

**Entregue no SP1:** subdominio + app separada, auth com MFA AAL2, RBAC real no
servidor, Audit Log append-only, `admin-api` com os handlers acima, Dashboard com
dados reais, telas de Administradores/Cargos/Auditoria, retirada do `/admin`
antigo, 4 docs.

**SP2 em diante:** paginas de Usuarios, Operacao (promocoes/links/envios),
Suporte, Integracoes (observabilidade da Cakto, sem tocar plano/preco/cupom),
Observabilidade (jobs/filas/erros/logs/system health), Seguranca (risco, bloqueio
de IP), Sistema (feature flags, anuncios, settings), Equipe (mais fluxo de
convite). Mascaramento de segredo por cargo, rate limiting, impersonation, e as
metricas hoje `available:false`.
