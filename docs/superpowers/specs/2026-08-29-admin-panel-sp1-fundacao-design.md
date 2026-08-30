# Painel administrativo Aflyo, SP1: Fundação

Data: 2026-08-29
Status: design, aguardando revisão do usuário
Domínio alvo: https://admin.aflyo.com.br

## 1. Contexto

O Aflyo é uma SPA Vite 8 + React 19 + React Router 7 (TypeScript, Tailwind 3), 100% client-side, sem SSR, sem middleware, sem servidor Node. O backend é o Supabase inteiro: Postgres (RLS + funções `SECURITY DEFINER`), Auth (tokens em `localStorage`, sem cookie), Storage e Edge Functions em Deno. Deploy na Vercel como estático.

O `/admin` atual é uma única página ([src/pages/AdminDashboard.tsx](../../../src/pages/AdminDashboard.tsx), ~940 linhas), só leitura, montada como rota comum dentro do `<ProtectedRoute>` do app do cliente. A proteção real está apenas dentro de RPCs `get_admin_*` que fazem `IF NOT is_current_user_admin() THEN RAISE EXCEPTION`. O bundle do admin é baixado por qualquer usuário logado. As tabelas `admin_users` + `is_current_user_admin()` + as RPCs `get_admin_*` existem só em [supabase_admin_setup.sql](../../../supabase_admin_setup.sql) na raiz, não são migration, e o script promove 6 e-mails de teste a admin.

Este SP1 substitui isso por uma aplicação administrativa separada, com autenticação própria, MFA obrigatório, RBAC real, Audit Log e um Dashboard executivo com dados reais. Os demais subsistemas (usuários, operação, integrações, observabilidade, segurança, sistema, equipe) são SP2 em diante, cada um com seu próprio ciclo spec, plano, implementação.

## 2. Decisões travadas nesta conversa

| Tema | Decisão |
|---|---|
| Topologia | App **separada no mesmo repo**: nova pasta `admin/` (Vite app própria), projeto Vercel próprio em `admin.aflyo.com.br`, `shared/` para tipos e tokens. Sem npm workspaces. |
| Escopo do SP1 | **Só a Fundação.** Nada de telas de usuários, operação, etc. |
| MFA | **TOTP obrigatório** para todo admin desde o lançamento, via Supabase Auth AAL2. |
| SUPER_ADMIN inicial | **Somente `contatogivaldo@outlook.com`.** Qualquer outro admin é criado depois pela tela de Administradores. |
| Equipe inicial | Cargo **DEVELOPER** criado e com fluxo de convite documentado, sem ninguém atribuído. SUPPORT e ANALYST também criados e dormentes. |
| Backend privilegiado | Uma Edge Function `admin-api` como único ponto de entrada, com RBAC no servidor. Não usar só RLS. Não usar uma função por ação. |
| Sessão | Client Supabase próprio com `storageKey` distinto, mesmo projeto Supabase. Isolamento vem da origem separada. |
| Dashboard | Métrica sem fonte real renderiza "Dados indisponíveis", nunca número inventado. |
| `/admin` antigo | Removido do app do cliente. Vira um 404 dedicado, sem redirect permanente. `is_current_user_admin()` é mantida (redefinida). |
| Copy | Sem travessão (—) em nenhum texto de produto (UI, e-mails). |

## 3. Objetivos e não objetivos do SP1

### Entrega

1. Aplicação `admin/` servida em `admin.aflyo.com.br`, com guarda de hostname e guarda de autenticação sem flash de conteúdo protegido.
2. Autenticação administrativa com MFA TOTP obrigatório (AAL2).
3. RBAC: 4 cargos (`SUPER_ADMIN`, `SUPPORT`, `DEVELOPER`, `ANALYST`), catálogo completo de permissões da seção 11 do prompt mestre semeado, mapeamento cargo→permissão, validação no backend.
4. Edge Function `admin-api` com middleware de RBAC e escrita automática de Audit Log em toda mutação.
5. Audit Log append-only (`admin_audit_log`), imutável pela interface.
6. Dashboard executivo com dados reais e feed operacional mínimo.
7. Telas de Administração: Administradores (listar, convidar, suspender, reativar) e Cargos (listar cargos e permissões, atribuir e revogar cargo de um admin).
8. Retirada do `/admin` antigo do app do cliente, com salvamento do que for reaproveitável.
9. 3 migrations versionadas em `supabase/migrations/`.
10. 4 documentos: `ADMIN_ARCHITECTURE.md`, `ADMIN_DEPLOYMENT.md`, `ADMIN_OPERATIONS.md`, `ADMIN_SECURITY.md`.
11. Testes: RBAC, Audit, `admin_has_permission()`, guarda de hostname, disponibilidade de métricas.

