# Painel Admin, acabamento do SP1 (polish) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o SP1 do painel admin apresentavel (Cargos legivel, copy pt-BR com acento, Dashboard agrupado) antes do SP2, sem tocar em backend nem banco.

**Architecture:** So `admin/src/**` (app Vite do painel). Novo modulo `permission-labels.ts` como fonte dos rotulos amigaveis; `RolesList.tsx` e `Dashboard.tsx` reescrevem a apresentacao consumindo esse modulo e a estrutura de secoes; varredura de acentos em toda a copy de UI; testes vitest ajustados junto de cada componente. Deploy no projeto Vercel `aflyo-admin` (root `admin/`).

**Tech Stack:** React 19.2, Vite 8, TypeScript ~6.0, Tailwind 3.4, lucide-react 1.14, Vitest 2.1 + @testing-library/react + jsdom.

## Global Constraints

- **So front do `admin/`.** Zero mudanca em `supabase/functions/admin-api/**`, RPCs, `plan_limits`, migrations, `shared/**`.
- **Nenhuma tela ou rota nova.** `admin/src/nav.ts` continua com os mesmos 4 itens ativos; o resto `comingSoon`.
- **Sem travessao (em dash `—`)** em qualquer texto de UI. Usar virgula, parenteses ou dois pontos.
- **Textos de UI em pt-BR com acento correto.** Identificadores e valores tecnicos (keys de permissao tipo `users.impersonate`, `role_key`, nomes de rota, chaves de objeto) NAO mudam. Comentarios de codigo podem ficar sem acento.
- **Design system inalterado:** paleta/tokens/fontes do `admin/tailwind.config.js` continuam.
- **Build standalone:** o `admin/` nao importa de `../shared` (ja resolvido na branch `fix/admin-standalone-build`, que e a base desta). `permission-labels.ts` e local.
- **Branch:** `feat/admin-sp1-polish` (ja criada, a partir de `fix/admin-standalone-build`).
- **Comandos rodam da raiz do worktree** `D:/ofertapro-admin-sp1`. Testes: `npm --prefix admin test`. Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`.
- **Commits frequentes:** cada task termina com commit proprio, mensagem pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `admin/src/lib/permission-labels.ts` | Fonte unica dos rotulos pt-BR: `PERMISSION_LABELS` (as 49 chaves), `GROUP_LABELS` (os 8 grupos), helpers `permLabel(key)` / `groupLabel(key)` com fallback pro proprio key. |
| `admin/src/lib/permission-labels.test.ts` | Testa cobertura das 49 chaves, dos 8 grupos e o fallback dos helpers. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `admin/src/pages/roles/RolesList.tsx` | Cards ordenados por poder; contador de permissoes; permissoes como chips com `permLabel` + `title={key}`; grupos via `groupLabel`; card do SUPER_ADMIN recolhivel; secao "Atribuir cargo" com layout de form + chips `Badge` com icone `X` no revogar. Acentos pt-BR. |
| `admin/src/pages/roles/RolesList.test.tsx` | Assertivas de texto passam a bater com `permLabel`/`groupLabel` (ou `title`). |
| `admin/src/pages/Dashboard.tsx` | `DASHBOARD_METRIC_ORDER` vira estrutura de 5 secoes; render em secoes com subtitulo; secao "Infraestrutura" mais discreta. Acentos pt-BR. |
| `admin/src/pages/Dashboard.test.tsx` | `getByText('Dados indisponiveis')` -> texto acentuado. |
| `admin/src/nav.ts` | Labels e titles de secao com acento ("Visao geral" -> com til, etc.). |
| `admin/src/components/ui/StatCard.tsx` | "Dados indisponiveis" -> com acento. |
| `admin/src/components/ui/DataTable.tsx` | "Proxima", "pagina X de Y", "Tentar de novo", "Nada por aqui" -> com acento. |
| `admin/src/components/ui/EmptyState.tsx` / `ErrorState.tsx` | textos default com acento. |
| `admin/src/components/Sidebar.tsx` / `Topbar.tsx` / `Breadcrumbs.tsx` / `AdminLayout.tsx` / `RequirePermission.tsx` | copy com acento ("Recolher menu", "Expandir menu", "Sair", "Trilha", "Sem permissao", "Voce nao tem permissao...", "Em breve"). |
| `admin/src/context/ToastContext.tsx` | `aria-label="Notificacoes"` -> com acento. |
| `admin/src/pages/Login.tsx` / `MfaEnroll.tsx` / `MfaChallenge.tsx` / `Unauthorized.tsx` | copy com acento. |
| `admin/src/pages/admins/AdminsList.tsx` / `InviteAdmin.tsx` | copy com acento ("Acoes" -> com cedilha e til, "Administrador suspenso." etc.). |
| `admin/src/pages/audit/AuditList.tsx` | copy com acento ("Acao", "sistema", "Registro imutavel..."). |
| `admin/src/lib/admin-api.ts` | mensagens de erro pt-BR com acento ("Sessao ausente.", "Falha de rede...", "Resposta inesperada..."). |
| `admin/src/components/RequirePermission.test.tsx` | regex `/nao tem permissao/i` -> acentuada. |
| `admin/src/components/ui/StatCard.test.tsx` | `getByText('Dados indisponiveis')` -> acentuado. |
| `admin/src/components/ui/DataTable.test.tsx` | `getByRole('button', { name: /proxima/i })` -> acentuado. |
| `admin/src/App.test.tsx` | regex `/nao autorizado|nao tem acesso/i` -> acentuada. |

---

## Task 1: Catalogo de rotulos `permission-labels.ts`

**Files:**
- Create: `admin/src/lib/permission-labels.ts`
- Test: `admin/src/lib/permission-labels.test.ts`

**Interfaces:**
- Produces:
  - `PERMISSION_LABELS: Record<string, string>` com exatamente as 49 chaves do catalogo (as mesmas de `shared/admin-permissions.ts` RAW e do seed da migration `20260829130000`).
  - `GROUP_LABELS: Record<string, string>` com os 8 grupos (`overview`, `users`, `operation`, `monitoring`, `integrations`, `security`, `system`, `administration`).
  - `permLabel(key: string): string` -> `PERMISSION_LABELS[key] ?? key`.
  - `groupLabel(key: string): string` -> `GROUP_LABELS[key] ?? key`.
  - `PERMISSION_ORDER: string[]` -> lista das 49 chaves na ordem de exibicao (por grupo, na ordem dos grupos acima). Usado pelo `RolesList` pra ordenar os chips dentro de cada grupo de forma estavel.

- [ ] **Step 1: Escrever o teste que falha** em `admin/src/lib/permission-labels.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { PERMISSION_LABELS, GROUP_LABELS, permLabel, groupLabel, PERMISSION_ORDER } from './permission-labels';

