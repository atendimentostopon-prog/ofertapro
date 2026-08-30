# Painel Admin Aflyo, SP1 (Fundação) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar a fundação do painel administrativo do Aflyo como aplicação separada em `admin.aflyo.com.br`: autenticação com MFA obrigatório, RBAC real no backend, Audit Log imutável, Dashboard executivo com dados reais, e retirada do `/admin` antigo.

**Architecture:** Nova app Vite em `admin/` (bundle e origem separados do app do cliente em `src/`), servida por projeto Vercel próprio. Toda operação privilegiada passa por uma Edge Function Deno `admin-api` que valida JWT, AAL2, conta admin ativa e permissão antes de tocar dados com `service_role`. Mutações são funções plpgsql `SECURITY DEFINER` que aplicam a mudança e gravam `admin_audit_log` na mesma transação. `shared/` guarda o que os dois lados usam (catálogo de permissões, tokens de design, tipos).

**Tech Stack:** React 19.2, Vite 8, React Router 7.18, Tailwind 3.4, TypeScript ~6.0, lucide-react 1.14, recharts 3.8, Vitest + @testing-library/react + jsdom (novo em `admin/`). Edge Function: Deno, `https://deno.land/std@0.168.0/http/server.ts`, `https://esm.sh/@supabase/supabase-js@2`. Supabase Postgres (migrations em `supabase/migrations/`).

## Global Constraints

- **Spec de referência:** `docs/superpowers/specs/2026-08-29-admin-panel-sp1-fundacao-design.md`. Em conflito, o spec vence.
- **Sem npm workspaces.** `admin/` tem `package.json` e `node_modules` próprios. `npm install`/`npm run build` do app raiz continuam iguais.
- **Sem dependência nova pesada:** nada de react-query, nada de biblioteca de data-grid. `DataTable` é componente próprio.
- **Versões casam com o app raiz:** `react@^19.2.5`, `react-dom@^19.2.5`, `react-router-dom@^7.18.2`, `tailwindcss@^3.4.19`, `typescript@~6.0.2`, `lucide-react@^1.14.0`, `recharts@^3.8.1`, `@supabase/supabase-js@^2.105.4`, `vite@^8.0.10`, `@vitejs/plugin-react@^6.0.1`.
- **Copy sem travessão (—)** em qualquer texto de UI, e-mail ou doc de produto. Usar vírgula, parênteses ou dois pontos.
- **Textos de UI em pt-BR.**
- **CORS do `admin-api`:** `Access-Control-Allow-Origin` fixo (`https://admin.aflyo.com.br`, mais `http://localhost:5273` quando `Deno.env.get('ENVIRONMENT') === 'dev'`). Nunca `*`.
- **Toda ação da `admin-api` exige AAL2.** Leitura inclusive.
- **Toda mutação grava `admin_audit_log` na mesma transação.** Não existe caminho de escrita sem auditoria; falha ao auditar reverte tudo (resposta 500).
- **Dashboard:** métrica sem fonte real vem `available: false` e a UI mostra "Dados indisponíveis". Nunca número inventado.
- **Migrations idempotentes** onde possível (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE`).
- **Não tocar** `UserContext.isAdmin` nem o bypass de paywall em `src/components/ProtectedRoute.tsx`. `is_current_user_admin()` continua existindo (redefinida na Task 2).
- **Cakto intocada.** Nenhuma tela de plano, preço ou cupom.
- **Commits frequentes:** cada task termina com commit próprio. Mensagens em pt-BR, prefixo convencional (`feat`, `chore`, `docs`, `test`), com trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- **Branch:** `feat/admin-panel-sp1` (já criada).

---

## File Structure

### Novos: `shared/` (sem build, consumido por `admin/` e pelas migrations como referência)

| Arquivo | Responsabilidade |
|---|---|
| `shared/admin-permissions.ts` | Fonte única do catálogo de permissões, dos 4 cargos e da matriz cargo→permissão. Exporta constantes tipadas. |
| `shared/design/tokens.ts` | Valores dos tokens de cor e tipografia (cópia fiel de `tailwind.config.js` do app raiz). |
| `shared/mask-secrets.ts` | Regex de mascaramento de segredo salvas do `AdminDashboard` antigo (webhook Discord, `bot_token` Telegram). Não usado por tela no SP1; fica pronto para SP2. |
| `shared/database.types.ts` | Tipos gerados do Supabase (`supabase gen types typescript`). Stub inicial na Task 1, regenerado após as migrations. |

### Novos: `supabase/migrations/` (4 arquivos)

O spec previa 3 migrations; o plano acrescenta uma 4a só de agregação de leitura para o Dashboard (`20260829130300`). Sem impacto no escopo; registrado no `ADMIN_ARCHITECTURE.md` (Task 17).

Numeração `20260829130xxx` fica **depois** da última migration já versionada (`20260829120000_subscriptions_installments.sql`), evitando `--include-all` no `supabase db push`.

Os arquivos de asserção psql ficam em **`supabase/tests/manual/`** (não em `supabase/migrations/`, senão o CLI os trataria como migrations e os executaria no `db reset`/`db push`). São rodados à mão com `psql -f` depois de um `supabase db reset`.

| Arquivo | Responsabilidade |
|---|---|
| `20260829130000_admin_rbac_foundation.sql` | Tabelas `admin_accounts`, `admin_roles`, `admin_permissions`, `admin_role_permissions`, `admin_user_roles`. Funções de leitura (`admin_current_account`, `admin_is_active`, `admin_has_permission`). Redefine `is_current_user_admin()`. Seed de cargos, permissões e matriz. RLS. |
| `20260829130100_admin_audit_and_mutations.sql` | Tabela `admin_audit_log` (append-only: trigger anti-update/delete + revokes). Helper `admin_audit_write`. Funções de mutação `admin_invite`, `admin_suspend`, `admin_reactivate`, `admin_assign_role`, `admin_revoke_role` (mudança + auditoria atômicas). |
| `20260829130200_admin_bootstrap_and_cleanup.sql` | Bootstrap de `contatogivaldo@outlook.com` como `SUPER_ADMIN`. Limpa e-mails de teste. `DROP TABLE admin_users`. `DROP FUNCTION get_admin_*`. |
| `20260829130300_admin_dashboard_summary.sql` | `admin_dashboard_summary(p_from, p_to)`: agregação do Dashboard executivo, com métricas sem fonte marcadas `available:false`. |

### Novos: `supabase/functions/admin-api/`

| Arquivo | Responsabilidade |
|---|---|
| `index.ts` | `serve()`: CORS preflight, parse de `{ resource, action, params }`, roteia para handler, formata erro no envelope padrão. |
| `_lib.ts` | `corsHeaders(req)`, `json(data, status, req)`, `errorResponse(code, message, req)`, `serviceClient()`, `getRequestContext(req)` (ip, user agent, request_id). |
| `rbac.ts` | `authorize(req, deps)`: pipeline auth → AAL2 → conta ativa → retorna `AdminIdentity`. `requirePermission(identity, perm, deps)`. Lógica pura, recebe `deps` injetável (testável sem Supabase). |
| `audit.ts` | `type AuditContext` (`{ ip, user_agent, request_id }`) e o mapa `ACTION_NAMES`. O contexto é computado uma vez no `index.ts` (`getRequestContext`) e passado ao handler / às RPCs de mutação. |
| `handlers/dashboard.ts` | `summary(params, ctx)`: chama `admin_dashboard_summary` e formata. |
| `handlers/admins.ts` | `list`, `invite`, `suspend`, `reactivate`. |
| `handlers/roles.ts` | `list`, `assign`, `revoke`. |
| `handlers/audit.ts` | `list` (paginado). |
| `rbac_test.ts` | Testes Deno de `authorize`/`requirePermission` com `deps` fake. |
| `handlers_test.ts` | Testes Deno de roteamento e de mapeamento de erro. |

### Novos: `admin/` (app Vite)

| Arquivo | Responsabilidade |
|---|---|
| `admin/package.json`, `admin/vite.config.ts`, `admin/tailwind.config.js`, `admin/postcss.config.js`, `admin/tsconfig.json`, `admin/tsconfig.node.json`, `admin/index.html`, `admin/.env.example`, `admin/vitest.config.ts`, `admin/src/vitest.setup.ts` | Scaffold da app e do runner de teste. |
| `admin/vercel.json` | Rewrite SPA + headers de segurança enforcing (HSTS, CSP estrito, `X-Frame-Options: DENY`, etc). |
| `admin/src/main.tsx`, `admin/src/App.tsx`, `admin/src/index.css` | Entry, roteamento, estilos base. |
| `admin/src/lib/env.ts` | Leitura tipada de `import.meta.env` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_API_URL`, `VITE_ADMIN_HOSTNAME`). |
| `admin/src/lib/hostname-guard.ts` | `isAllowedHost(hostname, isProd, allowedHost): boolean`. |
| `admin/src/lib/supabase.ts` | Client Supabase com `storageKey: 'sb-admin-auth'`. |
| `admin/src/lib/admin-api.ts` | `callAdminApi<T>(resource, action, params?): Promise<T>`. Injeta JWT, mapeia erro para `AdminApiError`. |
| `admin/src/lib/permissions.ts` | `hasPermission(granted: string[], needed: string): boolean`. |
| `admin/src/context/AdminAuthContext.tsx` | Máquina de estados de sessão: `resolving | anon | needs_mfa_enroll | needs_mfa_challenge | ready | not_admin`. Expõe `identity`, `permissions`, `signOut`. |
| `admin/src/context/ToastContext.tsx` | Toasts (porte do app raiz, enxuto). |
| `admin/src/pages/Login.tsx`, `MfaEnroll.tsx`, `MfaChallenge.tsx`, `Unauthorized.tsx` | Telas de entrada. Sem cadastro. |
| `admin/src/components/AdminLayout.tsx`, `Sidebar.tsx`, `Topbar.tsx`, `Breadcrumbs.tsx`, `RequirePermission.tsx` | Shell. |
| `admin/src/components/ui/Badge.tsx`, `Skeleton.tsx`, `EmptyState.tsx`, `ErrorState.tsx`, `StatCard.tsx`, `DataTable.tsx` | Primitivas. |
| `admin/src/pages/Dashboard.tsx` | Dashboard executivo. |
| `admin/src/pages/admins/AdminsList.tsx`, `admins/InviteAdmin.tsx` | Administradores. |
| `admin/src/pages/roles/RolesList.tsx` | Cargos. |
| `admin/src/**/*.test.ts(x)` | Testes vitest. |

### Modificados: app do cliente

| Arquivo | Mudança |
|---|---|
| `src/App.tsx` | Remove `import AdminDashboard` e a `<Route path="/admin">` do bloco `<ProtectedRoute>`. Adiciona `<Route path="/admin" element={<AdminMoved />} />` fora do bloco protegido. |
| `src/components/Sidebar.tsx` | Remove o item condicional `isAdmin` que aponta para `/admin`. |
| `src/pages/AdminMoved.tsx` | **Novo.** Tela 404 dedicada. |
| `src/pages/AdminDashboard.tsx` | **Deletado.** |

### Novos: documentação (raiz)

`ADMIN_ARCHITECTURE.md`, `ADMIN_DEPLOYMENT.md`, `ADMIN_OPERATIONS.md`, `ADMIN_SECURITY.md`.

---

## Task 1: `shared/` foundation (catálogo de permissões, tokens, mask-secrets)

**Files:**
- Create: `shared/admin-permissions.ts`
- Create: `shared/design/tokens.ts`
- Create: `shared/mask-secrets.ts`
- Create: `shared/database.types.ts` (stub)
- Create: `shared/admin-permissions.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSION_KEYS: readonly string[]` e `type PermissionKey`
  - `PERMISSIONS: readonly { key: PermissionKey; grp: PermissionGroup; description: string }[]`
  - `ROLE_KEYS = ['SUPER_ADMIN','SUPPORT','DEVELOPER','ANALYST'] as const` e `type RoleKey`
  - `ROLES: readonly { key: RoleKey; label: string; description: string }[]`
  - `ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]>`
  - `SP1_ENFORCED_PERMISSIONS: readonly PermissionKey[]` (as que têm tela no SP1)
  - `tokens` (objeto de cores/tipografia) em `shared/design/tokens.ts`
  - `DISCORD_WEBHOOK_MASK_RE`, `TELEGRAM_BOT_TOKEN_MASK_RE`, `maskDiscordWebhook(s)`, `maskTelegramBotToken(s)` em `shared/mask-secrets.ts`

- [ ] **Step 1: Escrever o teste que falha** em `shared/admin-permissions.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  PERMISSION_KEYS, PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS, SP1_ENFORCED_PERMISSIONS,
} from './admin-permissions';

describe('catálogo de permissões', () => {
  it('tem as 49 permissoes do prompt mestre, sem duplicata', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    expect(PERMISSION_KEYS).toContain('dashboard.read');
    expect(PERMISSION_KEYS).toContain('roles.manage');
    expect(PERMISSION_KEYS).toContain('users.impersonate');
    expect(PERMISSION_KEYS.length).toBe(49);
  });

  it('toda permissão em PERMISSIONS existe em PERMISSION_KEYS e tem grupo', () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_KEYS).toContain(p.key);
      expect(p.grp).toBeTruthy();
    }
    expect(PERMISSIONS.length).toBe(PERMISSION_KEYS.length);
  });

  it('SUPER_ADMIN recebe todas as permissões', () => {
    expect([...ROLE_PERMISSIONS.SUPER_ADMIN].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('ANALYST é read-only de métricas', () => {
    expect([...ROLE_PERMISSIONS.ANALYST].sort()).toEqual(
      ['analytics.read', 'dashboard.read', 'system_health.read'].sort(),
    );
  });

  it('DEVELOPER não pode suspender usuário mas pode dar retry em job', () => {
    expect(ROLE_PERMISSIONS.DEVELOPER).not.toContain('users.suspend');
    expect(ROLE_PERMISSIONS.DEVELOPER).toContain('jobs.retry');
  });

  it('SUPPORT não recebe users.impersonate no seed', () => {
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('users.impersonate');
  });

  it('toda permissão de todo cargo existe no catálogo', () => {
    for (const key of ROLE_KEYS) {
      for (const perm of ROLE_PERMISSIONS[key]) expect(PERMISSION_KEYS).toContain(perm);
    }
  });

  it('SP1_ENFORCED_PERMISSIONS são as 6 com tela no SP1', () => {
    expect([...SP1_ENFORCED_PERMISSIONS].sort()).toEqual(
      ['admins.manage', 'admins.read', 'audit.read', 'dashboard.read', 'roles.manage', 'roles.read'].sort(),
    );
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: (a partir de `admin/` depois da Task 9; nesta task, valide o teste junto da Task 9). Marque este passo como "pendente de runner" e prossiga; a Task 9 configura o vitest que roda `shared/**/*.test.ts` via alias.
Expected: sem runner ainda, o arquivo é escrito e revisado por inspeção.

> Nota: `shared/` não tem runner próprio (sem workspaces). O `vitest.config.ts` da Task 9 inclui `../shared/**/*.test.ts` no `test.include` e o alias `@shared`. Todos os testes de `shared/` rodam a partir de `npm --prefix admin test`.

- [ ] **Step 3: Implementar `shared/admin-permissions.ts`**

```ts
export const PERMISSION_GROUPS = [
  'overview', 'users', 'operation', 'monitoring', 'integrations', 'security', 'system', 'administration',
] as const;
export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

const RAW = {
  overview: ['dashboard.read', 'analytics.read'],
  users: [
    'users.read', 'users.suspend', 'users.reactivate', 'users.sessions.read',
    'users.sessions.revoke', 'users.notes.manage', 'users.tags.manage', 'users.impersonate',
  ],
  operation: [
    'promotions.read', 'promotions.retry', 'promotions.cancel',
    'links.read', 'links.test', 'links.retry', 'links.disable',
    'shortener.read', 'shortener.manage',
    'sends.read', 'sends.retry', 'sends.cancel',
  ],
  monitoring: [
    'jobs.read', 'jobs.retry', 'jobs.cancel', 'queues.read',
    'errors.read', 'errors.manage', 'logs.read', 'system_health.read',
  ],
  integrations: ['cakto.read', 'cakto.sync', 'webhooks.read', 'webhooks.retry'],
  security: ['security.read', 'security.block_ip', 'risk.read', 'risk.manage', 'audit.read'],
  system: [
    'feature_flags.read', 'feature_flags.manage', 'announcements.read', 'announcements.manage',
    'system_settings.read', 'system_settings.manage',
  ],
  administration: ['admins.read', 'admins.manage', 'roles.read', 'roles.manage'],
} as const satisfies Record<PermissionGroup, readonly string[]>;

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((grp) =>
  RAW[grp].map((key) => ({ key, grp, description: key })),
) as readonly { key: string; grp: PermissionGroup; description: string }[];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as readonly string[];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const ROLE_KEYS = ['SUPER_ADMIN', 'SUPPORT', 'DEVELOPER', 'ANALYST'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLES: readonly { key: RoleKey; label: string; description: string }[] = [
  { key: 'SUPER_ADMIN', label: 'Super Admin', description: 'Controle total do painel.' },
  { key: 'SUPPORT', label: 'Suporte', description: 'Operacao de usuarios, promocoes, links, envios e suporte.' },
  { key: 'DEVELOPER', label: 'Desenvolvedor', description: 'Logs, erros, jobs, filas, webhooks, integracoes e system health.' },
  { key: 'ANALYST', label: 'Analista', description: 'Leitura de dashboard, analytics e metricas.' },
];

const SUPPORT: PermissionKey[] = [
  'dashboard.read', 'users.read', 'users.suspend', 'users.reactivate', 'users.sessions.read',
  'users.sessions.revoke', 'users.notes.manage', 'users.tags.manage',
  'promotions.read', 'promotions.retry', 'promotions.cancel',
  'links.read', 'links.test', 'links.retry', 'links.disable', 'shortener.read',
  'sends.read', 'sends.retry', 'sends.cancel', 'cakto.read', 'webhooks.read', 'audit.read',
];
const DEVELOPER: PermissionKey[] = [
  'dashboard.read', 'logs.read', 'errors.read', 'errors.manage', 'jobs.read', 'jobs.retry',
  'jobs.cancel', 'queues.read', 'webhooks.read', 'webhooks.retry', 'cakto.read', 'cakto.sync',
  'system_health.read', 'audit.read',
];
const ANALYST: PermissionKey[] = ['dashboard.read', 'analytics.read', 'system_health.read'];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  SUPER_ADMIN: [...PERMISSION_KEYS],
  SUPPORT,
  DEVELOPER,
  ANALYST,
};