### Fora do escopo (SP2 em diante)

Usuários (listagem, perfil, sessões, tags, notas, ações, impersonation), promoções, links, encurtador, envios, processamento, Cakto observabilidade, webhooks retry, Error Center, Logs estruturados, Jobs, Filas, System Health, Security Center, Risk Center, Blocked IPs, Rate Limit Monitor, Feature Flags, Comunicados, Configurações, Modo Manutenção, Tickets, Ocorrências, Analytics avançado.

O menu lateral já mostra essas seções, desabilitadas, com rótulo "Em breve". Nenhuma tela falsa, nenhum dado mock.

## 4. Estrutura de repositório

O app atual não se move. Adições:

```text
d:\ofertapro\
├── src/ ...                      web app atual, intocado exceto a retirada de /admin (seção 9)
├── admin/                        NOVA aplicação Vite
│   ├── package.json              deps próprias, node_modules próprio
│   ├── vite.config.ts
│   ├── tailwind.config.js        importa shared/design/tokens
│   ├── postcss.config.js
│   ├── tsconfig*.json            path alias @shared/* -> ../shared/*
│   ├── vercel.json               headers de segurança próprios (seção 8)
│   ├── index.html
│   ├── .env.example
│   └── src/
│       ├── main.tsx · App.tsx
│       ├── lib/
│       │   ├── supabase.ts       client com storageKey 'sb-admin-auth'
│       │   ├── admin-api.ts      fetch wrapper unico ({ resource, action, params })
│       │   └── hostname-guard.ts
│       ├── context/
│       │   ├── AdminAuthContext.tsx   sessao + conta admin + AAL + permissoes
│       │   └── ToastContext.tsx
│       ├── components/
│       │   ├── AdminLayout.tsx · Sidebar.tsx · Topbar.tsx · Breadcrumbs.tsx
│       │   ├── RequirePermission.tsx
│       │   └── ui/               DataTable, StatCard, EmptyState, ErrorState, Skeleton, Badge
│       ├── pages/
│       │   ├── Login.tsx · MfaEnroll.tsx · MfaChallenge.tsx · Unauthorized.tsx
│       │   ├── Dashboard.tsx
│       │   ├── admins/ AdminsList.tsx · InviteAdmin.tsx
│       │   └── roles/ RolesList.tsx
│       └── tests/
├── shared/                       NOVA pasta, sem build
│   ├── database.types.ts         tipos gerados do Supabase (supabase gen types)
│   ├── admin-permissions.ts      catalogo de permissoes e cargos como constante TS (fonte unica p/ front e seed)
│   ├── mask-secrets.ts           regex de mascaramento salvas do AdminDashboard antigo
│   └── design/tokens.ts          valores dos tokens Graphite/Cloud/Slate/Mint/Ice
└── supabase/
    ├── migrations/               3 migrations novas (seção 5)
    └── functions/admin-api/      Edge Function (seção 6)
```

`admin/` roda em porta Vite própria (5273). Não há workspace: `npm install` e `npm run build` do app atual seguem iguais.

Nota sobre `shared/design/tokens.ts`: o `tailwind.config.js` do app atual não passa a importar de `shared/` neste SP1 (evita regressão visual no cliente). O `tokens.ts` nasce como cópia fiel dos valores do [tailwind.config.js](../../../tailwind.config.js) atual e serve ao `admin/`. Unificar os dois configs fica para um chore futuro.

## 5. Banco de dados: 3 migrations versionadas

Todas em `supabase/migrations/`, idempotentes onde possível (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).

### 5.1 `20260829_1_admin_rbac_foundation.sql`

Tabelas (todas com RLS habilitado):

```text
admin_accounts
  id uuid pk default gen_random_uuid()
  user_id uuid not null unique references auth.users(id) on delete cascade
  email text not null
  status text not null default 'active' check (status in ('active','suspended'))
  mfa_enrolled_at timestamptz
  created_at timestamptz not null default now()
  created_by uuid references admin_accounts(id)
  suspended_at timestamptz
  suspended_reason text

admin_roles
  key text pk            -- SUPER_ADMIN | SUPPORT | DEVELOPER | ANALYST
  label text not null
  description text
  is_system boolean not null default true

admin_permissions
  key text pk            -- ex: dashboard.read
  grp text not null      -- overview | users | operation | monitoring | integrations | security | system | administration
  description text

admin_role_permissions
  role_key text not null references admin_roles(key) on delete cascade
  permission_key text not null references admin_permissions(key) on delete cascade
  primary key (role_key, permission_key)

admin_user_roles
  admin_id uuid not null references admin_accounts(id) on delete cascade
  role_key text not null references admin_roles(key) on delete cascade
  granted_at timestamptz not null default now()
  granted_by uuid references admin_accounts(id)
  primary key (admin_id, role_key)
```