const KEYS = [
  'dashboard.read', 'analytics.read',
  'users.read', 'users.suspend', 'users.reactivate', 'users.sessions.read',
  'users.sessions.revoke', 'users.notes.manage', 'users.tags.manage', 'users.impersonate',
  'promotions.read', 'promotions.retry', 'promotions.cancel',
  'links.read', 'links.test', 'links.retry', 'links.disable',
  'shortener.read', 'shortener.manage',
  'sends.read', 'sends.retry', 'sends.cancel',
  'jobs.read', 'jobs.retry', 'jobs.cancel', 'queues.read',
  'errors.read', 'errors.manage', 'logs.read', 'system_health.read',
  'cakto.read', 'cakto.sync', 'webhooks.read', 'webhooks.retry',
  'security.read', 'security.block_ip', 'risk.read', 'risk.manage', 'audit.read',
  'feature_flags.read', 'feature_flags.manage', 'announcements.read', 'announcements.manage',
  'system_settings.read', 'system_settings.manage',
  'admins.read', 'admins.manage', 'roles.read', 'roles.manage',
];

describe('permission-labels', () => {
  it('tem rotulo pra todas as 49 permissoes', () => {
    expect(KEYS).toHaveLength(49);
    for (const k of KEYS) {
      expect(PERMISSION_LABELS[k], k).toBeTruthy();
      expect(PERMISSION_LABELS[k]).not.toBe(k);
    }
    expect(Object.keys(PERMISSION_LABELS)).toHaveLength(49);
  });

  it('tem rotulo pros 8 grupos', () => {
    for (const g of ['overview', 'users', 'operation', 'monitoring', 'integrations', 'security', 'system', 'administration']) {
      expect(GROUP_LABELS[g], g).toBeTruthy();
    }
    expect(Object.keys(GROUP_LABELS)).toHaveLength(8);
  });

  it('PERMISSION_ORDER tem as 49 chaves sem repetir', () => {
    expect(new Set(PERMISSION_ORDER).size).toBe(49);
    expect([...PERMISSION_ORDER].sort()).toEqual([...KEYS].sort());
  });

  it('helpers caem pro proprio key quando nao acham', () => {
    expect(permLabel('x.y')).toBe('x.y');
    expect(groupLabel('nope')).toBe('nope');
    expect(permLabel('dashboard.read')).toBe(PERMISSION_LABELS['dashboard.read']);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- permission-labels`
Expected: FAIL, `Cannot find module './permission-labels'`.

- [ ] **Step 3: Implementar `admin/src/lib/permission-labels.ts`**

```ts
// Rotulos pt-BR das permissoes e grupos, so pra exibicao no painel. As 49 chaves
// batem com o seed da migration 20260829130000 / shared/admin-permissions.ts.
// A autoridade do RBAC continua no banco; aqui e so texto amigavel.

export const GROUP_LABELS: Record<string, string> = {
  overview: 'Visão geral',
  users: 'Usuários',
  operation: 'Operação',
  monitoring: 'Monitoramento',
  integrations: 'Integrações',
  security: 'Segurança',
  system: 'Sistema',
  administration: 'Administração',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.read': 'Ver o dashboard',
  'analytics.read': 'Ver analytics',

  'users.read': 'Ver usuários',
  'users.suspend': 'Suspender usuário',
  'users.reactivate': 'Reativar usuário',
  'users.sessions.read': 'Ver sessões do usuário',
  'users.sessions.revoke': 'Revogar sessões do usuário',
  'users.notes.manage': 'Gerenciar anotações do usuário',
  'users.tags.manage': 'Gerenciar tags do usuário',
  'users.impersonate': 'Personificar usuário',

  'promotions.read': 'Ver promoções',
  'promotions.retry': 'Reprocessar promoção',
  'promotions.cancel': 'Cancelar promoção',
  'links.read': 'Ver links',
  'links.test': 'Testar link',
  'links.retry': 'Reprocessar link',
  'links.disable': 'Desabilitar link',
  'shortener.read': 'Ver encurtador',
  'shortener.manage': 'Gerenciar encurtador',
  'sends.read': 'Ver envios',
  'sends.retry': 'Reenviar',
  'sends.cancel': 'Cancelar envio',

  'jobs.read': 'Ver jobs',
  'jobs.retry': 'Reprocessar job',
  'jobs.cancel': 'Cancelar job',
  'queues.read': 'Ver filas',
  'errors.read': 'Ver erros',
  'errors.manage': 'Gerenciar erros',
  'logs.read': 'Ver logs',
  'system_health.read': 'Ver saúde do sistema',

  'cakto.read': 'Ver Cakto',
  'cakto.sync': 'Sincronizar Cakto',
  'webhooks.read': 'Ver webhooks',
  'webhooks.retry': 'Reprocessar webhook',

  'security.read': 'Ver segurança',
  'security.block_ip': 'Bloquear IP',
  'risk.read': 'Ver risco',
  'risk.manage': 'Gerenciar risco',
  'audit.read': 'Ver auditoria',

  'feature_flags.read': 'Ver feature flags',
  'feature_flags.manage': 'Gerenciar feature flags',
  'announcements.read': 'Ver anúncios',
  'announcements.manage': 'Gerenciar anúncios',
  'system_settings.read': 'Ver configurações do sistema',
  'system_settings.manage': 'Gerenciar configurações do sistema',

  'admins.read': 'Ver administradores',
  'admins.manage': 'Gerenciar administradores',
  'roles.read': 'Ver cargos',
  'roles.manage': 'Gerenciar cargos',
};

export const PERMISSION_ORDER: string[] = Object.keys(PERMISSION_LABELS);

export function permLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key;
}

export function groupLabel(key: string): string {
  return GROUP_LABELS[key] ?? key;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- permission-labels`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add admin/src/lib/permission-labels.ts admin/src/lib/permission-labels.test.ts
git commit -m "feat(admin): catalogo pt-BR de rotulos das 49 permissoes e 8 grupos

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Tela de Cargos reescrita

**Files:**
- Modify: `admin/src/pages/roles/RolesList.tsx`
- Modify: `admin/src/pages/roles/RolesList.test.tsx`

**Interfaces:**
- Consumes: `permLabel`, `groupLabel`, `PERMISSION_ORDER` de `admin/src/lib/permission-labels.ts` (Task 1). `callAdminApi`, `useAsync`, `useAdminAuth`, `useToast`, `hasPermission`, `Badge`, `Skeleton`, `ErrorState` (ja usados).
- Produces: nada consumido por outra task.

**Comportamento que NAO muda:** `useAsync(() => callAdminApi('roles','list'))`, `useAsync` condicional de `admins/list`, chamadas `roles/assign` e `roles/revoke` via `runMutation`, gate `canManage` (`hasPermission(perms, 'roles.manage')`).

- [ ] **Step 1: Ajustar o teste** `admin/src/pages/roles/RolesList.test.tsx`

O teste "lista os cargos e suas permissoes" hoje faz `expect(screen.getByText('dashboard.read'))`. Trocar por:

```ts
  render(<RolesList />);
  await waitFor(() => expect(screen.getByText('Analista')).toBeInTheDocument());
  // agora a permissao aparece com rotulo amigavel; a chave tecnica vai no title
  expect(screen.getByText('Ver o dashboard')).toBeInTheDocument();
  expect(screen.getByTitle('dashboard.read')).toBeInTheDocument();
```

O segundo teste ("sem roles.manage nao mostra o formulario de atribuir") nao muda.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- RolesList`
Expected: FAIL no primeiro teste (`Unable to find an element with the text: Ver o dashboard`).

- [ ] **Step 3: Reescrever `admin/src/pages/roles/RolesList.tsx`**

```tsx
import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ROLES } from '../../lib/roles';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { permLabel, groupLabel, PERMISSION_ORDER } from '../../lib/permission-labels';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type RoleRow = { key: string; label: string; description: string; permissions: string[] };
type PermRow = { key: string; grp: string; description: string };
type RolesPayload = { roles: RoleRow[]; permissions: PermRow[] };
type AdminRow = { id: string; email: string; roleKeys: string[] };

// Ordem de exibicao dos cards, do mais poderoso pro menos.
const ROLE_RANK: Record<string, number> = { SUPER_ADMIN: 0, SUPPORT: 1, DEVELOPER: 2, ANALYST: 3 };
const permRank = (k: string) => {
  const i = PERMISSION_ORDER.indexOf(k);
  return i === -1 ? 999 : i;
};

function RoleCard({ role, grpByPerm }: { role: RoleRow; grpByPerm: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of [...role.permissions].sort((a, b) => permRank(a) - permRank(b))) {
      const g = grpByPerm.get(p) ?? 'outros';
      const arr = m.get(g) ?? [];
      arr.push(p);
      m.set(g, arr);
    }
    return [...m.entries()];
  }, [role.permissions, grpByPerm]);

  const long = role.permissions.length > 12;
  const shown = long && !expanded ? groups.slice(0, 2) : groups;

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-bold text-ink">{role.label}</h2>
          {role.description && <p className="mt-0.5 text-xs text-ink-secondary">{role.description}</p>}
        </div>
        <Badge>{role.key}</Badge>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
        {role.permissions.length} {role.permissions.length === 1 ? 'permissão' : 'permissões'}
      </p>

      <div className="mt-2 space-y-3">
        {shown.map(([grp, perms]) => (
          <div key={grp}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">{groupLabel(grp)}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {perms.map((p) => (
                <span
                  key={p}
                  title={p}
                  className="rounded-md bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-secondary"
                >
                  {permLabel(p)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-semibold text-ink-secondary underline"
        >
          {expanded ? 'ver menos' : `ver todas as ${role.permissions.length}`}
        </button>
      )}
    </div>
  );
}

export default function RolesList() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'roles.manage');

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<RolesPayload>('roles', 'list'),
    [],
  );
  const { data: adminsData, reload: reloadAdmins } = useAsync(
    () => (canManage ? callAdminApi<{ admins: AdminRow[] }>('admins', 'list') : Promise.resolve({ admins: [] })),
    [canManage],
  );

  const grpByPerm = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data?.permissions ?? []) map.set(p.key, p.grp);
    return map;
  }, [data]);

  const sortedRoles = useMemo(
    () => [...(data?.roles ?? [])].sort((a, b) => (ROLE_RANK[a.key] ?? 9) - (ROLE_RANK[b.key] ?? 9)),
    [data],
  );

  const [adminId, setAdminId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedAdmin = (adminsData?.admins ?? []).find((a) => a.id === adminId) ?? null;

  const runMutation = useCallback(
    async (action: 'assign' | 'revoke', rk: string) => {
      if (!adminId || !rk) return;
      setBusy(true);
      try {
        await callAdminApi('roles', action, { adminId, roleKey: rk });
        toast(action === 'assign' ? 'Cargo atribuído.' : 'Cargo revogado.', 'success');
        reload();
        reloadAdmins();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Falha na operação.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [adminId, toast, reload, reloadAdmins],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Cargos</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Os 4 cargos do painel e as permissões de cada um.
        </p>
      </header>

      {loading && (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      )}

      {!loading && data && (
        <div className="grid gap-3 md:grid-cols-2">
          {sortedRoles.map((role) => (
            <RoleCard key={role.key} role={role} grpByPerm={grpByPerm} />
          ))}
        </div>
      )}

      {canManage && (
        <div className="rounded-xl border border-line bg-surface-0 p-4">
          <h2 className="font-display text-sm font-bold text-ink">Atribuir cargo</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            Escolha um administrador e o cargo. A mudança grava na auditoria.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col">
              <span className="text-xs font-semibold text-ink-secondary">Administrador</span>
              <select
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="mt-1 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
              >
                <option value="">Selecione</option>
                {(adminsData?.admins ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.email}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-xs font-semibold text-ink-secondary">Cargo</span>
              <select
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                className="mt-1 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
              >
                <option value="">Selecione</option>
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !adminId || !roleKey}
              onClick={() => { void runMutation('assign', roleKey); }}
              className="rounded-lg bg-graphite-900 px-3 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-graphite-700 disabled:opacity-50"
            >
              Atribuir cargo
            </button>
          </div>

          {selectedAdmin && (
            <div className="mt-4 border-t border-line-subtle pt-4">
              <p className="text-xs font-semibold text-ink-secondary">
                Cargos atuais de {selectedAdmin.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedAdmin.roleKeys.length === 0 && (
                  <span className="text-xs text-ink-tertiary">nenhum</span>
                )}
                {selectedAdmin.roleKeys.map((rk) => (
                  <span
                    key={rk}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-ink-secondary"
                  >
                    {rk}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { void runMutation('revoke', rk); }}
                      aria-label={`Revogar ${rk}`}
                      className="rounded-full p-0.5 text-ink-tertiary transition-colors hover:bg-danger-bg hover:text-danger-ink disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- RolesList`
Expected: PASS (2 testes).

- [ ] **Step 5: Checar build**

Run: `npm --prefix admin run build`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/roles/
git commit -m "feat(admin): tela de Cargos legivel (rotulos pt-BR, ordem por poder, recolhivel)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Dashboard em secoes

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx`
- Modify: `admin/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: nada consumido por outra task.

**Comportamento que NAO muda:** filtro de range (`today|7d|30d|90d`), `useAsync` + `callAdminApi('dashboard','summary',{range})`, `StatCard`, `Skeleton`, `ErrorState`, `EmptyState`, o feed "Atividade recente", `relative()`, `FEED_TYPE_LABELS`, `METRIC_LABELS_FALLBACK`.

- [ ] **Step 1: Ajustar o teste** `admin/src/pages/Dashboard.test.tsx`

Trocar `expect(screen.getByText('Dados indisponiveis'))` por `expect(screen.getByText('Dados indisponíveis'))` (com acento). O resto (`getByText('1.200')`, o caso de erro) nao muda.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- Dashboard`
Expected: FAIL (`Unable to find an element with the text: Dados indisponíveis` enquanto o StatCard ainda renderiza sem acento — sera corrigido na Task 4; aqui o teste ja fica na forma final).

> Nota: este teste so passa de vez depois da Task 4 (que acentua o `StatCard`). Ate la ele fica vermelho; e esperado. A Task 3 nao mexe no `StatCard`.

- [ ] **Step 3: Reescrever a apresentacao de `admin/src/pages/Dashboard.tsx`**

Trocar a constante plana `DASHBOARD_METRIC_ORDER` por uma estrutura de secoes e renderizar em blocos. Substituir:

```tsx
const DASHBOARD_METRIC_ORDER = [
  'users_total', 'users_active', 'users_new', 'subs_active', 'subs_canceled',
  'offers_created', 'links_processed', 'clicks', 'sends', 'sends_success_rate',
  'webhooks_received', 'webhooks_failed', 'jobs_failed', 'jobs_pending',
  'queue_depth', 'errors_24h', 'services_degraded',
];
```

por:

```tsx
const DASHBOARD_SECTIONS: { title: string; muted?: boolean; keys: string[] }[] = [
  { title: 'Usuários', keys: ['users_total', 'users_active', 'users_new'] },
  { title: 'Assinaturas', keys: ['subs_active', 'subs_canceled'] },
  { title: 'Conteúdo', keys: ['offers_created', 'links_processed', 'clicks'] },
  { title: 'Envios', keys: ['sends', 'sends_success_rate', 'webhooks_received'] },
  {
    title: 'Infraestrutura',
    muted: true,
    keys: ['webhooks_failed', 'jobs_failed', 'jobs_pending', 'queue_depth', 'errors_24h', 'services_degraded'],
  },
];
```

E no JSX, trocar o bloco unico do grid de `StatCard` (o `<div className="grid ...">{DASHBOARD_METRIC_ORDER.filter(...).map(...)}</div>`) por:

```tsx
          <div className="space-y-6">
            {DASHBOARD_SECTIONS.map((section) => {
              const keys = section.keys.filter((k) => k in data.metrics);
              if (keys.length === 0) return null;
              return (
                <div key={section.title}>
                  <h2 className={`font-display text-sm font-bold ${section.muted ? 'text-ink-tertiary' : 'text-ink'}`}>
                    {section.title}
                    {section.muted && (
                      <span className="ml-2 text-[11px] font-normal text-ink-tertiary">sem fonte no SP1</span>
                    )}
                  </h2>
                  <div className="mt-2 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
                    {keys.map((key) => {
                      const m = data.metrics[key];
                      return (
                        <StatCard
                          key={key}
                          label={data.labels[key] ?? METRIC_LABELS_FALLBACK[key] ?? key}
                          value={m.value}
                          available={m.available}
                          suffix={key === 'sends_success_rate' ? '%' : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
```

O `loading` skeleton, o `error` (`ErrorState`), o header, o seletor de range e o bloco "Atividade recente" ficam iguais. `METRIC_LABELS_FALLBACK` continua existindo e ganha acentos na Task 4 (ou ja aqui se preferir; a Task 4 varre o arquivo de novo, sem conflito).

- [ ] **Step 4: Rodar build e o teste do Dashboard**

Run: `npm --prefix admin run build`
Expected: OK.
Run: `npm --prefix admin test -- Dashboard`
Expected: o teste "mostra metrica real e indisponivel" ainda FALHA (acento do StatCard vem na Task 4); "mostra erro com retry" PASSA. Registrar no commit.

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/Dashboard.tsx admin/src/pages/Dashboard.test.tsx
git commit -m "feat(admin): Dashboard com os cards agrupados em 5 secoes

O teste 'mostra metrica real e indisponivel' fica vermelho ate a Task 4
acentuar o StatCard (o teste ja esta na forma final).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Varredura de acentos pt-BR + testes afetados

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/components/ui/StatCard.tsx`, `DataTable.tsx`, `EmptyState.tsx`, `ErrorState.tsx`
- Modify: `admin/src/components/Sidebar.tsx`, `Topbar.tsx`, `Breadcrumbs.tsx`, `AdminLayout.tsx`, `RequirePermission.tsx`
- Modify: `admin/src/context/ToastContext.tsx`
- Modify: `admin/src/pages/Login.tsx`, `MfaEnroll.tsx`, `MfaChallenge.tsx`, `Unauthorized.tsx`
- Modify: `admin/src/pages/admins/AdminsList.tsx`, `InviteAdmin.tsx`
- Modify: `admin/src/pages/audit/AuditList.tsx`
- Modify: `admin/src/lib/admin-api.ts`
- Modify: `admin/src/pages/Dashboard.tsx` (so `METRIC_LABELS_FALLBACK` + qualquer copy JSX que sobrou)
- Modify: `admin/src/components/ui/StatCard.test.tsx`, `DataTable.test.tsx`
- Modify: `admin/src/components/RequirePermission.test.tsx`
- Modify: `admin/src/App.test.tsx`

**Interfaces:** nenhuma dependencia entre tasks; e uma passada de copy.

- [ ] **Step 1: Achar toda string de UI sem acento**

Run:
```bash
grep -rnE "indisponiveis|Promocoes|promocoes|usuarios|Usuarios|Sessao|sessao|Servicos|servicos|Configuracoes|Auditoria|auditoria|Administracao|administracao|permissao|Permissao|obrigatorio|Voce|voce|Proxima|pagina|Notificacoes|Recolher|Nao autorizado|nao autorizado|Sao |Acao|Acoes|codigo|numero|publica|Publica" admin/src --include=*.ts --include=*.tsx
```
Isso lista os pontos. Nao e exaustivo; ler cada arquivo modificado inteiro e corrigir toda copy visivel (JSX text, `label`, `placeholder`, `title`, `aria-label`, toasts, defaults de `EmptyState`/`ErrorState`).

- [ ] **Step 2: Corrigir arquivo por arquivo**

Palavras canonicas (aplicar o acento certo): Visão geral, Usuários, Operação, Monitoramento, Integrações, Segurança, Sistema, Administração, Notificações, Sessão, Serviços, Configurações, Auditoria, permissão / permissões, obrigatório, Você, Próxima, página, código, número, pública, Ações, Ação, não, é, Cadastrá-lo, Autenticação, Recolher menu, Expandir menu.

Pontos especificos conhecidos:
- `components/ui/StatCard.tsx`: `Dados indisponiveis` -> `Dados indisponíveis`.
- `components/ui/DataTable.tsx`: `Proxima` -> `Próxima`; `pagina {page} de {totalPages}` -> `página`; `Tentar de novo` (ja ok); `Nada por aqui` (ja ok); `aria-busy` (ok).
- `components/ui/ErrorState.tsx`: default `title = 'Algo deu errado'` (ok, sem acento). `Tentar de novo` (ok).
- `components/ui/EmptyState.tsx`: `Nada por aqui` (ok).
- `components/Sidebar.tsx`: `aria-label` `Expandir menu` / `Recolher menu` (ok, sem acento? "Expandir" e "Recolher" nao tem acento; "menu" nao tem). Tag `Em breve` (ok). Titulo `title="Em breve"` (ok).
- `components/Topbar.tsx`: `Sair` (ok).
- `components/Breadcrumbs.tsx`: `Trilha` (ok), `Painel` (ok), `Convidar admin` (ok).
- `components/RequirePermission.tsx`: `title="Sem permissao"` -> `Sem permissão`; `message="Você não tem permissão para ver esta área."` (acentuar).
- `context/ToastContext.tsx`: `aria-label="Notificacoes"` -> `Notificações`.
- `pages/Login.tsx`: "Entre com sua conta da equipe." (ok), "E-mail" (ok), "Senha" (ok), "Entrando..." (ok), "Esqueci a senha" (ok), "Acesso restrito. Se voce nao e da equipe, feche esta pagina." -> "Se você não é da equipe, feche esta página."
- `pages/MfaEnroll.tsx`: "Ativar verificação em duas etapas", "Escaneie o QR code no seu app autenticador e informe o código de 6 dígitos.", "Gerando o QR code...", "QR code do MFA", "Confirmar", "Verificando...".
- `pages/MfaChallenge.tsx`: "Verificação em duas etapas", "Informe o código de 6 dígitos do seu app autenticador.", "Carregando...", "Continuar", "Verificando...", "Sair".
- `pages/Unauthorized.tsx`: "Acesso não autorizado", "Este endereço não expõe o painel administrativo.", "Sua conta não tem acesso", "Você está autenticado, mas não é da equipe administrativa do Aflyo.".
- `pages/admins/AdminsList.tsx`: "Administradores", "Contas com acesso ao painel.", "Convidar admin", header col "Ações", "Ativo"/"Suspenso", "Sim"/"Não" (Não com til), "Suspender", "Reativar", modal "A conta perde o acesso ao painel na hora. Informe o motivo.", "Motivo", "Cancelar", "Suspendendo...", toasts "Administrador suspenso.", "Administrador reativado.", "Falha ao suspender.", "Falha ao reativar.", empty "Nenhum administrador".
- `pages/admins/InviteAdmin.tsx`: "Convidar admin", "A pessoa já precisa ter uma conta no Aflyo. Ela recebe os cargos escolhidos na hora.", "E-mail", "Cargos", "Convidando...", "Convidar", "Cancelar", CODE_MESSAGES ("Essa pessoa precisa criar uma conta no Aflyo primeiro.", "Já e administrador." -> "Já é administrador."), "Falha ao convidar.".
- `pages/audit/AuditList.tsx`: "Auditoria", "Registro imutável de toda ação administrativa.", cols "Data"/"Admin"/"Ação"/"Entidade"/"Motivo"/"Detalhes", "sistema", "ver", "Nenhum registro".
- `pages/Dashboard.tsx`: `METRIC_LABELS_FALLBACK` — acentuar todos ("Usuários totais", "Assinaturas canceladas", "Promoções criadas", "Cliques", "Taxa de sucesso de envio", "Jobs falhos", "Fila (queue depth)", "Erros nas últimas 24h", "Serviços degradados", etc.). `FEED_TYPE_LABELS` ("Usuário registrado", "Promoção criada", "Ação de admin"). "Visão executiva do Aflyo.", "Atividade recente", "Sem atividade no período", "Sem título".
- `nav.ts`: `NAV` section titles — "Visão geral", "Usuários", "Operação", "Monitoramento", "Integrações", "Segurança", "Sistema", "Administração". Item labels — "Promoções", "Configurações". Tag "Em breve" fica no `Sidebar`.
- `lib/admin-api.ts`: "Sessão ausente.", "Falha de rede ao chamar a admin-api.", "Resposta inesperada da admin-api.", "Erro.".

- [ ] **Step 3: Ajustar os testes que casam texto**

- `components/ui/StatCard.test.tsx`: `getByText('Dados indisponiveis')` -> `getByText('Dados indisponíveis')`.
- `components/ui/DataTable.test.tsx`: `getByRole('button', { name: /proxima/i })` -> `/próxima/i`.
- `components/RequirePermission.test.tsx`: `getByText(/nao tem permissao/i)` -> `/não tem permissão/i`.
- `App.test.tsx`: `getByText(/nao autorizado|nao tem acesso/i)` -> `/não autorizado|não tem acesso/i`.
- `pages/roles/RolesList.test.tsx` (Task 2 ja ajustou): conferir que `groupLabel` acentuado nao quebrou nada; nenhuma mudanca esperada aqui.
- `pages/admins/AdminsList.test.tsx`: usa `/suspender/i` e `/convidar admin/i` (sem acento nessas palavras) -> nenhuma mudanca.
- `pages/admins/InviteAdmin.test.tsx`: `getByLabelText(/e-mail/i)`, `getByRole('button', { name: /convidar/i })`, `getByText(/criar uma conta no Aflyo primeiro/i)` -> nenhuma mudanca (essas strings nao ganham acento).
- `pages/Dashboard.test.tsx` (Task 3 ja ajustou pra `Dados indisponíveis`).

- [ ] **Step 4: Rodar a suite inteira**

Run: `npm --prefix admin test`
Expected: **todos** passam (os 46 anteriores + os 4 de `permission-labels`), incluindo o do Dashboard que estava vermelho desde a Task 3.

- [ ] **Step 5: Build + lint**

Run:
```bash
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: OK nos dois.

- [ ] **Step 6: Commit**

```bash
git add admin/src/
git commit -m "fix(admin): acentuacao pt-BR correta em toda a copy do painel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Verificacao final + deploy

**Files:** nenhum (task de verificacao; correcoes pontuais se algo falhar).

- [ ] **Step 1: Suite + build + lint na arvore final**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: tudo verde. Contagem de testes: 50 (46 originais + 4 de `permission-labels`), 16 arquivos.

- [ ] **Step 2: Conferir consistencia de header/estados (visual, no codigo)**

Ler `Dashboard.tsx`, `admins/AdminsList.tsx`, `roles/RolesList.tsx`, `audit/AuditList.tsx` e confirmar que os 4 tem o mesmo padrao de header: `<section className="space-y-...">` + `<header>` com `<h1 className="font-display text-xl font-bold text-ink">` + `<p className="mt-1 text-sm text-ink-secondary">`. Ajustar qualquer um fora do padrao (mudanca so de `className`, sem logica).
Confirmar que loading/error/empty usam `Skeleton` / `ErrorState` / `EmptyState` (ou `DataTable`, que ja encapsula) e nao markup ad-hoc.

- [ ] **Step 3: Commit se houve ajuste no Step 2**

```bash
git add admin/src/
git commit -m "chore(admin): padroniza header das 4 telas do painel

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
(pular se nada mudou)

- [ ] **Step 4: Push da branch e PR**

```bash
git push -u origin feat/admin-sp1-polish
gh pr create --base main --head feat/admin-sp1-polish \
  --title "Painel admin: acabamento do SP1 (Cargos legivel, acentos pt-BR, Dashboard agrupado)" \
  --body "Polish do SP1. So front do admin/. Ver docs/superpowers/specs/2026-08-30-admin-sp1-polish-design.md. Empilha sobre a #44 (fix build standalone)."
```

- [ ] **Step 5: Deploy de preview e QA**

Run (da raiz do worktree, o `admin/.vercel` ja aponta pro projeto `aflyo-admin`):
```bash
cd admin && vercel deploy --yes --scope atendimentostopon-progs-projects && cd ..
```
Expected: URL de preview. Conferir no navegador:
- `/roles`: permissoes com rotulo pt-BR, chave tecnica no tooltip, grupos traduzidos, cards na ordem Super Admin > Suporte > Desenvolvedor > Analista, contador de permissoes, card do Super Admin recolhido com "ver todas as 49", secao "Atribuir cargo" com layout de form.
- `/` (Dashboard): 5 secoes com subtitulo (Usuarios, Assinaturas, Conteudo, Envios, Infraestrutura com "sem fonte no SP1").
- Acentos corretos no menu lateral, nos titulos, nos toasts, no login/MFA, no Unauthorized.
- Nenhum travessao em lugar nenhum.

- [ ] **Step 6: Deploy de producao**

Apos o QA no preview passar:
```bash
cd admin && vercel deploy --prod --yes --scope atendimentostopon-progs-projects && cd ..
```
Expected: `readyState: READY`, `target: production`. `https://admin.aflyo.com.br` serve a versao nova.

- [ ] **Step 7: Atualizar a memoria do projeto**

Editar `C:\Users\Tuik\.claude\projects\d--ofertapro\memory\project_admin_panel.md`: registrar "acabamento do SP1 (polish) em prod: Cargos com rotulos pt-BR, acentos corrigidos, Dashboard em 5 secoes; PR feat/admin-sp1-polish". Atualizar o pointer em `MEMORY.md`.

---

## Self-Review

**1. Spec coverage:**

| Spec (secao) | Task |
|---|---|
| 1. `permission-labels.ts` (49 + 8 + helpers) | Task 1 |
| 2. Cargos: ordem por poder, contador, chips label+title, Super Admin recolhivel, secao "Atribuir cargo" form, X no revogar, ajuste dos 2 testes | Task 2 |
| 3. Acentuacao pt-BR em todo o `admin/` + ajuste dos `getByText` afetados | Task 4 (e nos arquivos das Tasks 2 e 3, feitos junto) |
| 4. Dashboard em 5 secoes | Task 3 |
| 5. Consistencia header/estados nas 4 telas | Task 5 Step 2 |
| Verificacao (build/test/lint, QA no preview, deploy prod) | Task 5 |

Sem lacuna.

**2. Placeholder scan:** todos os steps de codigo tem o codigo real. A varredura de acentos (Task 4) lista os pontos conhecidos arquivo por arquivo em vez de "corrija os acentos" generico. O unico "ler o arquivo inteiro e corrigir" e inerente a uma passada de copy e vem com a lista de palavras canonicas + pontos especificos.

**3. Type consistency:**
- `permLabel` / `groupLabel` / `PERMISSION_ORDER` (Task 1) usados com a mesma assinatura na Task 2.
- `PERMISSION_LABELS` / `GROUP_LABELS` sao `Record<string, string>` nas duas pontas.
- `DASHBOARD_SECTIONS` (Task 3) e local do `Dashboard.tsx`, nao cruza task.
- `RoleRow` / `PermRow` / `RolesPayload` / `AdminRow` inalterados na Task 2.
- Nenhuma funcao renomeada entre tasks.

**4. Ordem / dependencia:** Task 1 -> Task 2 (usa os helpers). Task 3 deixa o teste do Dashboard vermelho de proposito ate a Task 4 acentuar o `StatCard` — documentado no step e no commit. Task 4 fecha a suite. Task 5 verifica e faz deploy. Rodar em ordem.