export const SP1_ENFORCED_PERMISSIONS: readonly PermissionKey[] = [
  'dashboard.read', 'admins.read', 'admins.manage', 'roles.read', 'roles.manage', 'audit.read',
];
```

- [ ] **Step 4: Implementar `shared/design/tokens.ts`**

Copie os valores de `d:\ofertapro\tailwind.config.js` (paleta `graphite`, `cloud`, `slate`, `mint`, `ice`, aliases de brand, `fontFamily`). Estrutura:

```ts
// Cópia fiel de tailwind.config.js do app raiz (2026-08-29). Fonte para o
// tailwind.config.js de admin/. Unificar os dois configs e um chore futuro.
export const tokens = {
  colors: {
    // ... colar o objeto `theme.extend.colors` do tailwind.config.js do app raiz, verbatim
  },
  fontFamily: {
    // ... colar `theme.extend.fontFamily`
  },
} as const;
```

- [ ] **Step 5: Implementar `shared/mask-secrets.ts`**

```ts
// Mascaramento de segredo herdado do painel antigo. Antes ficava server-side
// na RPC get_admin_channels (colunas identifier_masked / token_masked de
// src/pages/AdminDashboard.tsx, removida no SP1). Reimplementado aqui como
// util compartilhado. Nao usado por tela no SP1; pronto para SP2.
export const DISCORD_WEBHOOK_MASK_RE =
  /discord\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g;

// bot_token do Telegram: "<digitos>:<segredo alfanumerico>"
export const TELEGRAM_BOT_TOKEN_MASK_RE = /\b(\d{6,}):[A-Za-z0-9_-]{30,}\b/g;

export function maskDiscordWebhook(value: string): string {
  return value.replace(DISCORD_WEBHOOK_MASK_RE, 'discord.com/api/webhooks/********');
}

export function maskTelegramBotToken(value: string): string {
  return value.replace(TELEGRAM_BOT_TOKEN_MASK_RE, '$1:********');
}
```

- [ ] **Step 6: Implementar `shared/database.types.ts` (stub)**

```ts
// Stub. Regenerar apos as migrations com:
//   supabase gen types typescript --project-id zuqaccivowbzdfrpgekz > shared/database.types.ts
// (ou --local se usando supabase start). Ate la, tipos permissivos.
export type Database = Record<string, unknown>;
export type Json = string | number | boolean | null | { [k: string]: Json } | Json[];
```

- [ ] **Step 7: Commit**

```bash
git add shared/
git commit -m "feat(admin): shared/ com catalogo de permissoes, tokens e mask-secrets

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Migration 1, fundação do RBAC

**Files:**
- Create: `supabase/migrations/20260829130000_admin_rbac_foundation.sql`
- Test: `supabase/tests/manual/20260829130000_admin_rbac_foundation.test.sql` (asserções psql, rodadas manualmente contra `supabase db reset` local; ver Step 2)

**Interfaces:**
- Produces (SQL, schema `public`):
  - Tabelas: `admin_accounts(id uuid pk, user_id uuid unique, email text, status text, mfa_enrolled_at timestamptz, created_at timestamptz, created_by uuid, suspended_at timestamptz, suspended_reason text)`, `admin_roles(key text pk, label text, description text, is_system boolean)`, `admin_permissions(key text pk, grp text, description text)`, `admin_role_permissions(role_key text, permission_key text, pk(role_key,permission_key))`, `admin_user_roles(admin_id uuid, role_key text, granted_at timestamptz, granted_by uuid, pk(admin_id,role_key))`
  - `admin_current_account() returns admin_accounts`
  - `admin_is_active() returns boolean`
  - `admin_has_permission(perm text) returns boolean`
  - `is_current_user_admin() returns boolean` (redefinida)

- [ ] **Step 1: Escrever o arquivo de teste** `supabase/tests/manual/20260829130000_admin_rbac_foundation.test.sql`

```sql
-- Rodar apos `supabase db reset` (que aplica todas as migrations).
-- Uso: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
-- Sucesso = nenhuma linha "FAIL".

do $$
begin
  assert (select count(*) from admin_roles) = 4, 'esperado 4 cargos';
  assert (select count(*) from admin_permissions) = 49, 'esperado 49 permissoes';
  assert (select count(*) from admin_role_permissions where role_key = 'SUPER_ADMIN') = 49,
    'SUPER_ADMIN deve ter as 49 permissoes';
  assert (select count(*) from admin_role_permissions where role_key = 'ANALYST') = 3,
    'ANALYST deve ter 3 permissoes';
  assert exists (select 1 from admin_role_permissions where role_key = 'DEVELOPER' and permission_key = 'jobs.retry'),
    'DEVELOPER deve ter jobs.retry';
  assert not exists (select 1 from admin_role_permissions where role_key = 'DEVELOPER' and permission_key = 'users.suspend'),
    'DEVELOPER nao pode ter users.suspend';
  assert not exists (select 1 from admin_role_permissions where role_key = 'SUPPORT' and permission_key = 'users.impersonate'),
    'SUPPORT nao pode ter users.impersonate no seed';
  assert (select count(*) from admin_role_permissions where role_key = 'SUPPORT') = 22,
    'SUPPORT deve ter 22 permissoes';
  assert (select count(*) from admin_role_permissions where role_key = 'DEVELOPER') = 14,
    'DEVELOPER deve ter 14 permissoes';
  -- RLS ligado nas 5 tabelas do RBAC
  assert (select bool_and(relrowsecurity) from pg_class
          where oid in ('public.admin_accounts'::regclass, 'public.admin_roles'::regclass,
                        'public.admin_permissions'::regclass, 'public.admin_role_permissions'::regclass,
                        'public.admin_user_roles'::regclass)),
    'RLS deve estar ligado nas 5 tabelas do RBAC';
  -- funcoes
  assert exists (select 1 from pg_proc where proname = 'is_current_user_admin'), 'is_current_user_admin sumiu';
  assert exists (select 1 from pg_proc where proname = 'admin_has_permission'), 'admin_has_permission ausente';
  raise notice 'PASS migration 1';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
supabase db reset            # aplica migrations; ainda sem a migration 1 -> tabelas nao existem
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260829130000_admin_rbac_foundation.test.sql
```
Expected: erro `relation "admin_roles" does not exist`.

> Se `supabase` CLI / Postgres local não estiverem disponíveis no ambiente de execução, marque este passo como "verificado por inspeção do SQL" e registre no commit. A validação real roda no deploy (ordem na seção Deploy do spec).

- [ ] **Step 3: Escrever a migration** `supabase/migrations/20260829130000_admin_rbac_foundation.sql`

```sql
-- SP1 Fundacao do painel admin. Substitui admin_users solto de supabase_admin_setup.sql.

create table if not exists public.admin_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  status text not null default 'active' check (status in ('active','suspended')),
  mfa_enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_accounts(id),
  suspended_at timestamptz,
  suspended_reason text
);

create table if not exists public.admin_roles (
  key text primary key,
  label text not null,
  description text,
  is_system boolean not null default true
);

create table if not exists public.admin_permissions (
  key text primary key,
  grp text not null,
  description text
);

create table if not exists public.admin_role_permissions (
  role_key text not null references public.admin_roles(key) on delete cascade,
  permission_key text not null references public.admin_permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);

create table if not exists public.admin_user_roles (
  admin_id uuid not null references public.admin_accounts(id) on delete cascade,
  role_key text not null references public.admin_roles(key) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.admin_accounts(id),
  primary key (admin_id, role_key)
);

create index if not exists admin_user_roles_admin_idx on public.admin_user_roles(admin_id);

-- Funcoes de leitura
create or replace function public.admin_current_account()
returns public.admin_accounts
language sql stable security definer set search_path = public as $$
  select a.* from public.admin_accounts a
  where a.user_id = auth.uid() and a.status = 'active'
  limit 1;
$$;

create or replace function public.admin_is_active()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_accounts
    where user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.admin_has_permission(perm text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.admin_accounts a
    join public.admin_user_roles ur on ur.admin_id = a.id
    where a.user_id = auth.uid()
      and a.status = 'active'
      and (
        ur.role_key = 'SUPER_ADMIN'
        or exists (
          select 1 from public.admin_role_permissions rp
          where rp.role_key = ur.role_key and rp.permission_key = perm
        )
      )
  );
$$;

-- Compat: mantem UserContext/Sidebar do app cliente funcionando durante a transicao
create or replace function public.is_current_user_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select public.admin_is_active();
$$;

grant execute on function public.admin_current_account() to authenticated, service_role;
grant execute on function public.admin_is_active() to authenticated, service_role;
grant execute on function public.admin_has_permission(text) to authenticated, service_role;
grant execute on function public.is_current_user_admin() to authenticated, service_role, anon;

-- Seed: cargos
insert into public.admin_roles (key, label, description, is_system) values
  ('SUPER_ADMIN','Super Admin','Controle total do painel.',true),
  ('SUPPORT','Suporte','Operacao de usuarios, promocoes, links, envios e suporte.',true),
  ('DEVELOPER','Desenvolvedor','Logs, erros, jobs, filas, webhooks, integracoes e system health.',true),
  ('ANALYST','Analista','Leitura de dashboard, analytics e metricas.',true)
on conflict (key) do update set label = excluded.label, description = excluded.description, is_system = excluded.is_system;

-- Seed: permissoes (49, casa com shared/admin-permissions.ts)
insert into public.admin_permissions (key, grp, description) values
  ('dashboard.read','overview','dashboard.read'),
  ('analytics.read','overview','analytics.read'),
  ('users.read','users','users.read'),
  ('users.suspend','users','users.suspend'),
  ('users.reactivate','users','users.reactivate'),
  ('users.sessions.read','users','users.sessions.read'),
  ('users.sessions.revoke','users','users.sessions.revoke'),
  ('users.notes.manage','users','users.notes.manage'),
  ('users.tags.manage','users','users.tags.manage'),
  ('users.impersonate','users','users.impersonate'),
  ('promotions.read','operation','promotions.read'),
  ('promotions.retry','operation','promotions.retry'),
  ('promotions.cancel','operation','promotions.cancel'),
  ('links.read','operation','links.read'),
  ('links.test','operation','links.test'),
  ('links.retry','operation','links.retry'),
  ('links.disable','operation','links.disable'),
  ('shortener.read','operation','shortener.read'),
  ('shortener.manage','operation','shortener.manage'),
  ('sends.read','operation','sends.read'),
  ('sends.retry','operation','sends.retry'),
  ('sends.cancel','operation','sends.cancel'),
  ('jobs.read','monitoring','jobs.read'),
  ('jobs.retry','monitoring','jobs.retry'),
  ('jobs.cancel','monitoring','jobs.cancel'),
  ('queues.read','monitoring','queues.read'),
  ('errors.read','monitoring','errors.read'),
  ('errors.manage','monitoring','errors.manage'),
  ('logs.read','monitoring','logs.read'),
  ('system_health.read','monitoring','system_health.read'),
  ('cakto.read','integrations','cakto.read'),
  ('cakto.sync','integrations','cakto.sync'),
  ('webhooks.read','integrations','webhooks.read'),
  ('webhooks.retry','integrations','webhooks.retry'),
  ('security.read','security','security.read'),
  ('security.block_ip','security','security.block_ip'),
  ('risk.read','security','risk.read'),
  ('risk.manage','security','risk.manage'),
  ('audit.read','security','audit.read'),
  ('feature_flags.read','system','feature_flags.read'),
  ('feature_flags.manage','system','feature_flags.manage'),
  ('announcements.read','system','announcements.read'),
  ('announcements.manage','system','announcements.manage'),
  ('system_settings.read','system','system_settings.read'),
  ('system_settings.manage','system','system_settings.manage'),
  ('admins.read','administration','admins.read'),
  ('admins.manage','administration','admins.manage'),
  ('roles.read','administration','roles.read'),
  ('roles.manage','administration','roles.manage')
on conflict (key) do update set grp = excluded.grp, description = excluded.description;

-- Seed: matriz. SUPER_ADMIN = todas.
insert into public.admin_role_permissions (role_key, permission_key)
select 'SUPER_ADMIN', key from public.admin_permissions
on conflict do nothing;

insert into public.admin_role_permissions (role_key, permission_key) values
  ('SUPPORT','dashboard.read'),('SUPPORT','users.read'),('SUPPORT','users.suspend'),
  ('SUPPORT','users.reactivate'),('SUPPORT','users.sessions.read'),('SUPPORT','users.sessions.revoke'),
  ('SUPPORT','users.notes.manage'),('SUPPORT','users.tags.manage'),('SUPPORT','promotions.read'),
  ('SUPPORT','promotions.retry'),('SUPPORT','promotions.cancel'),('SUPPORT','links.read'),
  ('SUPPORT','links.test'),('SUPPORT','links.retry'),('SUPPORT','links.disable'),
  ('SUPPORT','shortener.read'),('SUPPORT','sends.read'),('SUPPORT','sends.retry'),
  ('SUPPORT','sends.cancel'),('SUPPORT','cakto.read'),('SUPPORT','webhooks.read'),('SUPPORT','audit.read'),
  ('DEVELOPER','dashboard.read'),('DEVELOPER','logs.read'),('DEVELOPER','errors.read'),
  ('DEVELOPER','errors.manage'),('DEVELOPER','jobs.read'),('DEVELOPER','jobs.retry'),
  ('DEVELOPER','jobs.cancel'),('DEVELOPER','queues.read'),('DEVELOPER','webhooks.read'),
  ('DEVELOPER','webhooks.retry'),('DEVELOPER','cakto.read'),('DEVELOPER','cakto.sync'),
  ('DEVELOPER','system_health.read'),('DEVELOPER','audit.read'),
  ('ANALYST','dashboard.read'),('ANALYST','analytics.read'),('ANALYST','system_health.read')
on conflict do nothing;

-- RLS
alter table public.admin_accounts enable row level security;
alter table public.admin_roles enable row level security;
alter table public.admin_permissions enable row level security;
alter table public.admin_role_permissions enable row level security;
alter table public.admin_user_roles enable row level security;

drop policy if exists admin_accounts_read on public.admin_accounts;
create policy admin_accounts_read on public.admin_accounts
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_user_roles_read on public.admin_user_roles;
create policy admin_user_roles_read on public.admin_user_roles
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_roles_read on public.admin_roles;
create policy admin_roles_read on public.admin_roles
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_permissions_read on public.admin_permissions;
create policy admin_permissions_read on public.admin_permissions
  for select to authenticated using (public.admin_is_active());

drop policy if exists admin_role_permissions_read on public.admin_role_permissions;
create policy admin_role_permissions_read on public.admin_role_permissions
  for select to authenticated using (public.admin_is_active());

-- Sem policy de INSERT/UPDATE/DELETE para authenticated: escrita so via service_role (admin-api).
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run:
```bash
supabase db reset
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260829130000_admin_rbac_foundation.test.sql
```
Expected: `NOTICE: PASS migration 1`, sem erro.

- [ ] **Step 5: Regenerar tipos**

Run:
```bash
supabase gen types typescript --local > shared/database.types.ts
```
(ou `--project-id zuqaccivowbzdfrpgekz` se não estiver usando stack local). Se a CLI não estiver disponível, deixar o stub e anotar no commit.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829130000_admin_rbac_foundation.sql supabase/tests/manual/20260829130000_admin_rbac_foundation.test.sql shared/database.types.ts
git commit -m "feat(admin): migration da fundacao do RBAC (tabelas, funcoes, seed)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Migration 2, Audit Log imutável e funções de mutação

**Files:**
- Create: `supabase/migrations/20260829130100_admin_audit_and_mutations.sql`
- Test: `supabase/tests/manual/20260829130100_admin_audit_and_mutations.test.sql`

**Interfaces:**
- Consumes: tabelas e funções da Task 2.
- Produces (SQL):
  - `admin_audit_log(id uuid pk, admin_id uuid (soft ref, sem FK), admin_email text, action text, entity_type text, entity_id text, before jsonb, after jsonb, reason text, ip inet, user_agent text, request_id text, created_at timestamptz)`. `admin_id` sem FK de propósito (o log é imutável e sobrevive à exclusão da conta). `admin_email` é preenchido por `admin_audit_write` a partir de `admin_accounts` no momento da escrita.
  - `admin_audit_write(p_admin_id uuid, p_action text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb) returns uuid`. `security definer`; `revoke execute from authenticated, anon` + `grant execute to service_role` (senão um usuário logado forjaria linhas via RPC — o trigger append-only só barra UPDATE/DELETE, não INSERT).
  - `admin_invite(p_actor uuid, p_email text, p_role_keys text[], p_ctx jsonb) returns jsonb` — `p_actor` é `admin_accounts.id` de quem chama. Erros: `raise exception using errcode='P0002'` (não encontrado, e-mail sem `auth.users`), `errcode='23505'`/custom `'ADMIN_EXISTS'` (já é admin).
  - `admin_suspend(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb) returns jsonb` — erros: `'CANNOT_SUSPEND_SELF'`, `'LAST_SUPER_ADMIN'`, `'NOT_FOUND'`.
  - `admin_reactivate(p_actor uuid, p_target uuid, p_ctx jsonb) returns jsonb`
  - `admin_assign_role(p_actor uuid, p_target uuid, p_role_key text, p_ctx jsonb) returns jsonb` — erro `'ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN'`, `'NOT_FOUND'`.
  - `admin_revoke_role(p_actor uuid, p_target uuid, p_role_key text, p_ctx jsonb) returns jsonb` — erro `'LAST_SUPER_ADMIN'`, `'NOT_FOUND'`.
  - Convenção de retorno: `jsonb` com o registro resultante (ou `{ "ok": true }`). Convenção de erro: `raise exception '%', message using errcode = '<CODE>'` onde `<CODE>` é uma das strings acima; `_lib.ts`/handlers mapeiam para HTTP.

- [ ] **Step 1: Escrever o teste** `supabase/tests/manual/20260829130100_admin_audit_and_mutations.test.sql`

```sql
-- psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f este_arquivo.sql
do $$
declare
  v_user uuid;
  v_actor uuid;
  v_target_user uuid;
  v_target uuid;
  v_before_count int;
  v_blocked boolean;