Funções (`SECURITY DEFINER`, `SET search_path = public`, `STABLE`):

- `admin_current_account() returns admin_accounts` — linha de `admin_accounts` de `auth.uid()` com `status = 'active'`, ou nulo.
- `admin_is_active() returns boolean` — `admin_current_account() is not null`.
- `admin_has_permission(perm text) returns boolean` — true se o admin ativo tem um cargo que concede `perm`. SUPER_ADMIN é semeado com todas as permissões, então não precisa de caso especial no código, mas a função também retorna true direto se o admin tem o cargo `SUPER_ADMIN` (defesa contra seed incompleto).
- `is_current_user_admin() returns boolean` — **redefinida** para `SELECT admin_is_active()`. Mantém [src/context/UserContext.tsx](../../../src/context/UserContext.tsx) e a Sidebar do cliente funcionando durante a transição.

Seed:

- 4 cargos.
- Catálogo completo de permissões (seção 11 do prompt mestre), agrupadas por `grp`. Lista canônica em `shared/admin-permissions.ts`; a migration replica os mesmos valores.
- Mapeamento cargo→permissão (matriz na seção 7.3).

RLS:

- `admin_accounts`, `admin_user_roles`: `SELECT` para `admin_is_active()`. `INSERT/UPDATE/DELETE` negados a `authenticated` (só `service_role` via `admin-api`).
- `admin_roles`, `admin_permissions`, `admin_role_permissions`: `SELECT` para `admin_is_active()`. Escrita negada a `authenticated` (cargos são de sistema no SP1; edição de cargo é SP8).

DROP das RPCs antigas: `get_admin_dashboard_stats`, `get_admin_recent_users`, `get_admin_recent_offers`, `get_admin_recent_dispatches`, `get_admin_channels`, `get_admin_api_keys`. Ver ordem de deploy na seção 12 (o app cliente com `AdminDashboard` ainda no ar entre a migration e o redeploy quebra essas chamadas, mas só para admins e a tela está sendo desligada).

### 5.2 `20260829_2_admin_audit_log.sql`

```text
admin_audit_log
  id uuid pk default gen_random_uuid()
  admin_id uuid references admin_accounts(id)
  action text not null            -- ex: ADMIN_INVITED, ROLE_ASSIGNED
  entity_type text
  entity_id text
  before jsonb
  after jsonb
  reason text
  ip inet
  user_agent text
  request_id text
  created_at timestamptz not null default now()

index admin_audit_log_created_at_idx on (created_at desc)
index admin_audit_log_admin_id_idx on (admin_id)
index admin_audit_log_action_idx on (action)
```

Imutável:

- RLS: `SELECT` para `admin_has_permission('audit.read')`. Sem policy de `INSERT/UPDATE/DELETE` para `authenticated`.
- Trigger `BEFORE UPDATE OR DELETE` que sempre faz `RAISE EXCEPTION 'admin_audit_log is append-only'`.
- `REVOKE UPDATE, DELETE ON admin_audit_log FROM authenticated, anon`.
- Escrita só via `admin_audit_write(...)` (`SECURITY DEFINER`) chamada pela `admin-api` com `service_role`, ou `INSERT` direto com `service_role`.

Retenção: sem prune no SP1 (Audit Log é registro legal; política de retenção é decisão futura).

### 5.3 `20260829_3_admin_bootstrap_superadmin.sql`

```sql
do $$
declare v_uid uuid; v_admin uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'contatogivaldo@outlook.com';
  if v_uid is null then
    raise notice 'bootstrap: auth.users para contatogivaldo@outlook.com nao encontrado. Rode de novo apos a conta existir.';
    return;
  end if;
  insert into admin_accounts (user_id, email, status)
    values (v_uid, 'contatogivaldo@outlook.com', 'active')
    on conflict (user_id) do update set status = 'active'
    returning id into v_admin;
  insert into admin_user_roles (admin_id, role_key) values (v_admin, 'SUPER_ADMIN')
    on conflict do nothing;
end $$;

-- limpeza do seed antigo de e-mails de teste
delete from admin_accounts a
  where a.email in (
    'qa.teste1@gmail.com','kaikfarias051@gmail.com','testeonboarding@teste.com',
    'qa.ofertapro.162606@gmail.com','conta@teste.com'
  );
-- 'contatogivaldo@outlook.com' estava na lista antiga e permanece, agora como SUPER_ADMIN.

drop table if exists public.admin_users cascade;
```

`admin_users` (a tabela solta antiga) é dropada aqui, depois que `admin_accounts` a substitui e `is_current_user_admin()` foi redefinida em 5.1.

## 6. Edge Function `admin-api`

```text
supabase/functions/admin-api/
├── index.ts        recebe POST { resource, action, params }, roteia, formata erro
├── rbac.ts         auth + carga do admin + checagem de AAL2 + checagem de permissao
├── audit.ts        withAudit(): grava admin_audit_log antes de responder sucesso em mutacao
├── _lib.ts         cors (origin travado), json helpers, service client, getRequestContext (ip, ua, request_id)
└── handlers/
    ├── dashboard.ts   summary
    ├── admins.ts      list · invite · suspend · reactivate
    ├── roles.ts       list · assign · revoke
    └── audit.ts       list
```

### 6.1 Protocolo

`POST {VITE_ADMIN_API_URL}` com header `Authorization: Bearer <access_token>` e corpo:

```json
{ "resource": "admins", "action": "invite", "params": { "email": "x@y.com", "roleKeys": ["DEVELOPER"] } }
```

Resposta de sucesso: `200` com `{ "data": <payload> }`.
Resposta de erro: HTTP `401 | 403 | 404 | 409 | 422 | 429 | 500` com:

```json
{ "error": { "code": "forbidden", "message": "..." } }
```

Códigos: `unauthenticated` (401), `forbidden` (403, inclui falta de AAL2 e falta de permissão), `not_found` (404), `conflict` (409), `validation` (422), `rate_limited` (429, reservado, ver seção 8), `internal` (500).

### 6.2 Pipeline por request (`rbac.ts`)

1. Sem header `Authorization` → `401 unauthenticated`.
2. `supabase.auth.getUser(jwt)` inválido → `401`.
3. Payload do JWT decodificado sem claim `aal = 'aal2'` → `403 forbidden` (`mfa_required`). Leitura também exige AAL2.
4. `admin_accounts` do usuário ausente ou `status != 'active'` → `403 forbidden`.
5. Handler declara a permissão exigida; `admin_has_permission(perm)` false → `403 forbidden`.
6. Handler executa.
   - **Mutações são implementadas como uma única função plpgsql `SECURITY DEFINER`** (ex: `admin_invite(...)`, `admin_assign_role(...)`) que aplica a mudança **e** insere em `admin_audit_log` no mesmo corpo, ou seja, na mesma transação. Não há caminho de mutação que altere estado sem gravar auditoria; se o `INSERT` de auditoria falha, a transação inteira reverte e a `admin-api` responde `500` (falha fechada). O `audit.ts` monta o `before`/`after`/`reason`/contexto e passa para a função.
   - `request_id`: a `admin-api` lê o header `X-Request-Id` do cliente; se ausente, gera um UUID. Vai no contexto de auditoria e na resposta (`X-Request-Id`).

### 6.3 Ações do SP1

| resource/action | permissão | efeito | auditoria |
|---|---|---|---|
| `dashboard/summary` | `dashboard.read` | agrega métricas e feed (seção 7.4) | não (leitura) |
| `admins/list` | `admins.read` | lista admins com cargos, status, MFA, último login | não |
| `admins/invite` | `admins.manage` | exige `auth.users` já existente para o e-mail; cria `admin_accounts` + cargos; erro `not_found` se não houver conta; erro `conflict` se já for admin | `ADMIN_INVITED` |
| `admins/suspend` | `admins.manage` | `status='suspended'` + motivo; bloqueia suspender a si mesmo e o último SUPER_ADMIN ativo | `ADMIN_SUSPENDED` |
| `admins/reactivate` | `admins.manage` | `status='active'` | `ADMIN_REACTIVATED` |
| `roles/list` | `roles.read` | cargos + permissões de cada + catálogo de permissões | não |
| `roles/assign` | `roles.manage` | atribui cargo a um admin; só SUPER_ADMIN pode atribuir SUPER_ADMIN | `ROLE_ASSIGNED` |
| `roles/revoke` | `roles.manage` | revoga cargo; bloqueia remover o último SUPER_ADMIN | `ROLE_REVOKED` |
| `audit/list` | `audit.read` | Audit Log paginado, filtros `action`, `entityType`, `adminId`, `from`, `to` | não |