begin
  -- fixtures: dois usuarios auth ficticios
  insert into auth.users (id, email) values (gen_random_uuid(), 'actor.test@aflyo.local')
    returning id into v_user;
  insert into public.admin_accounts (user_id, email, status) values (v_user, 'actor.test@aflyo.local', 'active')
    returning id into v_actor;
  insert into public.admin_user_roles (admin_id, role_key) values (v_actor, 'SUPER_ADMIN');

  insert into auth.users (id, email) values (gen_random_uuid(), 'target.test@aflyo.local')
    returning id into v_target_user;

  -- admin_invite grava 1 linha de auditoria
  select count(*) into v_before_count from public.admin_audit_log;
  perform public.admin_invite(v_actor, 'target.test@aflyo.local', array['DEVELOPER'],
    '{"ip":"1.2.3.4","user_agent":"t","request_id":"r1"}'::jsonb);
  assert (select count(*) from public.admin_audit_log) = v_before_count + 1, 'invite deve auditar 1 linha';
  assert exists (select 1 from public.admin_accounts where email = 'target.test@aflyo.local'), 'admin criado';
  select id into v_target from public.admin_accounts where email = 'target.test@aflyo.local';
  assert exists (select 1 from public.admin_user_roles where admin_id = v_target and role_key = 'DEVELOPER'), 'cargo atribuido';

  -- audit log e append-only. Padrao: a op roda dentro de um sub-bloco que so
  -- seta v_blocked no handler; o assert fica FORA do bloco, entao um
  -- assert_failure nao e engolido pelo "when others".
  v_blocked := false;
  begin
    update public.admin_audit_log set reason = 'x' where true;
  exception when others then v_blocked := true;
  end;
  assert v_blocked, 'UPDATE em admin_audit_log deveria falhar';

  v_blocked := false;
  begin
    delete from public.admin_audit_log where true;
  exception when others then v_blocked := true;
  end;
  assert v_blocked, 'DELETE em admin_audit_log deveria falhar';

  v_blocked := false;
  begin
    perform public.admin_suspend(v_actor, v_actor, 'teste', '{}'::jsonb);
  exception when others then v_blocked := true;
  end;
  assert v_blocked, 'suspender a si mesmo deveria falhar';

  v_blocked := false;
  begin
    perform public.admin_revoke_role(v_actor, v_actor, 'SUPER_ADMIN', '{}'::jsonb);
  exception when others then v_blocked := true;
  end;
  assert v_blocked, 'remover ultimo SUPER_ADMIN deveria falhar';

  -- limpeza
  delete from public.admin_accounts where email in ('actor.test@aflyo.local','target.test@aflyo.local');
  delete from auth.users where email in ('actor.test@aflyo.local','target.test@aflyo.local');
  raise notice 'PASS migration 2';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260829130100_admin_audit_and_mutations.test.sql`
Expected: erro `function public.admin_invite(...) does not exist`. (Ou "verificado por inspeção" se sem CLI.)

- [ ] **Step 3: Escrever a migration** `supabase/migrations/20260829130100_admin_audit_and_mutations.sql`

```sql
-- SP1: Audit Log imutavel + funcoes de mutacao (mudanca + auditoria atomicas).

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- referencia SOFT (sem FK): o log e imutavel e sobrevive a exclusao da conta
  -- admin. Uma FK on delete set null seria um UPDATE, que o trigger append-only
  -- abaixo bloqueia; on delete restrict travaria o cascade de auth.users.
  admin_id uuid,
  admin_email text,
  action text not null,
  entity_type text,
  entity_id text,
  before jsonb,
  after jsonb,
  reason text,
  ip inet,
  user_agent text,
  request_id text,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_at_idx on public.admin_audit_log(created_at desc);
create index if not exists admin_audit_log_admin_id_idx on public.admin_audit_log(admin_id);
create index if not exists admin_audit_log_action_idx on public.admin_audit_log(action);

alter table public.admin_audit_log enable row level security;

drop policy if exists admin_audit_log_read on public.admin_audit_log;
create policy admin_audit_log_read on public.admin_audit_log
  for select to authenticated using (public.admin_has_permission('audit.read'));

revoke update, delete on public.admin_audit_log from authenticated, anon;

create or replace function public.admin_audit_log_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_audit_log e append-only';
end;
$$;

drop trigger if exists admin_audit_log_no_update on public.admin_audit_log;
create trigger admin_audit_log_no_update
  before update or delete on public.admin_audit_log
  for each row execute function public.admin_audit_log_block_mutation();