Guardas transversais: allowlist explícita de campos por handler (sem mass assignment); todo id de entidade revalidado no servidor (sem IDOR); nenhum handler do SP1 faz fetch externo (sem SSRF); `invite` nunca cria conta de autenticação nem mexe em senha.

## 7. RBAC

### 7.1 Cargos

| key | label | uso |
|---|---|---|
| `SUPER_ADMIN` | Super Admin | controle total |
| `SUPPORT` | Suporte | operação de usuários, promoções, links, envios, suporte |
| `DEVELOPER` | Desenvolvedor | logs, erros, jobs, filas, webhooks, integrações, system health |
| `ANALYST` | Analista | leitura de Dashboard, Analytics, métricas |

### 7.2 Catálogo de permissões (semeado inteiro, fonte: `shared/admin-permissions.ts`)

`overview`: `dashboard.read`, `analytics.read`
`users`: `users.read`, `users.suspend`, `users.reactivate`, `users.sessions.read`, `users.sessions.revoke`, `users.notes.manage`, `users.tags.manage`, `users.impersonate`
`operation`: `promotions.read`, `promotions.retry`, `promotions.cancel`, `links.read`, `links.test`, `links.retry`, `links.disable`, `shortener.read`, `shortener.manage`, `sends.read`, `sends.retry`, `sends.cancel`
`monitoring`: `jobs.read`, `jobs.retry`, `jobs.cancel`, `queues.read`, `errors.read`, `errors.manage`, `logs.read`, `system_health.read`
`integrations`: `cakto.read`, `cakto.sync`, `webhooks.read`, `webhooks.retry`
`security`: `security.read`, `security.block_ip`, `risk.read`, `risk.manage`, `audit.read`
`system`: `feature_flags.read`, `feature_flags.manage`, `announcements.read`, `announcements.manage`, `system_settings.read`, `system_settings.manage`
`administration`: `admins.read`, `admins.manage`, `roles.read`, `roles.manage`

Só estas têm tela no SP1: `dashboard.read`, `admins.read`, `admins.manage`, `roles.read`, `roles.manage`, `audit.read`. O resto fica semeado e dormente.

### 7.3 Matriz cargo→permissão semeada

- **SUPER_ADMIN**: todas.
- **SUPPORT**: `dashboard.read`, `users.read`, `users.suspend`, `users.reactivate`, `users.sessions.read`, `users.sessions.revoke`, `users.notes.manage`, `users.tags.manage`, `promotions.read`, `promotions.retry`, `promotions.cancel`, `links.read`, `links.test`, `links.retry`, `links.disable`, `shortener.read`, `sends.read`, `sends.retry`, `sends.cancel`, `cakto.read`, `webhooks.read`, `audit.read`. Sem `users.impersonate` no seed (concessão explícita futura, decisão de segurança).
- **DEVELOPER**: `dashboard.read`, `logs.read`, `errors.read`, `errors.manage`, `jobs.read`, `jobs.retry`, `jobs.cancel`, `queues.read`, `webhooks.read`, `webhooks.retry`, `cakto.read`, `cakto.sync`, `system_health.read`, `audit.read`.
- **ANALYST**: `dashboard.read`, `analytics.read`, `system_health.read`.

### 7.4 Dashboard executivo, dados do SP1

Ação `dashboard/summary`, parâmetro `range` (`today | 7d | 30d | 90d | custom` + `from`/`to`). Cada métrica no retorno é `{ key, label, value: number | null, available: boolean }`.

| Métrica | Fonte | available |
|---|---|---|
| Usuários totais | `profiles` count | true |
| Usuários ativos | `profiles` where `account_status in ('active','trialing')` | true |
| Novos usuários (hoje, 7d, 30d) | `profiles.created_at` | true |
| Assinaturas ativas | `subscriptions` where `status='active'` | true |
| Assinaturas canceladas | `subscriptions` where `status in ('canceled','expired')` | true |
| Sincronizações problemáticas | `webhook_events` sem efeito esperado no período (heurística: `subscription_*` sem `subscriptions` correspondente) | true |
| Promoções criadas | `offers.created_at` no range | true |
| Links processados | `offers` com `short_code` não nulo | true |
| Cliques | `clicks` no range | true |
| Envios | `history` no range | true |
| Taxa de sucesso de envio | `history.status` (`success` vs total) | true |
| Webhooks falhos | ver nota | ver nota |
| Jobs falhos / pendentes, queue depth | não existe fila/jobs | **false** |
| Serviços degradados / System Health | SP5 | **false** |
| Erros últimas 24h | Error Center é SP5 | **false** |