create or replace function public.admin_audit_write(
  p_admin_id uuid, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_ip inet;
begin
  -- ip defensivo: um valor malformado no ctx nao pode abortar a mutacao inteira
  begin
    v_ip := nullif(p_ctx->>'ip', '')::inet;
  exception when others then
    v_ip := null;
  end;
  insert into public.admin_audit_log
    (admin_id, admin_email, action, entity_type, entity_id, before, after, reason, ip, user_agent, request_id)
  values (
    p_admin_id,
    (select email from public.admin_accounts where id = p_admin_id),
    p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason,
    v_ip, p_ctx->>'user_agent', p_ctx->>'request_id'
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.admin_audit_write(uuid, text, text, text, jsonb, jsonb, text, jsonb) from authenticated, anon;
grant execute on function public.admin_audit_write(uuid, text, text, text, jsonb, jsonb, text, jsonb) to service_role;

-- Mutacoes. Cada uma faz a mudanca E o audit no mesmo corpo (mesma transacao).

create or replace function public.admin_invite(
  p_actor uuid, p_email text, p_role_keys text[], p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_admin uuid; v_role text;
begin
  select id into v_user from auth.users where lower(email) = lower(p_email);
  if v_user is null then
    raise exception 'nenhuma conta Aflyo para %', p_email using errcode = 'P0002';
  end if;
  if exists (select 1 from public.admin_accounts where user_id = v_user) then
    raise exception 'ja e admin' using errcode = 'P0001', hint = 'ADMIN_EXISTS';
  end if;
  insert into public.admin_accounts (user_id, email, status, created_by)
    values (v_user, lower(p_email), 'active', p_actor)
    returning id into v_admin;
  foreach v_role in array coalesce(p_role_keys, array[]::text[]) loop
    insert into public.admin_user_roles (admin_id, role_key, granted_by)
      values (v_admin, v_role, p_actor) on conflict do nothing;
  end loop;
  perform public.admin_audit_write(
    p_actor, 'ADMIN_INVITED', 'admin_account', v_admin::text,
    null,
    jsonb_build_object('email', lower(p_email), 'roles', coalesce(p_role_keys, array[]::text[])),
    null, p_ctx
  );
  return (select to_jsonb(a) from public.admin_accounts a where a.id = v_admin);
end;
$$;

create or replace function public.admin_suspend(
  p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_actor = p_target then
    raise exception 'nao pode suspender a si mesmo' using errcode='P0001', hint='CANNOT_SUSPEND_SELF';
  end if;
  select to_jsonb(a) into v_before from public.admin_accounts a where a.id = p_target;
  if v_before is null then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  -- nao deixar zero SUPER_ADMIN ativo
  if exists (select 1 from public.admin_user_roles where admin_id = p_target and role_key = 'SUPER_ADMIN')
     and (select count(*) from public.admin_accounts a
            join public.admin_user_roles ur on ur.admin_id = a.id
            where a.status = 'active' and ur.role_key = 'SUPER_ADMIN') <= 1 then
    raise exception 'ultimo SUPER_ADMIN ativo' using errcode='P0001', hint='LAST_SUPER_ADMIN';
  end if;
  update public.admin_accounts
    set status = 'suspended', suspended_at = now(), suspended_reason = p_reason
    where id = p_target;
  perform public.admin_audit_write(
    p_actor, 'ADMIN_SUSPENDED', 'admin_account', p_target::text,
    v_before, (select to_jsonb(a) from public.admin_accounts a where a.id = p_target),
    p_reason, p_ctx
  );
  return (select to_jsonb(a) from public.admin_accounts a where a.id = p_target);
end;
$$;

create or replace function public.admin_reactivate(
  p_actor uuid, p_target uuid, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(a) into v_before from public.admin_accounts a where a.id = p_target;
  if v_before is null then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update public.admin_accounts
    set status = 'active', suspended_at = null, suspended_reason = null
    where id = p_target;
  perform public.admin_audit_write(
    p_actor, 'ADMIN_REACTIVATED', 'admin_account', p_target::text,
    v_before, (select to_jsonb(a) from public.admin_accounts a where a.id = p_target), null, p_ctx
  );
  return (select to_jsonb(a) from public.admin_accounts a where a.id = p_target);
end;
$$;

create or replace function public.admin_assign_role(
  p_actor uuid, p_target uuid, p_role_key text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_accounts where id = p_target) then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if not exists (select 1 from public.admin_roles where key = p_role_key) then
    raise exception 'cargo invalido' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if p_role_key = 'SUPER_ADMIN'
     and not exists (select 1 from public.admin_user_roles where admin_id = p_actor and role_key = 'SUPER_ADMIN') then
    raise exception 'so SUPER_ADMIN atribui SUPER_ADMIN' using errcode='P0001', hint='ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN';
  end if;
  insert into public.admin_user_roles (admin_id, role_key, granted_by)
    values (p_target, p_role_key, p_actor) on conflict do nothing;
  perform public.admin_audit_write(
    p_actor, 'ROLE_ASSIGNED', 'admin_account', p_target::text,
    null, jsonb_build_object('role', p_role_key), null, p_ctx
  );
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_revoke_role(
  p_actor uuid, p_target uuid, p_role_key text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.admin_accounts where id = p_target) then
    raise exception 'admin nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if p_role_key = 'SUPER_ADMIN'
     and (select count(*) from public.admin_accounts a
            join public.admin_user_roles ur on ur.admin_id = a.id
            where a.status = 'active' and ur.role_key = 'SUPER_ADMIN') <= 1
     and exists (select 1 from public.admin_user_roles where admin_id = p_target and role_key = 'SUPER_ADMIN') then
    raise exception 'ultimo SUPER_ADMIN ativo' using errcode='P0001', hint='LAST_SUPER_ADMIN';
  end if;
  delete from public.admin_user_roles where admin_id = p_target and role_key = p_role_key;
  perform public.admin_audit_write(
    p_actor, 'ROLE_REVOKED', 'admin_account', p_target::text,
    jsonb_build_object('role', p_role_key), null, null, p_ctx
  );
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.admin_invite(uuid, text, text[], jsonb) from authenticated, anon;
revoke execute on function public.admin_suspend(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_reactivate(uuid, uuid, jsonb) from authenticated, anon;
revoke execute on function public.admin_assign_role(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_revoke_role(uuid, uuid, text, jsonb) from authenticated, anon;
grant execute on function public.admin_invite(uuid, text, text[], jsonb) to service_role;
grant execute on function public.admin_suspend(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_reactivate(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_assign_role(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_revoke_role(uuid, uuid, text, jsonb) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260829130100_admin_audit_and_mutations.test.sql`
Expected: `NOTICE: PASS migration 2`.

- [ ] **Step 5: Regenerar tipos** (mesmo comando da Task 2 Step 5).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260829130100_admin_audit_and_mutations.sql supabase/tests/manual/20260829130100_admin_audit_and_mutations.test.sql shared/database.types.ts
git commit -m "feat(admin): audit log imutavel e funcoes de mutacao atomicas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Migration 3, bootstrap do SUPER_ADMIN e limpeza do admin antigo

**Files:**
- Create: `supabase/migrations/20260829130200_admin_bootstrap_and_cleanup.sql`

**Interfaces:**
- Consumes: tabelas/funções das Tasks 2 e 3.
- Produces: linha `admin_accounts` para `contatogivaldo@outlook.com` com cargo `SUPER_ADMIN` (se a conta `auth.users` existir). `admin_users` (tabela antiga) dropada. `get_admin_dashboard_stats`, `get_admin_recent_users`, `get_admin_recent_offers`, `get_admin_recent_dispatches`, `get_admin_channels`, `get_admin_api_keys` dropadas.

- [ ] **Step 1: Escrever a migration** `supabase/migrations/20260829130200_admin_bootstrap_and_cleanup.sql`

```sql
-- SP1: bootstrap do primeiro SUPER_ADMIN + limpeza do admin legado.

do $$
declare v_uid uuid; v_admin uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'contatogivaldo@outlook.com';
  if v_uid is null then
    raise notice 'bootstrap: auth.users para contatogivaldo@outlook.com nao encontrado. Rode esta migration de novo (ou insira a mao) apos a conta existir.';
    return;
  end if;

  insert into public.admin_accounts (user_id, email, status)
    values (v_uid, 'contatogivaldo@outlook.com', 'active')
    on conflict (user_id) do update set status = 'active'
    returning id into v_admin;

  insert into public.admin_user_roles (admin_id, role_key)
    values (v_admin, 'SUPER_ADMIN')
    on conflict do nothing;

  raise notice 'bootstrap: contatogivaldo@outlook.com promovido a SUPER_ADMIN (admin_accounts %).', v_admin;
end $$;

-- Limpeza do seed antigo de e-mails de teste (estavam em supabase_admin_setup.sql).
-- Roda so se a tabela antiga ainda existir. NAO inclui contatogivaldo@outlook.com:
-- essa conta e o SUPER_ADMIN novo, ja tratada no bloco de bootstrap acima. Este
-- delete e redundante com o drop table logo abaixo, mas documenta a intencao.
do $$
begin
  if to_regclass('public.admin_users') is not null then
    delete from public.admin_users where email in (
      'qa.teste1@gmail.com','kaikfarias051@gmail.com','testeonboarding@teste.com',
      'qa.ofertapro.162606@gmail.com','conta@teste.com'
    );
  end if;
end $$;

drop table if exists public.admin_users cascade;

drop function if exists public.get_admin_dashboard_stats() cascade;
drop function if exists public.get_admin_recent_users() cascade;
drop function if exists public.get_admin_recent_offers() cascade;
drop function if exists public.get_admin_recent_dispatches() cascade;
drop function if exists public.get_admin_channels() cascade;
drop function if exists public.get_admin_api_keys() cascade;
```

- [ ] **Step 2: Rodar `supabase db reset` e verificar os NOTICEs**

Run: `supabase db reset`
Expected: NOTICE de bootstrap (promovido, ou "nao encontrado" se a conta não existir localmente, que é aceitável em dev). Sem erro.

- [ ] **Step 3: Verificar por query**

```bash
psql "$SUPABASE_DB_URL" -c "select a.email, ur.role_key from admin_accounts a join admin_user_roles ur on ur.admin_id=a.id;"
psql "$SUPABASE_DB_URL" -c "select to_regclass('public.admin_users');"  -- deve ser NULL
psql "$SUPABASE_DB_URL" -c "select proname from pg_proc where proname like 'get_admin_%';"  -- deve ser vazio
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260829130200_admin_bootstrap_and_cleanup.sql
git commit -m "feat(admin): bootstrap do SUPER_ADMIN e remocao do admin legado

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `admin-api` core (`_lib`, `rbac`, `audit`, `index` router + ping)

**Files:**
- Create: `supabase/functions/admin-api/_lib.ts`
- Create: `supabase/functions/admin-api/rbac.ts`
- Create: `supabase/functions/admin-api/audit.ts`
- Create: `supabase/functions/admin-api/index.ts`
- Create: `supabase/functions/admin-api/deno.json`
- Test: `supabase/functions/admin-api/rbac_test.ts`

**Interfaces:**
- Produces:
  - `_lib.ts`: `corsHeaders(req: Request): Record<string,string>`; `json(data: unknown, status: number, req: Request): Response`; `errorResponse(code: ErrorCode, message: string, req: Request): Response`; `type ErrorCode = 'unauthenticated'|'forbidden'|'not_found'|'conflict'|'validation'|'rate_limited'|'internal'`; `STATUS_BY_CODE: Record<ErrorCode, number>`; `serviceClient(): SupabaseClient`; `getRequestContext(req: Request): { ip: string|null; user_agent: string|null; request_id: string }`
  - `rbac.ts`: `type AdminIdentity = { adminId: string; userId: string; email: string; roleKeys: string[]; permissions: Set<string> }`; `type RbacDeps = { getUser(jwt: string): Promise<{ userId: string; email: string; aal: string } | null>; loadAdmin(userId: string): Promise<{ adminId: string; status: string; roleKeys: string[]; permissions: string[] } | null> }`; `authorize(req: Request, deps: RbacDeps): Promise<AdminIdentity>` (throws `RbacError`); `requirePermission(identity: AdminIdentity, perm: string): void` (throws `RbacError`); `class RbacError extends Error { code: ErrorCode }`; `makeSupabaseDeps(): RbacDeps` (implementação real, usa `serviceClient` + `auth.getUser`).
  - `audit.ts`: `type AuditContext = { ip: string|null; user_agent: string|null; request_id: string }` e `ACTION_NAMES` (mapa informativo). O contexto em si é computado uma vez em `index.ts` via `getRequestContext` e passado ao handler.
  - `index.ts`: HTTP handler. Contrato: `POST` com body `{ resource: string, action: string, params?: object }`, header `Authorization: Bearer <jwt>`. Resposta sucesso `{ data: <payload> }` status 200. Erro `{ error: { code, message } }`.
  - `type Handler = (params: Record<string, unknown>, identity: AdminIdentity, ctx: AuditContext) => Promise<unknown>`; `type HandlerMap = Record<string, Record<string, { permission: string; handler: Handler }>>`. `index.ts` importa `HANDLERS` de um registry; nesta task, registry só com `{ ping: { read: { permission: 'dashboard.read', handler: async () => ({ pong: true }) } } }`.

- [ ] **Step 1: Escrever `rbac_test.ts`**

```ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { authorize, requirePermission, RbacError, type RbacDeps } from './rbac.ts';

function req(headers: Record<string, string> = {}): Request {
  return new Request('https://admin-api.test', { method: 'POST', headers });
}

const okDeps = (over: Partial<RbacDeps> = {}): RbacDeps => ({
  getUser: async () => ({ userId: 'u1', email: 'a@b.c', aal: 'aal2' }),
  loadAdmin: async () => ({ adminId: 'ad1', status: 'active', roleKeys: ['DEVELOPER'], permissions: ['dashboard.read', 'jobs.retry'] }),
  ...over,
});

Deno.test('sem Authorization -> unauthenticated', async () => {
  const e = await assertRejects(() => authorize(req(), okDeps()), RbacError);
  assertEquals((e as RbacError).code, 'unauthenticated');
});

Deno.test('JWT invalido -> unauthenticated', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ getUser: async () => null })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'unauthenticated');
});

Deno.test('sem AAL2 -> forbidden', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ getUser: async () => ({ userId: 'u1', email: 'a@b.c', aal: 'aal1' }) })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('nao e admin -> forbidden', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ loadAdmin: async () => null })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('admin suspenso -> forbidden', async () => {
  const e = await assertRejects(
    () => authorize(req({ Authorization: 'Bearer x' }), okDeps({ loadAdmin: async () => ({ adminId: 'ad1', status: 'suspended', roleKeys: [], permissions: [] }) })),
    RbacError,
  );
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('admin ativo com AAL2 -> identidade', async () => {
  const id = await authorize(req({ Authorization: 'Bearer x' }), okDeps());
  assertEquals(id.adminId, 'ad1');
  assertEquals(id.permissions.has('dashboard.read'), true);
});

Deno.test('requirePermission nega quando falta', () => {
  const id = { adminId: 'ad1', userId: 'u1', email: 'a@b.c', roleKeys: ['DEVELOPER'], permissions: new Set(['dashboard.read']) };
  const e = (() => { try { requirePermission(id, 'users.suspend'); } catch (x) { return x; } })();
  assertEquals(e instanceof RbacError, true);
  assertEquals((e as RbacError).code, 'forbidden');
});

Deno.test('SUPER_ADMIN passa em qualquer permissao', () => {
  const id = { adminId: 'ad1', userId: 'u1', email: 'a@b.c', roleKeys: ['SUPER_ADMIN'], permissions: new Set<string>() };
  requirePermission(id, 'anything.at.all'); // nao lanca
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test supabase/functions/admin-api/rbac_test.ts`
Expected: FAIL, `Module not found "./rbac.ts"`.

- [ ] **Step 3: Escrever `_lib.ts`**

```ts
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Lazy: nao ler Deno.env no top level (forcaria --allow-env em todo teste que
// importe este modulo transitivamente).
function allowedOrigins(): string[] {
  const dev = Deno.env.get('ENVIRONMENT') === 'dev';
  return dev
    ? ['https://admin.aflyo.com.br', 'http://localhost:5273']
    : ['https://admin.aflyo.com.br'];
}

export function corsHeaders(req: Request): Record<string, string> {
  const origins = allowedOrigins();
  const origin = req.headers.get('Origin') ?? '';
  const allow = origins.includes(origin) ? origin : origins[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export type ErrorCode =
  | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict'
  | 'validation' | 'rate_limited' | 'internal';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409,
  validation: 422, rate_limited: 429, internal: 500,
};

export function json(data: unknown, status: number, req: Request, requestId?: string): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(req),
      'Content-Type': 'application/json',
      'X-Request-Id': requestId ?? getRequestContext(req).request_id,
    },
  });
}

export function errorResponse(code: ErrorCode, message: string, req: Request, requestId?: string): Response {
  return json({ error: { code, message } }, STATUS_BY_CODE[code], req, requestId);
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function getRequestContext(req: Request): { ip: string | null; user_agent: string | null; request_id: string } {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : null;
  return {
    ip: ip || null,
    user_agent: req.headers.get('user-agent'),
    request_id: req.headers.get('x-request-id') || crypto.randomUUID(),
  };
}
```

- [ ] **Step 4: Escrever `rbac.ts`**

```ts
import type { ErrorCode } from './_lib.ts';
import { serviceClient } from './_lib.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export class RbacError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type AdminIdentity = {
  adminId: string;
  userId: string;
  email: string;
  roleKeys: string[];
  permissions: Set<string>;
};

export type RbacDeps = {
  getUser(jwt: string): Promise<{ userId: string; email: string; aal: string } | null>;
  loadAdmin(userId: string): Promise<{ adminId: string; status: string; roleKeys: string[]; permissions: string[] } | null>;
};

function decodeAal(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.aal === 'string' ? payload.aal : 'aal1';
  } catch {
    return 'aal1';
  }
}

export async function authorize(req: Request, deps: RbacDeps): Promise<AdminIdentity> {
  const header = req.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw new RbacError('unauthenticated', 'Cabecalho Authorization ausente.');
  }
  const jwt = header.slice('Bearer '.length);
  const user = await deps.getUser(jwt);
  if (!user) throw new RbacError('unauthenticated', 'Token invalido ou expirado.');
  if (user.aal !== 'aal2') throw new RbacError('forbidden', 'MFA obrigatorio para o painel.');

  const admin = await deps.loadAdmin(user.userId);
  if (!admin || admin.status !== 'active') {
    throw new RbacError('forbidden', 'Conta sem acesso administrativo.');
  }
  return {
    adminId: admin.adminId,
    userId: user.userId,
    email: user.email,
    roleKeys: admin.roleKeys,
    permissions: new Set(admin.permissions),
  };
}

export function requirePermission(identity: AdminIdentity, perm: string): void {
  if (identity.roleKeys.includes('SUPER_ADMIN')) return;
  if (!identity.permissions.has(perm)) {
    throw new RbacError('forbidden', `Permissao ausente: ${perm}`);
  }
}

export function makeSupabaseDeps(): RbacDeps {
  return {
    async getUser(jwt) {
      const client = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
      );
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return null;
      return { userId: data.user.id, email: data.user.email ?? '', aal: decodeAal(jwt) };
    },
    async loadAdmin(userId) {
      const svc = serviceClient();
      const { data: acc, error: accErr } = await svc
        .from('admin_accounts')
        .select('id, status')
        .eq('user_id', userId)
        .maybeSingle();
      if (accErr) throw new RbacError('internal', 'Falha ao carregar a conta administrativa.');
      if (!acc) return null;
      const { data: roles, error: rolesErr } = await svc
        .from('admin_user_roles')
        .select('role_key')
        .eq('admin_id', acc.id);
      if (rolesErr) throw new RbacError('internal', 'Falha ao carregar os cargos.');
      const roleKeys = (roles ?? []).map((r: { role_key: string }) => r.role_key);
      const { data: perms, error: permsErr } = await svc
        .from('admin_role_permissions')
        .select('permission_key')
        .in('role_key', roleKeys.length ? roleKeys : ['__none__']);
      if (permsErr) throw new RbacError('internal', 'Falha ao carregar as permissoes.');
      return {
        adminId: acc.id,
        status: acc.status,
        roleKeys,
        permissions: (perms ?? []).map((p: { permission_key: string }) => p.permission_key),
      };
    },
  };
}
```

- [ ] **Step 5: Escrever `audit.ts`**

```ts
// O contexto da request e computado uma vez no index.ts (getRequestContext) e
// passado ao handler. Este modulo so define o tipo e o mapa de nomes de acao.
export type AuditContext = { ip: string | null; user_agent: string | null; request_id: string };

export const ACTION_NAMES = {
  ADMIN_INVITED: 'admins/invite',
  ADMIN_SUSPENDED: 'admins/suspend',
  ADMIN_REACTIVATED: 'admins/reactivate',
  ROLE_ASSIGNED: 'roles/assign',
  ROLE_REVOKED: 'roles/revoke',
} as const;
```

- [ ] **Step 6: Escrever `deno.json` e `index.ts`**

`supabase/functions/admin-api/deno.json`:
```json
{ "imports": {} }
```

`supabase/functions/admin-api/index.ts`:
```ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, errorResponse, getRequestContext, json } from './_lib.ts';
import { authorize, requirePermission, RbacError, makeSupabaseDeps, type AdminIdentity } from './rbac.ts';
import type { AuditContext } from './audit.ts';

export type Handler = (
  params: Record<string, unknown>,
  identity: AdminIdentity,
  ctx: AuditContext,
) => Promise<unknown>;
export type HandlerMap = Record<string, Record<string, { permission: string; handler: Handler }>>;

// Registry. Handlers reais entram nas Tasks 6 a 8.
const HANDLERS: HandlerMap = {
  ping: {
    read: { permission: 'dashboard.read', handler: async () => ({ pong: true }) },
  },
};

const deps = makeSupabaseDeps();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  // Contexto da request computado UMA vez: o mesmo request_id vai para o header
  // X-Request-Id da resposta e para o handler (linha de auditoria nas Tasks 6-8).
  const ctx = getRequestContext(req);
  const rid = ctx.request_id;

  if (req.method !== 'POST') return errorResponse('validation', 'Use POST.', req, rid);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation', 'Corpo JSON invalido.', req, rid);
  }
  if (!body || typeof body !== 'object') {
    return errorResponse('validation', 'Corpo deve ser um objeto JSON.', req, rid);
  }
  const { resource, action, params = {} } = body as {
    resource?: string; action?: string; params?: Record<string, unknown>;
  };
  if (!resource || !action) return errorResponse('validation', 'resource e action sao obrigatorios.', req, rid);

  const entry = HANDLERS[resource]?.[action];
  if (!entry) return errorResponse('not_found', `Rota desconhecida: ${resource}/${action}.`, req, rid);

  try {
    const identity = await authorize(req, deps);
    requirePermission(identity, entry.permission);
    const data = await entry.handler(params, identity, ctx);
    return json({ data }, 200, req, rid);
  } catch (err) {
    if (err instanceof RbacError) return errorResponse(err.code, err.message, req, rid);
    const e = err as { code?: string; message?: string };
    // Erros das RPCs plpgsql chegam com hint no message; mapeamento fino nas Tasks 7-8.
    console.error('[admin-api]', resource, action, e?.message ?? err);
    return errorResponse('internal', 'Erro interno.', req, rid);
  }
});
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `deno test supabase/functions/admin-api/rbac_test.ts`
Expected: todos os testes PASS.

- [ ] **Step 8: Checar tipos**

Run: `deno check supabase/functions/admin-api/index.ts`
Expected: sem erro.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/admin-api/
git commit -m "feat(admin-api): core (cors, rbac com AAL2, audit context, router)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `admin-api` handler `dashboard/summary` + SQL de agregação

**Files:**
- Create: `supabase/functions/admin-api/handlers/dashboard.ts`
- Modify: `supabase/functions/admin-api/index.ts` (registrar handler)
- Create: `supabase/migrations/20260829130300_admin_dashboard_summary.sql`
- Create: `supabase/tests/manual/20260829130300_admin_dashboard_summary.test.sql`
- Test: `supabase/functions/admin-api/handlers/dashboard_test.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`.
- Produces:
  - SQL `admin_dashboard_summary(p_from timestamptz, p_to timestamptz) returns jsonb` — retorna `{ metrics: { <key>: { value: number|null, available: boolean } }, feed: [{ id, type, title, at, href }] }`.
  - `handlers/dashboard.ts`: `summary: Handler`. `params`: `{ range?: 'today'|'7d'|'30d'|'90d'|'custom', from?: string, to?: string }`. Resolve `range` para `[from,to]` (default `7d`), chama a RPC, devolve o jsonb. Métricas conhecidas sem fonte (`jobs_failed`, `jobs_pending`, `queue_depth`, `services_degraded`, `errors_24h`, `webhooks_failed`) já vêm `available:false` da RPC; o handler não inventa nada.
  - `METRIC_LABELS: Record<string, string>` exportado (rótulos pt-BR para a UI).

- [ ] **Step 1: Escrever `20260829130300_admin_dashboard_summary.test.sql`**

```sql
do $$
declare v jsonb;
begin
  v := public.admin_dashboard_summary(now() - interval '7 days', now());
  assert v ? 'metrics', 'faltou metrics';
  assert v ? 'feed', 'faltou feed';
  assert (v->'metrics'->'users_total'->>'available') = 'true', 'users_total deve ser available';
  assert (v->'metrics'->'jobs_failed'->>'available') = 'false', 'jobs_failed deve ser indisponivel';
  assert (v->'metrics'->'queue_depth'->>'available') = 'false', 'queue_depth deve ser indisponivel';
  assert (v->'metrics'->'webhooks_failed'->>'available') = 'false', 'webhooks_failed deve ser indisponivel no SP1';
  assert jsonb_typeof(v->'feed') = 'array', 'feed deve ser array';
  raise notice 'PASS dashboard summary';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260829130300_admin_dashboard_summary.test.sql`
Expected: `function public.admin_dashboard_summary(...) does not exist`.

- [ ] **Step 3: Escrever `20260829130300_admin_dashboard_summary.sql`**

```sql
-- SP1: agregacao do dashboard executivo. Metricas sem fonte real vem available:false.
create or replace function public.admin_dashboard_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m jsonb := '{}'::jsonb;
  feed jsonb := '[]'::jsonb;
  v_users_total bigint; v_users_active bigint; v_users_new bigint;
  v_subs_active bigint; v_subs_canceled bigint;
  v_offers_new bigint; v_links bigint; v_clicks bigint;
  v_sends bigint; v_sends_ok bigint; v_webhooks_recv bigint;
begin
  select count(*) into v_users_total from public.profiles;
  select count(*) into v_users_active from public.profiles where account_status in ('active','trialing');
  select count(*) into v_users_new from public.profiles where created_at between p_from and p_to;
  select count(*) into v_subs_active from public.subscriptions where status = 'active';
  select count(*) into v_subs_canceled from public.subscriptions where status in ('canceled','expired');
  select count(*) into v_offers_new from public.offers where created_at between p_from and p_to;
  select count(*) into v_links from public.offers where short_code is not null;
  select count(*) into v_clicks from public.clicks where created_at between p_from and p_to;
  select count(*) into v_sends from public.history where sent_at between p_from and p_to;
  select count(*) into v_sends_ok from public.history where sent_at between p_from and p_to and status = 'success';
  select count(*) into v_webhooks_recv from public.webhook_events where processed_at between p_from and p_to;

  m := jsonb_build_object(
    'users_total',      jsonb_build_object('value', v_users_total, 'available', true),
    'users_active',     jsonb_build_object('value', v_users_active, 'available', true),
    'users_new',        jsonb_build_object('value', v_users_new, 'available', true),
    'subs_active',      jsonb_build_object('value', v_subs_active, 'available', true),
    'subs_canceled',    jsonb_build_object('value', v_subs_canceled, 'available', true),
    'offers_created',   jsonb_build_object('value', v_offers_new, 'available', true),
    'links_processed',  jsonb_build_object('value', v_links, 'available', true),
    'clicks',           jsonb_build_object('value', v_clicks, 'available', true),
    'sends',            jsonb_build_object('value', v_sends, 'available', true),
    'sends_success_rate', jsonb_build_object(
        'value', case when v_sends > 0 then round((v_sends_ok::numeric / v_sends) * 100, 1) else null end,
        'available', v_sends > 0),
    'webhooks_received', jsonb_build_object('value', v_webhooks_recv, 'available', true),
    'webhooks_failed',  jsonb_build_object('value', null, 'available', false),
    'jobs_failed',      jsonb_build_object('value', null, 'available', false),
    'jobs_pending',     jsonb_build_object('value', null, 'available', false),
    'queue_depth',      jsonb_build_object('value', null, 'available', false),
    'errors_24h',       jsonb_build_object('value', null, 'available', false),
    'services_degraded',jsonb_build_object('value', null, 'available', false)
  );

  select coalesce(jsonb_agg(x order by x->>'at' desc), '[]'::jsonb) into feed from (
    select jsonb_build_object('id', p.id::text, 'type', 'user_registered',
      'title', coalesce(p.full_name, p.email), 'at', p.created_at, 'href', null) as x
    from public.profiles p where p.created_at between p_from and p_to
    union all
    select jsonb_build_object('id', o.id::text, 'type', 'promotion_created',
      'title', o.name, 'at', o.created_at, 'href', null)
    from public.offers o where o.created_at between p_from and p_to
    union all
    select jsonb_build_object('id', h.id::text, 'type', 'send',
      'title', h.offer_name, 'at', h.sent_at, 'href', null)
    from public.history h where h.sent_at between p_from and p_to
    union all
    select jsonb_build_object('id', w.id::text, 'type', 'webhook_received',
      'title', w.event_type, 'at', w.processed_at, 'href', null)
    from public.webhook_events w where w.processed_at between p_from and p_to
    union all
    select jsonb_build_object('id', a.id::text, 'type', 'admin_action',
      'title', a.action, 'at', a.created_at, 'href', null)
    from public.admin_audit_log a where a.created_at between p_from and p_to
    order by 1 desc
    limit 30
  ) s;

  return jsonb_build_object('metrics', m, 'feed', feed);
end;
$$;

revoke execute on function public.admin_dashboard_summary(timestamptz, timestamptz) from authenticated, anon;
grant execute on function public.admin_dashboard_summary(timestamptz, timestamptz) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260829130300_admin_dashboard_summary.test.sql`
Expected: `NOTICE: PASS dashboard summary`.

- [ ] **Step 5: Escrever `handlers/dashboard_test.ts`**

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveRange } from './dashboard.ts';

Deno.test('resolveRange 7d', () => {
  const { from, to } = resolveRange({ range: '7d' });
  assertEquals(to.getTime() - from.getTime() >= 6 * 864e5, true);
});

Deno.test('resolveRange custom exige from/to', () => {
  const { from, to } = resolveRange({ range: 'custom', from: '2026-08-01', to: '2026-08-10' });
  assertEquals(from.getUTCMonth(), 7);
  assertEquals(to.getUTCDate(), 10);
});

Deno.test('resolveRange default (sem range) = 7d', () => {
  const { from, to } = resolveRange({});
  assertEquals(to.getTime() - from.getTime() >= 6 * 864e5, true);
});
```

- [ ] **Step 6: Escrever `handlers/dashboard.ts`**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';

type RangeParams = { range?: string; from?: string; to?: string };

export function resolveRange(p: RangeParams): { from: Date; to: Date } {
  const to = new Date();
  if (p.range === 'custom' && p.from && p.to) {
    return { from: new Date(p.from), to: new Date(p.to) };
  }
  const days = p.range === 'today' ? 1 : p.range === '30d' ? 30 : p.range === '90d' ? 90 : 7;
  const from = new Date(to.getTime() - days * 864e5);
  return { from, to };
}

export const METRIC_LABELS: Record<string, string> = {
  users_total: 'Usuarios totais',
  users_active: 'Usuarios ativos',
  users_new: 'Novos usuarios no periodo',
  subs_active: 'Assinaturas ativas',
  subs_canceled: 'Assinaturas canceladas',
  offers_created: 'Promocoes criadas',
  links_processed: 'Links processados',
  clicks: 'Cliques',
  sends: 'Envios',
  sends_success_rate: 'Taxa de sucesso de envio (%)',
  webhooks_received: 'Webhooks recebidos',
  webhooks_failed: 'Webhooks falhos',
  jobs_failed: 'Jobs falhos',
  jobs_pending: 'Jobs pendentes',
  queue_depth: 'Fila (queue depth)',
  errors_24h: 'Erros nas ultimas 24h',
  services_degraded: 'Servicos degradados',
};

export const summary: Handler = async (params) => {
  const { from, to } = resolveRange(params as RangeParams);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_dashboard_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  return { range: { from: from.toISOString(), to: to.toISOString() }, labels: METRIC_LABELS, ...data };
};
```

- [ ] **Step 7: Registrar no `index.ts`**

Substituir o objeto `HANDLERS` por:
```ts
import * as dashboard from './handlers/dashboard.ts';

const HANDLERS: HandlerMap = {
  ping: { read: { permission: 'dashboard.read', handler: async () => ({ pong: true }) } },
  dashboard: { summary: { permission: 'dashboard.read', handler: dashboard.summary } },
};
```

- [ ] **Step 8: Rodar testes e checar tipos**

Run:
```bash
deno test supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS, sem erro de tipo.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/admin-api/ supabase/migrations/20260829130300_admin_dashboard_summary.sql supabase/tests/manual/20260829130300_admin_dashboard_summary.test.sql
git commit -m "feat(admin-api): dashboard/summary com metricas reais e indisponiveis marcadas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `admin-api` handler `admins/*` + mapeamento de erro das RPCs

**Files:**
- Create: `supabase/functions/admin-api/_roles.ts`
- Create: `supabase/functions/admin-api/handlers/_pg-errors.ts`
- Create: `supabase/functions/admin-api/handlers/admins.ts`
- Modify: `supabase/functions/admin-api/index.ts` (registrar `admins`, usar `mapPgError` no catch)
- Test: `supabase/functions/admin-api/handlers/pg_errors_test.ts`

> **Nota de bundling:** a Edge Function é empacotada só com o próprio diretório no `supabase functions deploy`. Não importar de `../../../../shared/`. Os 4 `ROLE_KEYS` são replicados em `admin-api/_roles.ts` (poucas strings estáticas; `shared/admin-permissions.ts` continua a fonte para o front e para o seed SQL).

**Interfaces:**
- Consumes: `Handler`, `serviceClient`, `RbacError`/`ErrorCode`.
- Produces:
  - `_pg-errors.ts`: `mapPgError(err: unknown): { code: ErrorCode; message: string } | null` — lê `err.hint` / substring do `message` das RPCs (`ADMIN_EXISTS`, `NOT_FOUND`, `CANNOT_SUSPEND_SELF`, `LAST_SUPER_ADMIN`, `ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN`) e `err.code` pg (`P0002`→`not_found`, `23505`→`conflict`). Retorna `null` quando não reconhece (o caller usa `internal`).
  - `admins.ts`: `list`, `invite`, `suspend`, `reactivate` (todos `Handler`).
    - `list(params)`: params vazio. Retorna `{ admins: Array<{ id, email, status, roleKeys: string[], mfaEnrolled: boolean, lastSignInAt: string|null, createdAt: string }> }`. `lastSignInAt` de `auth.users` via `auth.admin.listUsers` ou join; se indisponível, `null`.
    - `invite(params)`: `{ email: string, roleKeys?: string[] }`. Valida `email` não vazio e `roleKeys` ⊆ `ROLE_KEYS`. Chama `rpc('admin_invite', { p_actor: identity.adminId, p_email, p_role_keys, p_ctx })`.
    - `suspend(params)`: `{ adminId: string, reason?: string }`. `rpc('admin_suspend', ...)`.
    - `reactivate(params)`: `{ adminId: string }`. `rpc('admin_reactivate', ...)`.

- [ ] **Step 1: Escrever `handlers/pg_errors_test.ts`**

```ts
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { mapPgError } from './_pg-errors.ts';

Deno.test('reconhece ADMIN_EXISTS via hint', () => {
  assertEquals(mapPgError({ hint: 'ADMIN_EXISTS', message: 'ja e admin' })?.code, 'conflict');
});
Deno.test('reconhece NOT_FOUND', () => {
  assertEquals(mapPgError({ hint: 'NOT_FOUND', message: 'x' })?.code, 'not_found');
});
Deno.test('reconhece LAST_SUPER_ADMIN', () => {
  assertEquals(mapPgError({ hint: 'LAST_SUPER_ADMIN', message: 'x' })?.code, 'conflict');
});
Deno.test('reconhece CANNOT_SUSPEND_SELF', () => {
  assertEquals(mapPgError({ hint: 'CANNOT_SUSPEND_SELF', message: 'x' })?.code, 'validation');
});
Deno.test('pg P0002 sem hint -> not_found', () => {
  assertEquals(mapPgError({ code: 'P0002', message: 'x' })?.code, 'not_found');
});
Deno.test('desconhecido -> null', () => {
  assertEquals(mapPgError({ message: 'boom' }), null);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test supabase/functions/admin-api/handlers/pg_errors_test.ts`
Expected: FAIL, módulo não encontrado.

- [ ] **Step 3: Escrever `handlers/_pg-errors.ts`**

```ts
import type { ErrorCode } from '../_lib.ts';

const BY_HINT: Record<string, { code: ErrorCode; message: string }> = {
  ADMIN_EXISTS: { code: 'conflict', message: 'Esse usuario ja e administrador.' },
  NOT_FOUND: { code: 'not_found', message: 'Registro nao encontrado.' },
  CANNOT_SUSPEND_SELF: { code: 'validation', message: 'Voce nao pode suspender a si mesmo.' },
  LAST_SUPER_ADMIN: { code: 'conflict', message: 'Nao e possivel deixar o painel sem Super Admin ativo.' },
  ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN: { code: 'forbidden', message: 'So um Super Admin pode conceder o cargo Super Admin.' },
};

export function mapPgError(err: unknown): { code: ErrorCode; message: string } | null {
  const e = err as { hint?: string; code?: string; message?: string };
  if (e?.hint && BY_HINT[e.hint]) return BY_HINT[e.hint];
  if (e?.message) {
    for (const key of Object.keys(BY_HINT)) if (e.message.includes(key)) return BY_HINT[key];
  }
  if (e?.code === 'P0002') return { code: 'not_found', message: 'Registro nao encontrado.' };
  if (e?.code === '23505') return { code: 'conflict', message: 'Registro duplicado.' };
  return null;
}
```

- [ ] **Step 4: Escrever `_roles.ts` e `handlers/admins.ts`**

`supabase/functions/admin-api/_roles.ts`:
```ts
// Replica local dos cargos (bundling da Edge Function nao alcanca shared/).
// shared/admin-permissions.ts continua a fonte para o front e o seed SQL.
export const ROLE_KEYS = ['SUPER_ADMIN', 'SUPPORT', 'DEVELOPER', 'ANALYST'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
```

`supabase/functions/admin-api/handlers/admins.ts`:
```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';
import { ROLE_KEYS } from '../_roles.ts';

function reqString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

export const list: Handler = async () => {
  const svc = serviceClient();
  const { data: accounts, error } = await svc
    .from('admin_accounts')
    .select('id, user_id, email, status, mfa_enrolled_at, created_at')
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const { data: roleRows } = await svc.from('admin_user_roles').select('admin_id, role_key');
  const rolesByAdmin = new Map<string, string[]>();
  for (const r of roleRows ?? []) {
    const arr = rolesByAdmin.get(r.admin_id) ?? [];
    arr.push(r.role_key);
    rolesByAdmin.set(r.admin_id, arr);
  }

  const admins = (accounts ?? []).map((a) => ({
    id: a.id,
    email: a.email,
    status: a.status,
    roleKeys: rolesByAdmin.get(a.id) ?? [],
    mfaEnrolled: !!a.mfa_enrolled_at,
    lastSignInAt: null as string | null,
    createdAt: a.created_at,
  }));
  return { admins };
};

export const invite: Handler = async (params, identity, ctx) => {
  const email = reqString(params, 'email');
  const roleKeys = Array.isArray(params.roleKeys) ? (params.roleKeys as string[]) : [];
  for (const rk of roleKeys) {
    if (!ROLE_KEYS.includes(rk as (typeof ROLE_KEYS)[number])) {
      throw new RbacError('validation', `Cargo invalido: ${rk}`);
    }
  }
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_invite', {
    p_actor: identity.adminId,
    p_email: email,
    p_role_keys: roleKeys,
    p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const suspend: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const reason = typeof params.reason === 'string' ? params.reason : null;
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_suspend', {
    p_actor: identity.adminId, p_target: adminId, p_reason: reason, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const reactivate: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_reactivate', {
    p_actor: identity.adminId, p_target: adminId, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
```

> `ROLE_KEYS` vem de `admin-api/_roles.ts` (réplica local), nunca de `shared/` (bundling da Edge Function).

- [ ] **Step 5: Atualizar `index.ts`**

Adicionar no `catch`, antes do fallback `internal`:
```ts
import { mapPgError } from './handlers/_pg-errors.ts';
// ...
  } catch (err) {
    if (err instanceof RbacError) return errorResponse(err.code, err.message, req);
    const mapped = mapPgError(err);
    if (mapped) return errorResponse(mapped.code, mapped.message, req);
    console.error('[admin-api]', resource, action, (err as { message?: string })?.message ?? err);
    return errorResponse('internal', 'Erro interno.', req);
  }
```
E registrar:
```ts
import * as admins from './handlers/admins.ts';
// dentro de HANDLERS:
  admins: {
    list:       { permission: 'admins.read',   handler: admins.list },
    invite:     { permission: 'admins.manage', handler: admins.invite },
    suspend:    { permission: 'admins.manage', handler: admins.suspend },
    reactivate: { permission: 'admins.manage', handler: admins.reactivate },
  },
```

- [ ] **Step 6: Rodar testes e checar tipos**

Run:
```bash
deno test supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS.

- [ ] **Step 7: Teste de integração manual** (documentar resultado no commit; requer `supabase start` + um usuário admin com AAL2)

```bash
# obter um access_token AAL2 de contatogivaldo@outlook.com e:
curl -s -XPOST "$ADMIN_API_URL" -H "Authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"resource":"admins","action":"list"}' | jq
# esperado: { "data": { "admins": [ { "email": "contatogivaldo@outlook.com", "roleKeys": ["SUPER_ADMIN"] ... } ] } }
```

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/admin-api/
git commit -m "feat(admin-api): handlers admins/* (list, invite, suspend, reactivate)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: `admin-api` handlers `roles/*`, `audit/list` e `session/whoami`

**Files:**
- Create: `supabase/functions/admin-api/handlers/roles.ts`
- Create: `supabase/functions/admin-api/handlers/audit.ts`
- Create: `supabase/functions/admin-api/handlers/session.ts`
- Modify: `supabase/functions/admin-api/index.ts` (suportar `permission: null`, registrar `roles`, `audit`, `session`)
- Test: `supabase/functions/admin-api/handlers/roles_test.ts`

**Interfaces:**
- Consumes: `Handler`, `serviceClient`, `RbacError`, `AdminIdentity`.
- Produces:
  - `index.ts`: o tipo do registry passa a `{ permission: string | null; handler: Handler }`. Quando `permission === null`, `index.ts` roda só `authorize` (auth + AAL2 + admin ativo) e pula `requirePermission`.
  - `session.ts`: `whoami: Handler` — `permission: null`. Retorna `{ adminId, email, roleKeys, permissions }` a partir do `identity` (sem tocar o banco de novo). `permissions` é `Array.from(identity.permissions)`.
  - `roles.ts`:
    - `list: Handler` — params vazio. Retorna `{ roles: Array<{ key, label, description, permissions: string[] }>, permissions: Array<{ key, grp, description }> }`.
    - `assign: Handler` — `{ adminId: string, roleKey: string }`. `rpc('admin_assign_role', { p_actor, p_target, p_role_key, p_ctx })`.
    - `revoke: Handler` — `{ adminId: string, roleKey: string }`. `rpc('admin_revoke_role', ...)`.
  - `audit.ts`:
    - `list: Handler` — `{ page?: number, pageSize?: number, action?: string, entityType?: string, adminId?: string, from?: string, to?: string }`. `pageSize` clamp 1..100 (default 25), `page` >= 1 (default 1). Retorna `{ items: Array<row>, page, pageSize, total }`. Ordena `created_at desc`.

- [ ] **Step 1: Escrever `handlers/roles_test.ts`**

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { clampPage } from './audit.ts';

Deno.test('clampPage normaliza', () => {
  assertEquals(clampPage({ page: 0, pageSize: 999 }), { page: 1, pageSize: 100, offset: 0 });
  assertEquals(clampPage({}), { page: 1, pageSize: 25, offset: 0 });
  assertEquals(clampPage({ page: 3, pageSize: 10 }), { page: 3, pageSize: 10, offset: 20 });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test supabase/functions/admin-api/handlers/roles_test.ts`
Expected: FAIL, `./audit.ts` não encontrado.

- [ ] **Step 3: Escrever `handlers/roles.ts`**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

function reqString(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

export const list: Handler = async () => {
  const svc = serviceClient();
  const [{ data: roles }, { data: perms }, { data: rp }] = await Promise.all([
    svc.from('admin_roles').select('key, label, description').order('key'),
    svc.from('admin_permissions').select('key, grp, description').order('grp'),
    svc.from('admin_role_permissions').select('role_key, permission_key'),
  ]);
  const permsByRole = new Map<string, string[]>();
  for (const row of rp ?? []) {
    const arr = permsByRole.get(row.role_key) ?? [];
    arr.push(row.permission_key);
    permsByRole.set(row.role_key, arr);
  }
  return {
    roles: (roles ?? []).map((r) => ({ ...r, permissions: permsByRole.get(r.key) ?? [] })),
    permissions: perms ?? [],
  };
};

export const assign: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const roleKey = reqString(params, 'roleKey');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_assign_role', {
    p_actor: identity.adminId, p_target: adminId, p_role_key: roleKey, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const revoke: Handler = async (params, identity, ctx) => {
  const adminId = reqString(params, 'adminId');
  const roleKey = reqString(params, 'roleKey');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_revoke_role', {
    p_actor: identity.adminId, p_target: adminId, p_role_key: roleKey, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
```

- [ ] **Step 4: Escrever `handlers/audit.ts`**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';

export function clampPage(p: { page?: unknown; pageSize?: unknown }): { page: number; pageSize: number; offset: number } {
  const page = Math.max(1, Math.floor(Number(p.page) || 1));
  const pageSize = Math.min(100, Math.max(1, Math.floor(Number(p.pageSize) || 25)));
  return { page, pageSize, offset: (page - 1) * pageSize };
}

export const list: Handler = async (params) => {
  const { page, pageSize, offset } = clampPage(params);
  const svc = serviceClient();
  let q = svc
    .from('admin_audit_log')
    .select('id, admin_id, admin_email, action, entity_type, entity_id, before, after, reason, ip, user_agent, request_id, created_at', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (typeof params.action === 'string') q = q.eq('action', params.action);
  if (typeof params.entityType === 'string') q = q.eq('entity_type', params.entityType);
  if (typeof params.adminId === 'string') q = q.eq('admin_id', params.adminId);
  if (typeof params.from === 'string') q = q.gte('created_at', params.from);
  if (typeof params.to === 'string') q = q.lte('created_at', params.to);

  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return { items: data ?? [], page, pageSize, total: count ?? 0 };
};
```

- [ ] **Step 5: Escrever `handlers/session.ts`**

```ts
import type { Handler } from '../index.ts';

export const whoami: Handler = async (_params, identity) => ({
  adminId: identity.adminId,
  email: identity.email,
  roleKeys: identity.roleKeys,
  permissions: Array.from(identity.permissions),
});
```

- [ ] **Step 6: Atualizar `index.ts` para `permission: null` e registrar handlers**

Trocar o tipo do registry e o trecho de autorização (o `ctx` já é computado uma vez no topo do `serve` desde a Task 5; só a linha do `requirePermission` muda):
```ts
export type HandlerMap = Record<string, Record<string, { permission: string | null; handler: Handler }>>;
// ...
    const identity = await authorize(req, deps);
    if (entry.permission !== null) requirePermission(identity, entry.permission);
    const data = await entry.handler(params, identity, ctx);
```
Registrar:
```ts
import * as roles from './handlers/roles.ts';
import * as audit from './handlers/audit.ts';
import * as session from './handlers/session.ts';
// dentro de HANDLERS:
  session: {
    whoami: { permission: null, handler: session.whoami },
  },
  roles: {
    list:   { permission: 'roles.read',   handler: roles.list },
    assign: { permission: 'roles.manage', handler: roles.assign },
    revoke: { permission: 'roles.manage', handler: roles.revoke },
  },
  audit: {
    list: { permission: 'audit.read', handler: audit.list },
  },
```
Também trocar o `permission: 'dashboard.read'` do `ping` para manter (ping continua exigindo `dashboard.read`).

- [ ] **Step 7: Rodar testes e checar tipos**

Run:
```bash
deno test supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/admin-api/
git commit -m "feat(admin-api): handlers roles/*, audit/list e session/whoami

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Scaffold da app `admin/` + Vitest + guarda de hostname

**Files:**
- Create: `admin/package.json`, `admin/vite.config.ts`, `admin/vitest.config.ts`, `admin/src/vitest.setup.ts`, `admin/tsconfig.json`, `admin/tsconfig.node.json`, `admin/tailwind.config.js`, `admin/postcss.config.js`, `admin/index.html`, `admin/.env.example`, `admin/vercel.json`, `admin/.gitignore`
- Create: `admin/src/main.tsx`, `admin/src/App.tsx`, `admin/src/index.css`, `admin/src/vite-env.d.ts`
- Create: `admin/src/lib/env.ts`
- Create: `admin/src/lib/hostname-guard.ts`
- Test: `admin/src/lib/hostname-guard.test.ts`

**Interfaces:**
- Produces:
  - `admin/src/lib/env.ts`: `ENV` object `{ supabaseUrl: string; supabaseAnonKey: string; adminApiUrl: string; adminHostname: string; isProd: boolean }`. Lança em runtime se faltar `supabaseUrl`/`supabaseAnonKey`/`adminApiUrl`.
  - `admin/src/lib/hostname-guard.ts`: `isAllowedHost(hostname: string, isProd: boolean, allowedHost: string): boolean` — retorna `true` sempre que `!isProd`; em prod, `true` só se `hostname === allowedHost`.
  - `App.tsx` nesta task: só monta um placeholder `<div>Aflyo Admin</div>` atrás da guarda de hostname (roteamento real na Task 13).
  - Script `npm --prefix admin test` roda Vitest incluindo `../shared/**/*.test.ts`.

- [ ] **Step 1: Escrever `admin/src/lib/hostname-guard.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { isAllowedHost } from './hostname-guard';

describe('isAllowedHost', () => {
  it('libera qualquer host fora de producao', () => {
    expect(isAllowedHost('localhost', false, 'admin.aflyo.com.br')).toBe(true);
    expect(isAllowedHost('qualquer.coisa', false, 'admin.aflyo.com.br')).toBe(true);
  });
  it('em producao, so o host admin', () => {
    expect(isAllowedHost('admin.aflyo.com.br', true, 'admin.aflyo.com.br')).toBe(true);
    expect(isAllowedHost('www.aflyo.com.br', true, 'admin.aflyo.com.br')).toBe(false);
    expect(isAllowedHost('aflyo.com.br', true, 'admin.aflyo.com.br')).toBe(false);
  });
});
```

- [ ] **Step 2: Criar o scaffold**

`admin/package.json`:
```json
{
  "name": "aflyo-admin",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 5273 --strictPort",
    "build": "tsc -b && vite build",
    "preview": "vite preview --port 5273",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.105.4",
    "lucide-react": "^1.14.0",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "react-router-dom": "^7.18.2",
    "recharts": "^3.8.1"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.4.8",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "autoprefixer": "^10.5.0",
    "jsdom": "^25.0.0",
    "postcss": "^8.5.14",
    "tailwindcss": "^3.4.19",
    "typescript": "~6.0.2",
    "vite": "^8.0.10",
    "vitest": "^2.1.0"
  }
}
```

`admin/vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@shared': resolve(__dirname, '../shared') } },
  server: { port: 5273, strictPort: true },
});
```

`admin/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: { alias: { '@shared': resolve(__dirname, '../shared') } },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', '../shared/**/*.test.ts'],
  },
});
```

`admin/src/vitest.setup.ts`:
```ts
import '@testing-library/jest-dom/vitest';
```

`admin/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@shared/*": ["../shared/*"] }
  },
  "include": ["src", "../shared"]
}
```

`admin/tsconfig.node.json`:
```json
{ "compilerOptions": { "module": "ESNext", "moduleResolution": "bundler", "strict": true, "skipLibCheck": true, "types": ["node"] }, "include": ["vite.config.ts", "vitest.config.ts"] }
```

`admin/tailwind.config.js` (valores inline, cópia de `d:\ofertapro\tailwind.config.js`; ver nota no fim da Task):
```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Colar aqui o objeto `theme.extend` inteiro de d:\ofertapro\tailwind.config.js
      // (colors graphite/cloud/slate/mint/ice + aliases de brand, fontFamily,
      // borderRadius, boxShadow, keyframes, animation). Cópia verbatim.
    },
  },
  plugins: [],
};
```

`admin/postcss.config.js`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`admin/index.html`:
```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex, nofollow" />
    <title>Aflyo Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`admin/.env.example`:
```bash
VITE_SUPABASE_URL=https://zuqaccivowbzdfrpgekz.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_ADMIN_API_URL=https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/admin-api
VITE_ADMIN_HOSTNAME=admin.aflyo.com.br
```

`admin/vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(), payment=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' https://zuqaccivowbzdfrpgekz.supabase.co wss://zuqaccivowbzdfrpgekz.supabase.co; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" }
      ]
    }
  ]
}
```

`admin/.gitignore`:
```
node_modules
dist
.env
.env.local
```

`admin/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`admin/src/index.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: Implementar `admin/src/lib/env.ts`**

```ts
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Env ausente: ${name}`);
  return value;
}

export const ENV = {
  supabaseUrl: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  supabaseAnonKey: required('VITE_SUPABASE_ANON_KEY', import.meta.env.VITE_SUPABASE_ANON_KEY),
  adminApiUrl: required('VITE_ADMIN_API_URL', import.meta.env.VITE_ADMIN_API_URL),
  adminHostname: import.meta.env.VITE_ADMIN_HOSTNAME || 'admin.aflyo.com.br',
  isProd: import.meta.env.PROD,
};
```

- [ ] **Step 4: Implementar `admin/src/lib/hostname-guard.ts`**

```ts
export function isAllowedHost(hostname: string, isProd: boolean, allowedHost: string): boolean {
  if (!isProd) return true;
  return hostname === allowedHost;
}
```

- [ ] **Step 5: Implementar `admin/src/main.tsx` e `admin/src/App.tsx`**

`main.tsx`:
```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

`App.tsx` (placeholder desta task; roteamento real na Task 13):
```tsx
import { ENV } from './lib/env';
import { isAllowedHost } from './lib/hostname-guard';

export default function App() {
  if (!isAllowedHost(window.location.hostname, ENV.isProd, ENV.adminHostname)) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui' }}>
        <h1>Acesso nao autorizado</h1>
        <p>Este endereco nao expoe o painel administrativo.</p>
      </div>
    );
  }
  return <div style={{ padding: 40, fontFamily: 'system-ui' }}>Aflyo Admin</div>;
}
```

- [ ] **Step 6: Instalar e rodar os testes**

Run:
```bash
npm --prefix admin install
npm --prefix admin test
```
Expected: testes de `admin/src/lib/hostname-guard.test.ts` e `shared/admin-permissions.test.ts` PASS.

- [ ] **Step 7: Build**

Run: `npm --prefix admin run build`
Expected: build OK, gera `admin/dist`.

- [ ] **Step 8: Commit**

```bash
git add admin/ .gitignore
git commit -m "feat(admin): scaffold da app admin/ (Vite, Vitest, guarda de hostname, headers)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

> Nota tokens: para evitar pipeline de build de tokens no SP1, `admin/tailwind.config.js` inclui os valores de cor/tipografia inline (cópia de `d:\ofertapro\tailwind.config.js`). `shared/design/tokens.ts` continua sendo a referência única citada; unificar os dois configs num só é chore pós-SP1 (já anotado na Task 1).

---

## Task 10: `admin/` client Supabase + wrapper da `admin-api` + helper de permissão

**Files:**
- Create: `admin/src/lib/supabase.ts`
- Create: `admin/src/lib/admin-api.ts`
- Create: `admin/src/lib/permissions.ts`
- Test: `admin/src/lib/admin-api.test.ts`
- Test: `admin/src/lib/permissions.test.ts`

**Interfaces:**
- Consumes: `ENV` de `env.ts`.
- Produces:
  - `supabase.ts`: `export const supabase` (client com `auth: { storageKey: 'sb-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }`).
  - `admin-api.ts`:
    - `class AdminApiError extends Error { code: string; status: number }`
    - `callAdminApi<T = unknown>(resource: string, action: string, params?: Record<string, unknown>): Promise<T>` — pega o token via `supabase.auth.getSession()`, `POST` para `ENV.adminApiUrl` com `Authorization: Bearer`, `x-request-id` (uuid), body `{ resource, action, params }`. Em `res.ok` retorna `json.data as T`. Senão lança `AdminApiError` com `json.error.code`/`message`/`res.status`. Sem token → lança `AdminApiError('unauthenticated', 401)`.
    - `parseAdminApiResponse(status: number, body: unknown): { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } }` — função pura, testável.
  - `permissions.ts`: `hasPermission(granted: readonly string[], needed: string): boolean` — `true` se `granted` inclui `'SUPER_ADMIN'` (sentinela) ou `needed`.

- [ ] **Step 1: Escrever `admin/src/lib/permissions.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('true quando a permissao esta na lista', () => {
    expect(hasPermission(['dashboard.read', 'audit.read'], 'audit.read')).toBe(true);
  });
  it('false quando falta', () => {
    expect(hasPermission(['dashboard.read'], 'admins.manage')).toBe(false);
  });
  it('SUPER_ADMIN sentinela concede tudo', () => {
    expect(hasPermission(['SUPER_ADMIN'], 'qualquer.coisa')).toBe(true);
  });
});
```

- [ ] **Step 2: Escrever `admin/src/lib/admin-api.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { parseAdminApiResponse, AdminApiError } from './admin-api';

describe('parseAdminApiResponse', () => {
  it('200 com data', () => {
    expect(parseAdminApiResponse(200, { data: { x: 1 } })).toEqual({ ok: true, data: { x: 1 } });
  });
  it('403 com envelope de erro', () => {
    const r = parseAdminApiResponse(403, { error: { code: 'forbidden', message: 'x' } });
    expect(r).toEqual({ ok: false, error: { code: 'forbidden', message: 'x' } });
  });
  it('corpo inesperado vira internal', () => {
    const r = parseAdminApiResponse(500, 'boom');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('internal');
  });
});

describe('AdminApiError', () => {
  it('carrega code e status', () => {
    const e = new AdminApiError('forbidden', 'no', 403);
    expect(e.code).toBe('forbidden');
    expect(e.status).toBe(403);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm --prefix admin test`
Expected: FAIL, módulos `./permissions` e `./admin-api` não encontrados.

- [ ] **Step 4: Implementar `admin/src/lib/supabase.ts`**

```ts
import { createClient } from '@supabase/supabase-js';
import { ENV } from './env';

export const supabase = createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
  auth: {
    storageKey: 'sb-admin-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

- [ ] **Step 5: Implementar `admin/src/lib/permissions.ts`**

```ts
export function hasPermission(granted: readonly string[], needed: string): boolean {
  return granted.includes('SUPER_ADMIN') || granted.includes(needed);
}
```

- [ ] **Step 6: Implementar `admin/src/lib/admin-api.ts`**

```ts
import { ENV } from './env';
import { supabase } from './supabase';

export class AdminApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Parsed =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

export function parseAdminApiResponse(status: number, body: unknown): Parsed {
  if (status >= 200 && status < 300 && body && typeof body === 'object' && 'data' in body) {
    return { ok: true, data: (body as { data: unknown }).data };
  }
  if (body && typeof body === 'object' && 'error' in body) {
    const e = (body as { error: { code?: string; message?: string } }).error;
    return { ok: false, error: { code: e.code ?? 'internal', message: e.message ?? 'Erro.' } };
  }
  return { ok: false, error: { code: 'internal', message: 'Resposta inesperada da admin-api.' } };
}

export async function callAdminApi<T = unknown>(
  resource: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new AdminApiError('unauthenticated', 'Sessao ausente.', 401);

  let res: Response;
  try {
    res = await fetch(ENV.adminApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-request-id': crypto.randomUUID(),
      },
      body: JSON.stringify({ resource, action, params }),
    });
  } catch {
    throw new AdminApiError('internal', 'Falha de rede ao chamar a admin-api.', 0);
  }

  let body: unknown = null;
  try { body = await res.json(); } catch { /* body fica null */ }

  const parsed = parseAdminApiResponse(res.status, body);
  if (parsed.ok) return parsed.data as T;
  throw new AdminApiError(parsed.error.code, parsed.error.message, res.status);
}
```

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `npm --prefix admin test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add admin/src/lib/
git commit -m "feat(admin): client Supabase isolado, wrapper da admin-api e helper de permissao

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: `AdminAuthContext`, `ToastContext` e telas de entrada

**Files:**
- Create: `admin/src/context/AdminAuthContext.tsx`
- Create: `admin/src/context/ToastContext.tsx`
- Create: `admin/src/lib/auth-state.ts` (máquina de estados pura)
- Create: `admin/src/pages/Login.tsx`
- Create: `admin/src/pages/MfaEnroll.tsx`
- Create: `admin/src/pages/MfaChallenge.tsx`
- Create: `admin/src/pages/Unauthorized.tsx`
- Test: `admin/src/lib/auth-state.test.ts`
- Test: `admin/src/context/AdminAuthContext.test.tsx`

**Interfaces:**
- Consumes: `supabase`, `callAdminApi`, `AdminApiError`.
- Produces:
  - `auth-state.ts`:
    - `type AuthPhase = 'resolving' | 'anon' | 'needs_mfa_enroll' | 'needs_mfa_challenge' | 'not_admin' | 'ready'`
    - `type AalInfo = { currentLevel: 'aal1' | 'aal2' | null; nextLevel: 'aal1' | 'aal2' | null }`
    - `nextPhaseFromAal(hasSession: boolean, aal: AalInfo): Exclude<AuthPhase, 'resolving' | 'not_admin' | 'ready'>` — sem sessão → `anon`; `currentLevel==='aal2'` → (o caller então faz whoami; representar como `'ready'`? não: retornamos um marcador). Regra: retorna `anon` | `needs_mfa_enroll` | `needs_mfa_challenge`; se já `aal2`, retorna `'needs_mfa_challenge'` **não** se aplica, então a função retorna um quarto valor `'aal2_ok'`. Ajuste o tipo de retorno para incluir `'aal2_ok'`.
    - Regras exatas: `!hasSession` → `anon`. `currentLevel==='aal2'` → `aal2_ok`. `currentLevel==='aal1' && nextLevel==='aal2'` → `needs_mfa_challenge`. senão → `needs_mfa_enroll`.
  - `AdminAuthContext.tsx`:
    - `useAdminAuth(): { phase: AuthPhase; identity: { adminId: string; email: string; roleKeys: string[]; permissions: string[] } | null; error: string | null; refresh(): Promise<void>; signOut(): Promise<void> }`
    - `<AdminAuthProvider>` resolve: `getSession` → `mfa.getAuthenticatorAssuranceLevel()` → `nextPhaseFromAal` → se `aal2_ok`, `callAdminApi('session','whoami')`; sucesso → `phase='ready'` + `identity`; `AdminApiError` `forbidden`/`unauthenticated` → `phase='not_admin'`.
    - Assina `supabase.auth.onAuthStateChange` e re-resolve.
  - `ToastContext.tsx`: `useToast(): (msg: string, kind?: 'success'|'error'|'info') => void`, `<ToastProvider>`.
  - Telas: componentes default export sem props. `Login` usa `supabase.auth.signInWithPassword`. `MfaEnroll` usa `supabase.auth.mfa.enroll({ factorType: 'totp' })` + `challenge` + `verify`. `MfaChallenge` usa `mfa.challenge`/`verify` no fator existente. Cada uma chama `refresh()` do contexto ao concluir. `Unauthorized` é estática.

- [ ] **Step 1: Escrever `admin/src/lib/auth-state.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { nextPhaseFromAal } from './auth-state';

describe('nextPhaseFromAal', () => {
  it('sem sessao -> anon', () => {
    expect(nextPhaseFromAal(false, { currentLevel: null, nextLevel: null })).toBe('anon');
  });
  it('aal2 -> aal2_ok', () => {
    expect(nextPhaseFromAal(true, { currentLevel: 'aal2', nextLevel: 'aal2' })).toBe('aal2_ok');
  });
  it('tem fator mas sessao aal1 -> challenge', () => {
    expect(nextPhaseFromAal(true, { currentLevel: 'aal1', nextLevel: 'aal2' })).toBe('needs_mfa_challenge');
  });
  it('sem fator -> enroll', () => {
    expect(nextPhaseFromAal(true, { currentLevel: 'aal1', nextLevel: 'aal1' })).toBe('needs_mfa_enroll');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test`
Expected: FAIL, `./auth-state` não encontrado.

- [ ] **Step 3: Implementar `admin/src/lib/auth-state.ts`**

```ts
export type AuthPhase =
  | 'resolving' | 'anon' | 'needs_mfa_enroll' | 'needs_mfa_challenge' | 'not_admin' | 'ready';

export type AalLevel = 'aal1' | 'aal2' | null;
export type AalInfo = { currentLevel: AalLevel; nextLevel: AalLevel };

export type AalOutcome = 'anon' | 'needs_mfa_enroll' | 'needs_mfa_challenge' | 'aal2_ok';

export function nextPhaseFromAal(hasSession: boolean, aal: AalInfo): AalOutcome {
  if (!hasSession) return 'anon';
  if (aal.currentLevel === 'aal2') return 'aal2_ok';
  if (aal.currentLevel === 'aal1' && aal.nextLevel === 'aal2') return 'needs_mfa_challenge';
  return 'needs_mfa_enroll';
}
```

- [ ] **Step 4: Implementar `admin/src/context/ToastContext.tsx`**

Porte enxuto do `src/context/ToastContext.tsx` do app raiz: `createContext`, `useToast()`, provider com lista de toasts em estado, auto-dismiss 4s, render fixo no canto. (Reaproveitar a mesma API: `toast(message, kind)`.) Sem travessão nos textos.

- [ ] **Step 5: Implementar `admin/src/context/AdminAuthContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { callAdminApi, AdminApiError } from '../lib/admin-api';
import { nextPhaseFromAal, type AuthPhase } from '../lib/auth-state';

type Identity = { adminId: string; email: string; roleKeys: string[]; permissions: string[] };
type Ctx = {
  phase: AuthPhase;
  identity: Identity | null;
  error: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AdminAuthContext = createContext<Ctx | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>('resolving');
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);

  const resolve = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setPhase('anon'); setIdentity(null); return; }
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const outcome = nextPhaseFromAal(true, {
        currentLevel: (aal?.currentLevel as 'aal1' | 'aal2' | null) ?? null,
        nextLevel: (aal?.nextLevel as 'aal1' | 'aal2' | null) ?? null,
      });
      if (outcome === 'needs_mfa_enroll') { setPhase('needs_mfa_enroll'); return; }
      if (outcome === 'needs_mfa_challenge') { setPhase('needs_mfa_challenge'); return; }
      try {
        const who = await callAdminApi<Identity>('session', 'whoami');
        setIdentity(who);
        setPhase('ready');
      } catch (e) {
        if (e instanceof AdminApiError && (e.code === 'forbidden' || e.code === 'unauthenticated')) {
          setIdentity(null);
          setPhase('not_admin');
        } else {
          setError(e instanceof Error ? e.message : 'Erro ao validar acesso.');
          setPhase('not_admin');
        }
      }
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    resolve();
    const { data } = supabase.auth.onAuthStateChange(() => { resolve(); });
    return () => data.subscription.unsubscribe();
  }, [resolve]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setIdentity(null);
    setPhase('anon');
  }, []);

  return (
    <AdminAuthContext.Provider value={{ phase, identity, error, refresh: resolve, signOut }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth(): Ctx {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error('useAdminAuth fora do AdminAuthProvider');
  return ctx;
}
```

- [ ] **Step 6: Escrever `admin/src/context/AdminAuthContext.test.tsx`**

Mockar `../lib/supabase` e `../lib/admin-api` com `vi.mock`. Casos:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext';

const getSession = vi.fn();
const getAal = vi.fn();
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      mfa: { getAuthenticatorAssuranceLevel: (...a: unknown[]) => getAal(...a) },
      onAuthStateChange: (...a: unknown[]) => onAuthStateChange(...a),
      signOut: vi.fn(),
    },
  },
}));
const callAdminApi = vi.fn();
vi.mock('../lib/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/admin-api')>('../lib/admin-api');
  return { ...actual, callAdminApi: (...a: unknown[]) => callAdminApi(...a) };
});

function Probe() {
  const { phase, identity } = useAdminAuth();
  return <div>phase:{phase}{identity ? `|perm:${identity.permissions.join(',')}` : ''}</div>;
}

beforeEach(() => { getSession.mockReset(); getAal.mockReset(); callAdminApi.mockReset(); });

describe('AdminAuthProvider', () => {
  it('sem sessao -> anon', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:anon/)).toBeInTheDocument());
  });

  it('sessao sem fator MFA -> needs_mfa_enroll', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:needs_mfa_enroll/)).toBeInTheDocument());
  });

  it('aal2 + whoami ok -> ready com permissoes', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } });
    callAdminApi.mockResolvedValue({ adminId: 'a1', email: 'e', roleKeys: ['DEVELOPER'], permissions: ['dashboard.read'] });
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:ready\|perm:dashboard.read/)).toBeInTheDocument());
  });

  it('aal2 + whoami forbidden -> not_admin', async () => {
    const { AdminApiError } = await vi.importActual<typeof import('../lib/admin-api')>('../lib/admin-api');
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } });
    callAdminApi.mockRejectedValue(new AdminApiError('forbidden', 'no', 403));
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:not_admin/)).toBeInTheDocument());
  });
});
```

- [ ] **Step 7: Implementar as telas** (`Login.tsx`, `MfaEnroll.tsx`, `MfaChallenge.tsx`, `Unauthorized.tsx`)

Requisitos concretos:
- `Login.tsx`: form com e-mail + senha + link "Esqueci a senha" (aponta para o fluxo de reset do app do cliente, `https://www.aflyo.com.br/forgot`, `target="_blank"`). Submit → `supabase.auth.signInWithPassword({ email, password })`. Erro → `toast(error.message, 'error')`. Sucesso → `refresh()`. Sem link/rota de cadastro. Texto do rodapé: "Acesso restrito. Se voce nao e da equipe, feche esta pagina."
- `MfaEnroll.tsx`: ao montar, `supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Aflyo Admin' })`. Mostrar `data.totp.qr_code` (SVG data URI) + `data.totp.secret` como texto copiável. Campo de 6 dígitos → `mfa.challenge({ factorId })` então `mfa.verify({ factorId, challengeId, code })`. Sucesso → `POST session/whoami` não; apenas `refresh()`. Em erro de código, `toast`.
- `MfaChallenge.tsx`: listar fatores via `supabase.auth.mfa.listFactors()`, pegar o primeiro TOTP verificado, `challenge` + `verify` com código de 6 dígitos. Sucesso → `refresh()`.
- `Unauthorized.tsx`: estática, "Acesso nao autorizado" + "Este endereco nao expoe o painel administrativo." Sem link para o app.
- Todas usam apenas Tailwind + tokens; nada de dado mock.