Nota webhooks falhos: `webhook_events` só grava eventos processados com sucesso (o dispatcher apaga o registro em erro para permitir retry do Cakto). Então "webhooks recebidos no período" tem dado real, mas "webhooks falhos" fica `available: false` no SP1 com observação. Corrigir a instrumentação do webhook é SP4.

Feed operacional (versão mínima, últimos N eventos, cada um com link quando houver tela): cadastros (`profiles`), promoções criadas (`offers`), envios (`history`), webhooks recebidos (`webhook_events`), ações de admin (`admin_audit_log`).

## 8. Segurança do app admin

- **Hostname**: em `import.meta.env.PROD`, se `location.hostname !== ADMIN_HOSTNAME` (`admin.aflyo.com.br`, configurável por env `VITE_ADMIN_HOSTNAME`), renderiza só a tela `Unauthorized`, sem montar rotas nem chamar a API. Em dev, liberado. **Não é mecanismo de segurança** (seção 7 do prompt mestre), é só higiene de roteamento; a proteção real é AAL2 + RBAC no `admin-api`.
- **Sem flash de conteúdo protegido**: `AdminAuthContext` só libera o `children` do layout depois de resolver sessão + `admin_accounts` + AAL2. Enquanto resolve, loader. Falha em qualquer etapa → `Login` ou `Unauthorized`, nunca o shell.
- **Sem cadastro no app admin**: não há rota de signup nem "criar conta". O admin precisa já ter uma conta Aflyo (criada no app do cliente); o acesso administrativo é concedido por `admins/invite`. O `Login.tsx` do `admin/` só tem entrar e recuperar senha.
- **Headers** (`admin/vercel.json`, todos enforcing, não Report-Only):
  - `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
  - `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://zuqaccivowbzdfrpgekz.supabase.co wss://zuqaccivowbzdfrpgekz.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`
- **CORS do `admin-api`**: `Access-Control-Allow-Origin` fixo em `https://admin.aflyo.com.br` (mais `http://localhost:5273` quando `Deno.env.get('ENVIRONMENT') === 'dev'`). Nunca `*`.
- **CSRF**: não se aplica. A `admin-api` só aceita `POST` com `Authorization: Bearer` (não usa cookie); request sem esse header é `401`.
- **Escalada de privilégio**: `roles/assign` de SUPER_ADMIN só por SUPER_ADMIN; `roles/revoke` e `admins/suspend` não podem deixar o sistema sem SUPER_ADMIN ativo; ninguém suspende a si mesmo.
- **Segredos**: nenhuma tela do SP1 exibe token, chave ou segredo. `shared/mask-secrets.ts` fica pronto para SP2+.
- **Rate limiting**: fora do escopo do SP1. Depende da plataforma Supabase e do gate AAL2 + RBAC. Monitor e limites próprios são SP6. Código do `admin-api` deixa o ponto de extensão marcado (`// TODO SP6: rate limit`), e o código `429 rate_limited` já existe no contrato.
- **`localStorage`**: o client admin usa `storageKey: 'sb-admin-auth'`. Como a origem é separada, o storage já não colide com o app do cliente. Tokens de admin não vão para nenhum lugar além do storage padrão do supabase-js nessa origem.

## 9. Retirada do `/admin` antigo (app do cliente)

Mudanças em `src/` (mínimas, blast radius controlado):

1. [src/App.tsx](../../../src/App.tsx): remover `import AdminDashboard`, remover `<Route path="/admin" ... />` de dentro do `<ProtectedRoute>`, adicionar `<Route path="/admin" element={<AdminMoved />} />` fora do bloco protegido (componente 404 dedicado: "Este endereço saiu do ar. O painel administrativo fica em admin.aflyo.com.br", sem link clicável para não gerar expectativa de acesso). Sem redirect permanente.
2. [src/components/Sidebar.tsx](../../../src/components/Sidebar.tsx): remover o item condicional `isAdmin` que aponta para `/admin` (linha ~39).
3. Deletar [src/pages/AdminDashboard.tsx](../../../src/pages/AdminDashboard.tsx).
4. Salvar antes de deletar: as regex de mascaramento de segredo (webhook Discord, `bot_token` Telegram) vão para `shared/mask-secrets.ts` com comentário citando a origem.
5. **Não mexer** em `UserContext.isAdmin` nem no bypass de paywall do `ProtectedRoute` que usa `isAdmin`. `is_current_user_admin()` continua existindo (redefinida na migration 5.1), então essas partes seguem funcionando. Removê-las é limpeza futura, não do SP1.
6. `git grep` por `/admin`, `AdminDashboard`, `get_admin_` em `src/` para garantir que não sobra import morto.