- [ ] **Step 8: Rodar testes**

Run: `npm --prefix admin test`
Expected: `auth-state.test.ts` e `AdminAuthContext.test.tsx` PASS.

- [ ] **Step 9: Commit**

```bash
git add admin/src/context/ admin/src/lib/auth-state.ts admin/src/lib/auth-state.test.ts admin/src/pages/
git commit -m "feat(admin): contexto de auth com gate de MFA (AAL2) e telas de entrada

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 12: Primitivas de UI (`Badge`, `Skeleton`, `EmptyState`, `ErrorState`, `StatCard`, `DataTable`)

**Files:**
- Create: `admin/src/components/ui/Badge.tsx`
- Create: `admin/src/components/ui/Skeleton.tsx`
- Create: `admin/src/components/ui/EmptyState.tsx`
- Create: `admin/src/components/ui/ErrorState.tsx`
- Create: `admin/src/components/ui/StatCard.tsx`
- Create: `admin/src/components/ui/DataTable.tsx`
- Test: `admin/src/components/ui/StatCard.test.tsx`
- Test: `admin/src/components/ui/DataTable.test.tsx`

**Interfaces:**
- Produces:
  - `Badge`: `({ tone?: 'neutral'|'success'|'warning'|'danger'|'info', children }) => JSX`. Classes por tom.
  - `Skeleton`: `({ className?: string }) => JSX` (bloco `animate-pulse`).
  - `EmptyState`: `({ title: string, hint?: string, icon?: LucideIcon }) => JSX`.
  - `ErrorState`: `({ title?: string, message: string, onRetry?: () => void }) => JSX`.
  - `StatCard`: `({ label: string, value: number | null, available: boolean, suffix?: string }) => JSX`. Se `!available` renderiza o texto **"Dados indisponiveis"** e aplica `aria-disabled`. Se `available` formata `value` com `Intl.NumberFormat('pt-BR')` + `suffix`.
  - `DataTable<Row>`: props
    ```ts
    type Column<Row> = { key: string; header: string; render?: (row: Row) => React.ReactNode; className?: string };
    type DataTableProps<Row> = {
      columns: Column<Row>[];
      rows: Row[];
      rowKey: (row: Row) => string;
      loading?: boolean;
      error?: string | null;
      emptyTitle?: string;
      onRetry?: () => void;
      pagination?: { page: number; pageSize: number; total: number; onPageChange: (page: number) => void };
    };
    ```
    Comporta: `loading` → linhas de `Skeleton`; `error` → `<ErrorState>`; `rows.length === 0` → `<EmptyState>`; senão tabela + controles de paginação (Anterior/Próxima, "página X de Y"). Scroll horizontal em container `overflow-x-auto`.

- [ ] **Step 1: Escrever `admin/src/components/ui/StatCard.test.tsx`**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('mostra "Dados indisponiveis" quando available e false', () => {
    render(<StatCard label="Jobs falhos" value={null} available={false} />);
    expect(screen.getByText('Dados indisponiveis')).toBeInTheDocument();
  });
  it('formata numero em pt-BR quando available', () => {
    render(<StatCard label="Usuarios" value={1234} available />);
    expect(screen.getByText('1.234')).toBeInTheDocument();
  });
  it('aplica suffix', () => {
    render(<StatCard label="Taxa" value={98.5} available suffix="%" />);
    expect(screen.getByText('98,5%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Escrever `admin/src/components/ui/DataTable.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from './DataTable';

type Row = { id: string; name: string };
const cols = [{ key: 'name', header: 'Nome' }];

describe('DataTable', () => {
  it('estado vazio', () => {
    render(<DataTable<Row> columns={cols} rows={[]} rowKey={(r) => r.id} emptyTitle="Nada aqui" />);
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
  });
  it('estado de erro com retry', async () => {
    const onRetry = vi.fn();
    render(<DataTable<Row> columns={cols} rows={[]} rowKey={(r) => r.id} error="falhou" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it('renderiza linhas e paginacao', async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable<Row>
        columns={cols}
        rows={[{ id: '1', name: 'Ana' }]}
        rowKey={(r) => r.id}
        pagination={{ page: 1, pageSize: 25, total: 60, onPageChange }}
      />,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /proxima/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm --prefix admin test`
Expected: FAIL, componentes não encontrados.

- [ ] **Step 4: Implementar as 6 primitivas**

Cada uma como componente funcional tipado, só Tailwind. `StatCard` usa `new Intl.NumberFormat('pt-BR').format(value)` e concatena `suffix`. `DataTable` implementa a lógica de estados descrita nas Interfaces; botão de retry com nome acessível "Tentar de novo"; botões de paginação "Anterior" / "Proxima" com `disabled` nos limites; texto "pagina {page} de {Math.max(1, Math.ceil(total/pageSize))}". Sem travessão nos textos.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm --prefix admin test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/src/components/ui/
git commit -m "feat(admin): primitivas de UI (StatCard com indisponivel, DataTable, estados)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 13: Shell (`AdminLayout`, `Sidebar`, `Topbar`, `Breadcrumbs`, `RequirePermission`) + roteamento

**Files:**
- Create: `admin/src/components/AdminLayout.tsx`
- Create: `admin/src/components/Sidebar.tsx`
- Create: `admin/src/components/Topbar.tsx`
- Create: `admin/src/components/Breadcrumbs.tsx`
- Create: `admin/src/components/RequirePermission.tsx`
- Create: `admin/src/nav.ts` (definição do menu)
- Modify: `admin/src/App.tsx` (roteamento real, gates encadeados)
- Test: `admin/src/components/RequirePermission.test.tsx`
- Test: `admin/src/App.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth`, `hasPermission`, primitivas de UI, `isAllowedHost`, `ENV`.
- Produces:
  - `nav.ts`: `type NavItem = { label: string; to?: string; permission?: string; icon: LucideIcon; comingSoon?: boolean }`; `type NavSection = { title: string; items: NavItem[] }`; `NAV: NavSection[]` cobrindo o menu da seção 14 do spec. Só ativos no SP1: `{ to: '/', permission: 'dashboard.read' }` (Dashboard), `{ to: '/admins', permission: 'admins.read' }`, `{ to: '/roles', permission: 'roles.read' }`, `{ to: '/audit', permission: 'audit.read' }`. Todo o resto `comingSoon: true`, sem `to`.
  - `RequirePermission.tsx`: `({ permission: string, children }) => JSX`. Lê `identity.permissions` do contexto; se `hasPermission` falha, renderiza `<ErrorState message="Voce nao tem permissao para ver esta area." />` (403 visual), não redireciona.
  - `AdminLayout.tsx`: `<div>` grid com `<Sidebar>` (colapsável, estado em `localStorage` `admin:sidebar`), `<Topbar>` (e-mail do admin + botão Sair), `<Breadcrumbs>`, `<main><Outlet/></main>`.
  - `App.tsx`: encadeia guardas nesta ordem: (1) `isAllowedHost` falso → `<Unauthorized/>`. (2) `AdminAuthProvider` + `ToastProvider`. (3) por `phase`: `resolving` → loader; `anon` → `<Login/>`; `needs_mfa_enroll` → `<MfaEnroll/>`; `needs_mfa_challenge` → `<MfaChallenge/>`; `not_admin` → `<Unauthorized/>` (variante "sua conta nao tem acesso"); `ready` → `<BrowserRouter>` com `<AdminLayout>` e as rotas. Nenhuma rota da área logada monta antes de `phase === 'ready'` (sem flash).

- [ ] **Step 1: Escrever `admin/src/components/RequirePermission.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RequirePermission from './RequirePermission';

vi.mock('../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ identity: { permissions: ['dashboard.read'] } }),
}));

describe('RequirePermission', () => {
  it('renderiza filhos quando tem a permissao', () => {
    render(<RequirePermission permission="dashboard.read"><div>ok</div></RequirePermission>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
  it('bloqueia quando falta', () => {
    render(<RequirePermission permission="admins.manage"><div>ok</div></RequirePermission>);
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
    expect(screen.getByText(/nao tem permissao/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Escrever `admin/src/App.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const phaseRef = { current: 'resolving' as string };
vi.mock('./context/AdminAuthContext', () => ({
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAdminAuth: () => ({ phase: phaseRef.current, identity: phaseRef.current === 'ready'
    ? { adminId: 'a', email: 'e@x.c', roleKeys: ['SUPER_ADMIN'], permissions: [] } : null,
    error: null, refresh: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('./lib/env', () => ({ ENV: { isProd: false, adminHostname: 'admin.aflyo.com.br', adminApiUrl: 'x', supabaseUrl: 'x', supabaseAnonKey: 'x' } }));

import App from './App';

beforeEach(() => { phaseRef.current = 'resolving'; });

describe('App gates', () => {
  it('phase anon -> tela de login', async () => {
    phaseRef.current = 'anon';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/entrar/i)).toBeInTheDocument());
  });
  it('phase not_admin -> acesso nao autorizado', async () => {
    phaseRef.current = 'not_admin';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/nao autorizado|nao tem acesso/i)).toBeInTheDocument());
  });
  it('phase ready -> shell com Dashboard', async () => {
    phaseRef.current = 'ready';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/dashboard/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm --prefix admin test`
Expected: FAIL (componentes/rotas ausentes).

- [ ] **Step 4: Implementar `nav.ts`, `RequirePermission.tsx`, `Breadcrumbs.tsx`, `Topbar.tsx`, `Sidebar.tsx`, `AdminLayout.tsx`**

Conteúdo concreto:
- `nav.ts`: exporta `NAV` com seções "Visao geral", "Usuarios", "Operacao", "Suporte", "Integracoes", "Monitoramento", "Seguranca", "Sistema", "Administracao". Cada item com `icon` de `lucide-react`. Ativos: Dashboard (`/`), Administradores (`/admins`), Cargos (`/roles`), Auditoria (`/audit`). Resto `comingSoon: true`.
- `Sidebar.tsx`: renderiza `NAV`; item com `comingSoon` aparece com opacidade reduzida, `aria-disabled`, tag "Em breve", sem link; item ativo usa `NavLink`. Só mostra itens cuja `permission` o admin tem (ou sem `permission`). Botão de colapsar persiste em `localStorage` (`try/catch`).
- `Topbar.tsx`: mostra `identity.email`, botão "Sair" → `signOut()`.
- `Breadcrumbs.tsx`: deriva do `useLocation().pathname` contra `NAV`.
- `RequirePermission.tsx`: conforme Interfaces.
- `AdminLayout.tsx`: grid CSS, `<Outlet/>` no `<main>`.

- [ ] **Step 5: Implementar `admin/src/App.tsx`** (substitui o placeholder da Task 9)

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ENV } from './lib/env';
import { isAllowedHost } from './lib/hostname-guard';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import { ToastProvider } from './context/ToastContext';
import AdminLayout from './components/AdminLayout';
import RequirePermission from './components/RequirePermission';
import Login from './pages/Login';
import MfaEnroll from './pages/MfaEnroll';
import MfaChallenge from './pages/MfaChallenge';
import Unauthorized from './pages/Unauthorized';
import Dashboard from './pages/Dashboard';
import AdminsList from './pages/admins/AdminsList';
import InviteAdmin from './pages/admins/InviteAdmin';
import RolesList from './pages/roles/RolesList';
import AuditList from './pages/audit/AuditList';

function Gate() {
  const { phase } = useAdminAuth();
  if (phase === 'resolving') return <div className="min-h-screen grid place-items-center">Carregando...</div>;
  if (phase === 'anon') return <Login />;
  if (phase === 'needs_mfa_enroll') return <MfaEnroll />;
  if (phase === 'needs_mfa_challenge') return <MfaChallenge />;
  if (phase === 'not_admin') return <Unauthorized variant="no-access" />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AdminLayout />}>
          <Route path="/" element={<RequirePermission permission="dashboard.read"><Dashboard /></RequirePermission>} />
          <Route path="/admins" element={<RequirePermission permission="admins.read"><AdminsList /></RequirePermission>} />
          <Route path="/admins/invite" element={<RequirePermission permission="admins.manage"><InviteAdmin /></RequirePermission>} />
          <Route path="/roles" element={<RequirePermission permission="roles.read"><RolesList /></RequirePermission>} />
          <Route path="/audit" element={<RequirePermission permission="audit.read"><AuditList /></RequirePermission>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  if (!isAllowedHost(window.location.hostname, ENV.isProd, ENV.adminHostname)) {
    return <Unauthorized variant="wrong-host" />;
  }
  return (
    <ToastProvider>
      <AdminAuthProvider>
        <Gate />
      </AdminAuthProvider>
    </ToastProvider>
  );
}
```
> `Unauthorized` ganha prop `variant?: 'wrong-host' | 'no-access'` (default `'wrong-host'`), textos diferentes por variante. Ajustar o componente criado na Task 11. `AuditList` é criada na Task 15.

- [ ] **Step 6: Rodar testes e checar build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: testes PASS, build OK.

- [ ] **Step 7: Commit**

```bash
git add admin/src/
git commit -m "feat(admin): shell (layout, sidebar, guardas) e roteamento com gates encadeados

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 14: Página Dashboard

**Files:**
- Create: `admin/src/pages/Dashboard.tsx`
- Create: `admin/src/lib/use-async.ts` (hook genérico de fetch)
- Test: `admin/src/lib/use-async.test.tsx`
- Test: `admin/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `StatCard`, `Badge`, `Skeleton`, `ErrorState`, `METRIC_LABELS` (reimplementado no front, ver nota).
- Produces:
  - `use-async.ts`: `useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void }`.
  - `Dashboard.tsx`: default export. Estado: filtro de range (`today|7d|30d|90d`), default `7d`. Chama `callAdminApi<DashboardSummary>('dashboard', 'summary', { range })`. Renderiza grid de `StatCard` (uma por métrica, na ordem de `DASHBOARD_METRIC_ORDER`), passando `available` e `value`. Abaixo, "Atividade recente" com o `feed` (lista, cada item com tipo traduzido e timestamp relativo). `loading` → skeletons; `error` → `<ErrorState onRetry={reload}>`.
  - `type DashboardSummary = { range: {from:string;to:string}; labels: Record<string,string>; metrics: Record<string, { value: number|null; available: boolean }>; feed: Array<{ id: string; type: string; title: string; at: string; href: string|null }> }`.
  - `DASHBOARD_METRIC_ORDER: string[]` e `FEED_TYPE_LABELS: Record<string,string>` em `Dashboard.tsx`.

- [ ] **Step 1: Escrever `admin/src/lib/use-async.test.tsx`**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAsync } from './use-async';

describe('useAsync', () => {
  it('resolve dados', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve(42), []));
    await waitFor(() => expect(result.current.data).toBe(42));
    expect(result.current.loading).toBe(false);
  });
  it('captura erro', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.reject(new Error('x')), []));
    await waitFor(() => expect(result.current.error).toBe('x'));
  });
  it('reload re-executa', async () => {
    const fn = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.data).toBe(1));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.data).toBe(2));
  });
});
```

- [ ] **Step 2: Escrever `admin/src/pages/Dashboard.test.tsx`**

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const callAdminApi = vi.fn();
vi.mock('../lib/admin-api', () => ({ callAdminApi: (...a: unknown[]) => callAdminApi(...a), AdminApiError: class extends Error {} }));

import Dashboard from './Dashboard';

beforeEach(() => callAdminApi.mockReset());

const payload = {
  range: { from: 'x', to: 'y' },
  labels: {},
  metrics: {
    users_total: { value: 1200, available: true },
    jobs_failed: { value: null, available: false },
  },
  feed: [{ id: '1', type: 'user_registered', title: 'Ana', at: new Date().toISOString(), href: null }],
};

describe('Dashboard', () => {
  it('mostra metrica real e indisponivel', async () => {
    callAdminApi.mockResolvedValue(payload);
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    expect(screen.getByText('Dados indisponiveis')).toBeInTheDocument();
  });
  it('mostra erro com retry', async () => {
    callAdminApi.mockRejectedValue(new Error('falhou'));
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/falhou|nao foi possivel/i)).toBeInTheDocument());
  });
});
```

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npm --prefix admin test`
Expected: FAIL.

- [ ] **Step 4: Implementar `use-async.ts` e `Dashboard.tsx`**

`use-async.ts`: hook com `useState` (`data`, `loading`, `error`), `useEffect` que roda `fn` e trata unmount (flag `alive`), `reload` incrementa um `nonce` no dep array interno. `error` = `e instanceof Error ? e.message : String(e)`.

`Dashboard.tsx`: conforme Interfaces. `DASHBOARD_METRIC_ORDER` = `['users_total','users_active','users_new','subs_active','subs_canceled','offers_created','links_processed','clicks','sends','sends_success_rate','webhooks_received','webhooks_failed','jobs_failed','jobs_pending','queue_depth','errors_24h','services_degraded']`. Rótulos: usar `data.labels[key]` com fallback para um mapa local. `sends_success_rate` passa `suffix="%"`. Feed: `FEED_TYPE_LABELS = { user_registered: 'Usuario registrado', promotion_created: 'Promocao criada', send: 'Envio', webhook_received: 'Webhook recebido', admin_action: 'Acao de admin' }`; timestamp via `Intl.RelativeTimeFormat('pt-BR')` ou `toLocaleString('pt-BR')`. Sem travessão.

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm --prefix admin test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/Dashboard.tsx admin/src/pages/Dashboard.test.tsx admin/src/lib/use-async.ts admin/src/lib/use-async.test.tsx
git commit -m "feat(admin): pagina Dashboard com metricas reais e indisponiveis + feed

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 15: Páginas Administradores, Convidar admin, Cargos, Auditoria

**Files:**
- Create: `admin/src/pages/admins/AdminsList.tsx`
- Create: `admin/src/pages/admins/InviteAdmin.tsx`
- Create: `admin/src/pages/roles/RolesList.tsx`
- Create: `admin/src/pages/audit/AuditList.tsx`
- Test: `admin/src/pages/admins/AdminsList.test.tsx`
- Test: `admin/src/pages/admins/InviteAdmin.test.tsx`
- Test: `admin/src/pages/roles/RolesList.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `DataTable`, `Badge`, `useToast`, `useAdminAuth`, `hasPermission`, `ROLES`/`ROLE_KEYS` de `@shared/admin-permissions`.
- Produces:
  - `AdminsList.tsx`: `useAsync(() => callAdminApi('admins','list'))`. `DataTable` com colunas: e-mail, status (`Badge`), cargos (lista de `Badge`), MFA (sim/nao), criado em. Ações por linha (só se `hasPermission(permissions,'admins.manage')`): "Suspender" (abre modal de confirmação com campo motivo obrigatório) → `callAdminApi('admins','suspend',{adminId,reason})`; "Reativar" → `callAdminApi('admins','reactivate',{adminId})`. Botão no topo "Convidar admin" (link para `/admins/invite`) só com `admins.manage`. Sucesso/erro → `toast`. Após ação, `reload()`.
  - `InviteAdmin.tsx`: form com e-mail + checkboxes de cargos (de `ROLES`). Submit → `callAdminApi('admins','invite',{email,roleKeys})`. `AdminApiError` code `not_found` → mensagem "Essa pessoa precisa criar uma conta no Aflyo primeiro." `conflict` → "Ja e administrador." Sucesso → `toast` + navega para `/admins`.
  - `RolesList.tsx`: `useAsync(() => callAdminApi('roles','list'))`. Mostra os 4 cargos como cards, cada um listando as permissões agrupadas por `grp`. Seção "Atribuir cargo": select de admin (de `admins/list`) + select de cargo + botão, só com `roles.manage` → `callAdminApi('roles','assign',{adminId,roleKey})`; botão de revogar ao lado de cada cargo já atribuído → `callAdminApi('roles','revoke',...)`. Erros mapeados (`LAST_SUPER_ADMIN`, `ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN`) → `toast` com a mensagem do erro.
  - `AuditList.tsx`: `DataTable` paginado. Estado de página na URL (`useSearchParams`, `?page=`). Colunas: data, admin (e-mail via lookup opcional ou `admin_id`), ação, entidade, motivo. Linha expansível mostra `before`/`after` como JSON formatado. `pageSize` fixo 25.

- [ ] **Step 1: Escrever os testes**

`AdminsList.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  callAdminApi: vi.fn(),
  permissions: { value: ['admins.read', 'admins.manage'] as string[] },
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: h.callAdminApi, AdminApiError: class extends Error { code = 'x'; } }));
vi.mock('../../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ identity: { permissions: h.permissions.value } }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

const callAdminApi = h.callAdminApi;
const currentPermissions = h.permissions;

import AdminsList from './AdminsList';

const ONE_ADMIN = { admins: [
  { id: 'a1', email: 'super@aflyo.com', status: 'active', roleKeys: ['SUPER_ADMIN'], mfaEnrolled: true, lastSignInAt: null, createdAt: '2026-08-29' },
] };

beforeEach(() => {
  callAdminApi.mockReset();
  currentPermissions.value = ['admins.read', 'admins.manage'];
});

it('lista admins e mostra acao de suspender para quem tem admins.manage', async () => {
  callAdminApi.mockResolvedValue(ONE_ADMIN);
  render(<MemoryRouter><AdminsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('super@aflyo.com')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /suspender/i })).toBeInTheDocument();
});

it('esconde acoes sem admins.manage', async () => {
  currentPermissions.value = ['admins.read'];
  callAdminApi.mockResolvedValue(ONE_ADMIN);
  render(<MemoryRouter><AdminsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('super@aflyo.com')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /suspender/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /convidar admin/i })).not.toBeInTheDocument();
});
```
> A referência mutável `currentPermissions` funciona porque a factory do `vi.mock` lê `currentPermissions.value` a cada chamada de `useAdminAuth`, e cada teste ajusta o valor antes do `render`.

`InviteAdmin.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const callAdminApi = vi.fn();
class FakeErr extends Error { code: string; constructor(c: string) { super(c); this.code = c; } }
vi.mock('../../lib/admin-api', () => ({ callAdminApi: (...a: unknown[]) => callAdminApi(...a), AdminApiError: FakeErr }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', async (imp) => ({ ...(await imp<typeof import('react-router-dom')>()), useNavigate: () => vi.fn() }));

import InviteAdmin from './InviteAdmin';

beforeEach(() => callAdminApi.mockReset());

it('mostra mensagem util quando a conta nao existe', async () => {
  callAdminApi.mockRejectedValue(new FakeErr('not_found'));
  render(<MemoryRouter><InviteAdmin /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'novo@pessoa.com');
  await userEvent.click(screen.getByRole('button', { name: /convidar/i }));
  await waitFor(() => expect(screen.getByText(/criar uma conta no Aflyo primeiro/i)).toBeInTheDocument());
});
```

`RolesList.test.tsx`:
```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const callAdminApi = vi.fn();
vi.mock('../../lib/admin-api', () => ({ callAdminApi: (...a: unknown[]) => callAdminApi(...a), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['roles.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import RolesList from './RolesList';

beforeEach(() => callAdminApi.mockReset());

it('lista os cargos e suas permissoes', async () => {
  callAdminApi.mockResolvedValue({
    roles: [{ key: 'ANALYST', label: 'Analista', description: '', permissions: ['dashboard.read', 'analytics.read'] }],
    permissions: [{ key: 'dashboard.read', grp: 'overview', description: '' }],
  });
  render(<RolesList />);
  await waitFor(() => expect(screen.getByText('Analista')).toBeInTheDocument());
  expect(screen.getByText('dashboard.read')).toBeInTheDocument();
});

it('sem roles.manage nao mostra o formulario de atribuir', async () => {
  callAdminApi.mockResolvedValue({ roles: [], permissions: [] });
  render(<RolesList />);
  await waitFor(() => expect(screen.queryByRole('button', { name: /atribuir cargo/i })).not.toBeInTheDocument());
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test`
Expected: FAIL, páginas não existem.

- [ ] **Step 3: Implementar as 4 páginas** conforme Interfaces. Todas com estados loading/error/empty via `DataTable` ou blocos equivalentes. Modais de confirmação para ação destrutiva (suspender) com campo "Motivo" obrigatório. Sem travessão. Textos pt-BR.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test`
Expected: PASS.

- [ ] **Step 5: Checar build e lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/
git commit -m "feat(admin): telas de Administradores, Convidar, Cargos e Auditoria

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 16: Retirar o `/admin` antigo do app do cliente

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Create: `src/pages/AdminMoved.tsx`
- Delete: `src/pages/AdminDashboard.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores (as regex já foram salvas em `shared/mask-secrets.ts` na Task 1).
- Produces: `/admin` no app do cliente passa a renderizar `<AdminMoved />` (404 dedicado, sem redirect, sem link). `AdminDashboard.tsx` deixa de existir. Sidebar sem o item admin.

- [ ] **Step 1: Confirmar que `shared/mask-secrets.ts` cobre as regex do `AdminDashboard`**

Run: inspecionar `src/pages/AdminDashboard.tsx` (e a RPC `get_admin_channels` no spec) e conferir contra `shared/mask-secrets.ts`. Se faltar alguma regex de mascaramento, adicioná-la a `shared/mask-secrets.ts` agora e commitar junto.
Expected: `DISCORD_WEBHOOK_MASK_RE` e `maskTelegramBotToken` correspondem ao que o código antigo fazia.

- [ ] **Step 2: Criar `src/pages/AdminMoved.tsx`**

```tsx
import { APP_NAME } from '../config/app';

export default function AdminMoved() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-surface-1 p-6 text-center text-ink">
      <div className="w-16 h-16 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mb-6 text-2xl font-bold">
        404
      </div>
      <h1 className="text-xl font-bold tracking-tight font-display">Pagina nao encontrada</h1>
      <p className="text-sm text-ink-secondary mt-2 max-w-sm leading-relaxed">
        Este endereco saiu do ar. O painel administrativo do {APP_NAME} agora fica em um endereco proprio,
        acessivel apenas para a equipe.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Editar `src/App.tsx`**

- Remover a linha `import AdminDashboard from './pages/AdminDashboard';`.
- Adicionar `import AdminMoved from './pages/AdminMoved';`.
- Remover `<Route path="/admin" element={<AdminDashboard />} />` de dentro do bloco `<Route element={<ProtectedRoute ...>}>`.
- Adicionar, junto às outras rotas públicas (fora do `<ProtectedRoute>`), antes do fallback `*`:
  ```tsx
  <Route path="/admin" element={<AdminMoved />} />
  ```

- [ ] **Step 4: Editar `src/components/Sidebar.tsx`**

Remover a linha (~39):
```tsx
...(isAdmin ? [{ to: '/admin', icon: ShieldCheck, label: 'Painel Admin' }] : []),
```
Se `isAdmin` e `ShieldCheck` ficarem sem uso no arquivo, remover o import de `ShieldCheck` e a desestruturação de `isAdmin` de `useUser()`. **Não** remover `isAdmin` do `UserContext`.

- [ ] **Step 5: Deletar `src/pages/AdminDashboard.tsx`**

```bash
git rm src/pages/AdminDashboard.tsx
```

- [ ] **Step 6: Verificar que não sobrou referência**

Run:
```bash
git grep -n "AdminDashboard\|get_admin_\|to: '/admin'" -- src/
```
Expected: nenhuma linha (fora de comentários históricos, se houver).

- [ ] **Step 7: Build e lint do app do cliente**

Run:
```bash
npm run build
npm run lint
```
Expected: ambos OK, sem erro de import.

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx src/components/Sidebar.tsx src/pages/AdminMoved.tsx
git commit -m "chore(admin): retira o /admin antigo do app do cliente (vira 404 dedicado)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 17: Documentação (`ADMIN_ARCHITECTURE`, `ADMIN_DEPLOYMENT`, `ADMIN_OPERATIONS`, `ADMIN_SECURITY`)

**Files:**
- Create: `ADMIN_ARCHITECTURE.md`
- Create: `ADMIN_DEPLOYMENT.md`
- Create: `ADMIN_OPERATIONS.md`
- Create: `ADMIN_SECURITY.md`

**Interfaces:**
- Consumes: tudo que as Tasks 1 a 16 produziram (nomes de tabela, ações da `admin-api`, cargos, permissões).
- Produces: 4 docs em pt-BR, sem travessão. Cada um marca claramente "SP1" e o que fica para SP2 em diante.

- [ ] **Step 1: `ADMIN_ARCHITECTURE.md`**

Conteúdo mínimo: diagrama textual (app `src/` e app `admin/` compartilham o mesmo projeto Supabase `zuqaccivowbzdfrpgekz`); por que app separada (isolamento de bundle e de origem); `admin.aflyo.com.br` resolvido no CDN + guarda de hostname (não é fronteira de segurança); fluxo de auth (login → MFA AAL2 → `session/whoami` → `phase='ready'`); RBAC (tabelas `admin_accounts`/`admin_roles`/`admin_permissions`/`admin_role_permissions`/`admin_user_roles`, funções `admin_has_permission`/`admin_is_active`, os 4 cargos + matriz da seção 7.3 do spec); a `admin-api` (protocolo `{resource,action,params}`, pipeline, tabela de ações do SP1); Audit Log append-only; rotas do `admin/`; o que é SP1 e o que é SP2 em diante (lista da seção 3 do spec).

- [ ] **Step 2: `ADMIN_DEPLOYMENT.md`**

Passo a passo, na ordem da seção 12 do spec:
1. Aplicar as 4 migrations (`20260829130000`..`20260829130300`) via `supabase db push` ou pelo dashboard. Conferir `NOTICE` do bootstrap.
2. Pré-requisito do bootstrap: confirmar `select id from auth.users where email='contatogivaldo@outlook.com';` retorna linha. Se não, criar/entrar com a conta no app do cliente primeiro, depois reaplicar a migration `20260829130200` (ou rodar o bloco `do $$ ... $$` à mão).
3. `supabase functions deploy admin-api`. Secrets necessárias: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `ENVIRONMENT=production`.
4. Confirmar MFA TOTP habilitado em Authentication → MFA no dashboard Supabase (padrão ligado).
5. Vercel: novo projeto, root `admin/`, build `npm run build`, output `dist`. Env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ADMIN_API_URL`, `VITE_ADMIN_HOSTNAME=admin.aflyo.com.br`.
6. DNS: `CNAME admin` → `cname.vercel-dns.com` (ou alvo indicado pela Vercel). Adicionar `admin.aflyo.com.br` no projeto Vercel.
7. Redeploy do app do cliente (já com o `/admin` removido).
8. Checklist de validação: abrir `https://admin.aflyo.com.br`, logar com `contatogivaldo@outlook.com`, enrolar MFA, ver o Dashboard, `admins/list` mostra o próprio SUPER_ADMIN, `aflyo.com.br/admin` mostra 404.
Incluir a seção de dev local (seção 13 do spec).

- [ ] **Step 3: `ADMIN_OPERATIONS.md`**

Procedimentos: convidar admin (a pessoa cria conta no Aflyo → você em `/admins/invite` informa e-mail + cargo `DEVELOPER`); atribuir/revogar cargo em `/roles`; suspender/reativar em `/admins` (com motivo); ler o Audit Log em `/audit` (filtros, expandir before/after); interpretar o Dashboard (o que significa "Dados indisponiveis" e quando cada métrica volta, referenciando os SPs). Runbooks de investigação de usuário/promoção/link/envio/webhook: placeholder explícito "disponível a partir do SP2/SP4".

- [ ] **Step 4: `ADMIN_SECURITY.md`**

RBAC (backend é a autoridade; frontend só esconde UI); sessão (client isolado `sb-admin-auth`, origem separada, sem cookie); MFA (enroll obrigatório, AAL2 exigido em toda ação da `admin-api`, claim `aal` do JWT); Audit Log append-only (trigger + revokes; recuperação: só via SQL com `service_role`); segredos (nenhuma tela do SP1 exibe segredo; `shared/mask-secrets.ts` pronto para SP2); proteção da `admin-api` (401/403, allowlist de campos por handler, guardas anti-escalada: último SUPER_ADMIN, auto-suspensão, quem atribui SUPER_ADMIN); CORS travado; CSP enforcing; SSRF (não aplicável no SP1, regra obrigatória para handlers de SP2+ que buscarem URL); LGPD (minimização, mascaramento por cargo é SP2+); rate limiting (fora do SP1, ponto de extensão marcado, código `rate_limited` reservado); resposta a incidente (suspender admin, revogar cargo, girar `SERVICE_ROLE_KEY` se vazar).

- [ ] **Step 5: Commit**

```bash
git add ADMIN_ARCHITECTURE.md ADMIN_DEPLOYMENT.md ADMIN_OPERATIONS.md ADMIN_SECURITY.md
git commit -m "docs(admin): arquitetura, deploy, operacao e seguranca do SP1

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 18: Verificação de aceite do SP1

**Files:** nenhum (task de verificação; correções pontuais nos arquivos já criados se algum critério falhar).

- [ ] **Step 1: Suite completa**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
deno test supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
npm run build   # app do cliente
npm run lint    # app do cliente
```
Expected: tudo verde.

- [ ] **Step 2: Migrations do zero**

Run: `supabase db reset` e rodar os 4 arquivos `*.test.sql` das Tasks 2, 3, 6.
Expected: todos os `PASS`.

- [ ] **Step 3: Rodar o checklist da seção 15 do spec** (critérios de aceite). Para cada item não coberto por teste automatizado, validar manualmente com `supabase start` + `npm --prefix admin run dev` e registrar o resultado.

- [ ] **Step 4: Commit de fechamento** (se houve correções)

```bash
git add -A
git commit -m "chore(admin): ajustes finais do SP1 apos verificacao de aceite

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Atualizar a memória do projeto**

Editar `C:\Users\Tuik\.claude\projects\d--ofertapro\memory\project_admin_panel.md`: status "SP1 implementado na branch `feat/admin-panel-sp1`, aguardando deploy (ver ADMIN_DEPLOYMENT.md) e QA". Atualizar o pointer em `MEMORY.md`.

---

## Self-Review

**1. Cobertura do spec (seção do spec → task):**

| Spec | Task(s) |
|---|---|
| 3.1 app `admin/` + guarda de hostname sem flash | 9, 13 |
| 3.2 auth admin com MFA TOTP (AAL2) | 5 (rbac AAL2), 8 (whoami), 11 (contexto + telas MFA), 13 (gates) |
| 3.3 RBAC (4 cargos, catálogo, matriz, validação backend) | 1 (catálogo TS), 2 (seed + funções), 5/7/8 (enforcement) |
| 3.4 `admin-api` com RBAC + audit em toda mutação | 5, 6, 7, 8; mutações atômicas na 3 |
| 3.5 Audit Log append-only | 3 |
| 3.6 Dashboard executivo dados reais + feed | 6 (SQL), 14 (tela) |
| 3.7 telas Administradores e Cargos | 15 |
| 3.8 retirada do `/admin` antigo + salvar reaproveitável | 1 (mask-secrets), 16 |
| 3.9 3 migrations versionadas | 2, 3, 4 (a 6 adiciona uma 4a migration de agregação, dentro do espírito; documentar no ADMIN_ARCHITECTURE) |
| 3.10 4 docs | 17 |
| 3.11 testes (RBAC, Audit, `admin_has_permission`, hostname, disponibilidade) | 1, 2, 3, 5, 6, 9, 12, 13, 14 |
| Seção 8 headers/CSP/CORS | 9 (vercel.json), 5 (`_lib` CORS) |
| Seção 8 sem cadastro no app admin | 11 |
| Seção 9 não tocar `UserContext.isAdmin`/paywall | 16 (Step 4 explícito) |
| Seção 12 ordem de deploy + config externa | 17 (`ADMIN_DEPLOYMENT.md`) |
| Seção 13 dev local | 9 (porta 5273), 17 |

Observação: o spec previa **3** migrations; o plano tem **4** (`20260829130300_admin_dashboard_summary.sql` é a extra). É agregação de leitura, coerente com o SP1; a Task 17 registra isso no `ADMIN_ARCHITECTURE.md`. Sem lacuna funcional.

**2. Placeholders:** os "colar aqui o objeto `theme.extend`" (Task 9) e "porte enxuto do ToastContext" (Task 11 Step 4) são instruções de cópia de origem citada (arquivo e função exatos), não TODOs abertos. O `ADMIN_OPERATIONS.md` tem placeholders **intencionais e rotulados** ("a partir do SP2"). Nenhum "TBD"/"implementar depois" real.

**3. Consistência de tipos:**
- `AdminIdentity` (Task 5) usado em `session.whoami` (Task 8) e no front como `Identity` (Task 11) com o mesmo shape `{ adminId, email, roleKeys, permissions }` (no back `permissions: Set`, serializado para `string[]` em `whoami`; no front `string[]`). Coerente.
- `Handler`/`HandlerMap` definidos na Task 5, estendidos na Task 8 (`permission: string | null`). Todos os handlers das Tasks 6 a 8 batem com a assinatura `(params, identity, ctx) => Promise<unknown>`.
- `callAdminApi<T>` (Task 10) usado igual nas Tasks 11, 14, 15.
- `mapPgError` hints (`ADMIN_EXISTS`, `NOT_FOUND`, `LAST_SUPER_ADMIN`, `CANNOT_SUSPEND_SELF`, `ONLY_SUPER_ADMIN_ASSIGNS_SUPER_ADMIN`) batem com os `hint=` dos `raise exception` da Task 3.
- `nextPhaseFromAal` retorna `AalOutcome` (`anon|needs_mfa_enroll|needs_mfa_challenge|aal2_ok`); o contexto (Task 11) mapeia `aal2_ok` para o fluxo de `whoami` e nunca seta `phase='aal2_ok'`. Coerente.
- Guarda de hostname: `isAllowedHost(hostname, isProd, allowedHost)` mesma assinatura na Task 9 e no uso da Task 13.

Correções aplicadas nesta revisão: numeração de steps da Task 8 (Step 5 novo, 6 novo, 7 renumerado, 8 commit); remoção do caractere não ASCII plantado no `tsconfig` da Task 9; `admin/tailwind.config.js` deixou de importar `tokens.js` inexistente (valores inline).

---

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-08-29-admin-panel-sp1-fundacao.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — despacho um subagente novo por task, reviso entre tasks, iteração rápida.

**2. Inline Execution** — executo as tasks nesta sessão via `executing-plans`, em lotes com checkpoints de revisão.

Qual abordagem?