Verificação: `npm run build` e `npm run lint` do app do cliente passam sem o `/admin`.

## 10. Testes

O repositório não tem infra de teste hoje. O SP1 adiciona:

- `admin/`: `vitest` + `@testing-library/react` + `jsdom`, script `test` no `admin/package.json`.
- `supabase/functions/admin-api/`: testes `*_test.ts` para `deno test` (já há `deno.lock` e funções Deno no repo).

Casos mínimos:

| Alvo | Caso |
|---|---|
| `admin-api` RBAC | sem `Authorization` → 401 |
| | JWT de usuário comum (não admin) → 403 |
| | admin ativo sem AAL2 → 403 |
| | admin com AAL2 mas sem a permissão do handler → 403 |
| | admin com a permissão → 200 |
| `admin-api` Audit | `admins/invite` bem sucedido grava exatamente 1 linha em `admin_audit_log` com `before` nulo e `after` preenchido |
| | falha ao gravar auditoria aborta a mutação (resposta 500, nenhuma linha em `admin_accounts`) |
| SQL `admin_has_permission()` | SUPER_ADMIN → true para toda permissão do catálogo |
| | ANALYST → true só para `dashboard.read`, `analytics.read`, `system_health.read` |
| | DEVELOPER → false para `users.suspend`, true para `jobs.retry` |
| Guarda de hostname | `PROD` + hostname errado → `Unauthorized`, `admin-api` não é chamada |
| | não `PROD` → libera |
| `dashboard/summary` | métricas sem fonte (`jobs`, `queue depth`, `system health`) vêm `available: false` |
| | guarda: chamada sem `dashboard.read` → 403 |
| Guarda última conta | `roles/revoke` de SUPER_ADMIN do único SUPER_ADMIN ativo → 409 |

O app do cliente não ganha testes no SP1 (a mudança lá é remoção). Só a verificação de build e lint.

## 11. Documentação (4 arquivos na raiz)

- **`ADMIN_ARCHITECTURE.md`**: topologia (app separada, mesma base Supabase), `admin.aflyo.com.br`, fluxo de auth, RBAC (cargos, permissões, matriz), sessão, ausência de cookie, tabelas, rotas do `admin/`, contrato do `admin-api`, o que é SP1 e o que é SP2+.
- **`ADMIN_DEPLOYMENT.md`**: passo a passo de DNS (CNAME `admin`), projeto Vercel apontando para `admin/`, env vars, deploy do `admin-api` (`supabase functions deploy admin-api`), ordem de aplicação das 3 migrations, confirmação de MFA TOTP habilitado no projeto, confirmação da conta `auth.users` de `contatogivaldo@outlook.com`, checklist de validação pós deploy.
- **`ADMIN_OPERATIONS.md`**: como convidar um admin (a pessoa cria conta no Aflyo primeiro, depois `admins/invite`), como atribuir o cargo DEVELOPER, como suspender/reativar, como ler o Audit Log, como interpretar o Dashboard. Runbooks de investigação de usuário/promoção/link/envio ficam com placeholder "SP2+".
- **`ADMIN_SECURITY.md`**: RBAC, sessão, MFA (enroll, challenge, AAL2 no `admin-api`), Audit Log append-only, segredos, proteção da API (401/403, allowlist de campos, guardas de escalada), SSRF (não aplicável no SP1, regra para SP2+), LGPD (minimização, mascaramento futuro por cargo), resposta a incidente (suspender admin, revogar cargo).

## 12. Ordem de deploy e configuração externa

Ordem:

1. Aplicar migrations `20260829_1`, `_2`, `_3` no Supabase.
2. `supabase functions deploy admin-api` com secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ENVIRONMENT`).
3. Criar projeto Vercel para `admin/`, definir env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_API_URL`, `VITE_ADMIN_HOSTNAME`), deploy.
4. DNS: `CNAME admin` para o alvo Vercel. Vincular domínio `admin.aflyo.com.br` ao projeto.
5. Redeploy do app do cliente com o `/admin` removido.

Passos que dependem do usuário (documentados no `ADMIN_DEPLOYMENT.md`, não executados pelo assistente):

- DNS.
- Criação do projeto Vercel e binding do domínio.
- Confirmar MFA TOTP habilitado no Supabase Auth (padrão, mas verificar).
- Garantir que existe conta `auth.users` para `contatogivaldo@outlook.com` antes de rodar a migration `_3` (senão ela só emite `NOTICE` e o vínculo de SUPER_ADMIN precisa ser refeito depois).

## 13. Ambiente de desenvolvimento local

- `npm --prefix admin install && npm --prefix admin run dev` sobe o `admin/` em `http://localhost:5273`.
- `supabase functions serve admin-api` local; `admin/.env` aponta `VITE_ADMIN_API_URL` para `http://127.0.0.1:54321/functions/v1/admin-api`.
- Guarda de hostname desligada fora de `PROD`.
- Opcional: entrada `127.0.0.1 admin.localhost` no hosts para exercitar o fluxo real de subdomínio; documentado no `ADMIN_DEPLOYMENT.md`.
- Login local: usar uma conta `auth.users` real do projeto e inserir a linha `admin_accounts` + cargo à mão (ou rodar a migration `_3` com o e-mail local). Fluxo descrito no `ADMIN_OPERATIONS.md`.

## 14. Riscos e mitigações

| Risco | Mitigação no SP1 |
|---|---|
| Estado real de `admin_users` em produção é incerto | Migration `_1` cria `admin_accounts` do zero; `_3` migra o que interessa e dropa `admin_users`. Nada depende do estado anterior. |
| App cliente com `AdminDashboard` no ar entre migration e redeploy chama `get_admin_*` dropadas | Só admins viam a tela; ela está sendo desligada; erro é silencioso (toast). Ordem de deploy minimiza a janela. |
| `contatogivaldo@outlook.com` sem conta `auth.users` na hora da migration | Migration não falha, emite `NOTICE`; `ADMIN_DEPLOYMENT.md` manda verificar antes; recuperável rodando de novo. |
| Recharts ou libs puxando `eval` e quebrando o CSP estrito | Recharts é SVG puro, sem `eval`. CI/preview valida. Sem `unsafe-eval` no CSP. |
| Bloqueio total (nenhum SUPER_ADMIN) por erro operacional | `roles/revoke` e `admins/suspend` recusam deixar zero SUPER_ADMIN ativo; recuperação manual via SQL documentada no `ADMIN_SECURITY.md`. |
| Divergência entre catálogo de permissões no TS e no seed SQL | `shared/admin-permissions.ts` é a fonte declarada; teste compara a lista TS com o retorno de `roles/list`. |

## 15. Critérios de aceite do SP1

- [ ] `admin.aflyo.com.br` carrega o app admin; hostname errado em produção mostra `Unauthorized` sem montar o shell.
- [ ] Usuário comum autenticado no Aflyo que abre o app admin não vê nenhuma informação administrativa (barrado em auth/`admin_accounts`).
- [ ] Login admin exige MFA TOTP; sem AAL2 nenhuma ação da `admin-api` responde 200.
- [ ] `admin-api` valida auth, conta ativa, AAL2, cargo e permissão no servidor; usuário comum recebe 401/403.
- [ ] RBAC funcional: 4 cargos semeados, catálogo completo de permissões, matriz aplicada.
- [ ] Toda mutação da `admin-api` gera uma linha em `admin_audit_log`; a tabela não é editável nem apagável pela interface.
- [ ] `/admin` antigo removido do app do cliente; `AdminDashboard.tsx` deletado; build e lint do cliente passam.
- [ ] Dashboard mostra dados reais; métricas sem fonte aparecem como "Dados indisponíveis".
- [ ] Telas Administradores (listar, convidar, suspender, reativar) e Cargos (listar, atribuir, revogar) funcionam com as guardas descritas.
- [ ] Nenhuma secret exposta; nenhum dado mock apresentado como real.
- [ ] Cakto não foi tocada; nada de plano, preço ou cupom no admin.
- [ ] 3 migrations versionadas em `supabase/migrations/`.
- [ ] 4 documentos criados.
- [ ] Testes de RBAC, Audit, `admin_has_permission`, hostname e disponibilidade de métrica passam.
- [ ] `npm --prefix admin run build` passa; `deno check` da função passa.

## 16. Questões em aberto

Nenhuma. As três decisões de arquitetura, o SUPER_ADMIN inicial e a equipe inicial foram definidos nesta conversa.
