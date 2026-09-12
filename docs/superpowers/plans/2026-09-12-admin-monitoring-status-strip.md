# Monitoring Status Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar uma faixa de status compacta e clicável no topo da página Monitoramento do painel admin, mostrando em 4 pills (Jobs/Erros/Banco/Auth) se cada área está saudável, sem precisar abrir cada aba.

**Architecture:** Um componente novo `StatusStrip` faz 4 fetches independentes (`useAsync` × 4) reaproveitando os mesmos endpoints `admin-api` que as abas já chamam, calcula um tom (success/warning/danger/neutral) por área a partir dos dados, e expõe um clique por pill que troca a aba ativa via callback. `MonitoringArea.tsx` só importa e renderiza o componente.

**Tech Stack:** React + TypeScript, Tailwind (admin/), Vitest + Testing Library.

## Global Constraints

- Sem migration nova — reaproveita `monitoring/cron-jobs`, `monitoring/dispatch-errors`, `monitoring/db-health`, `monitoring/logs` (todos já existentes).
- Cada pill só aparece (e só é buscado) se o admin tem a permissão daquela área: `jobs.read` (Jobs), `errors.read` (Erros), `system_health.read` (Banco e Auth).
- Uma falha isolada em um pill (ex.: Auth sem Management API configurada) nunca derruba os outros 3 — cada fetch é independente.
- `slow_by_mean` do `db-health` é sempre as top-10 queries (não é filtrado por threshold) — o sinal de saúde do Banco é o `mean_ms` da primeira (mais lenta), não `.length`.
- Tons usados: `success`/`warning`/`danger`/`neutral`, mesmos usados em `Badge` (`admin/src/components/ui/Badge.tsx`).
- pt-BR em toda a UI nova.

---

## Mapa de arquivos

- Criar: `admin/src/pages/monitoring/StatusStrip.tsx`
- Criar: `admin/src/pages/monitoring/StatusStrip.test.tsx`
- Modificar: `admin/src/pages/monitoring/MonitoringArea.tsx` — importa e renderiza `StatusStrip`.

---

### Task 1: `StatusStrip` + integração em `MonitoringArea`

**Files:**
- Create: `admin/src/pages/monitoring/StatusStrip.tsx`
- Create: `admin/src/pages/monitoring/StatusStrip.test.tsx`
- Modify: `admin/src/pages/monitoring/MonitoringArea.tsx`

**Interfaces:**
- Consumes: `useAsync` de `../../lib/use-async` (assinatura: `useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { data: T | null; loading: boolean; error: string | null; reload: () => void }`), `callAdminApi` de `../../lib/admin-api` (assinatura: `callAdminApi<T>(resource: string, action: string, params?: Record<string, unknown>): Promise<T>`), `useAdminAuth` de `../../context/AdminAuthContext` (retorna `{ identity }`, `identity?.permissions: string[]`), `hasPermission` de `../../lib/permissions` (assinatura: `hasPermission(granted: readonly string[], needed: string): boolean`).
- Produces: `export default function StatusStrip({ onJumpTo }: { onJumpTo: (tab: string) => void }): JSX.Element`. `MonitoringArea.tsx` consome como `<StatusStrip onJumpTo={setTab} />`.

- [ ] **Step 1: Escrever os testes (falhando)**

```tsx
// admin/src/pages/monitoring/StatusStrip.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

let mockPerms: string[] = ['jobs.read', 'errors.read', 'system_health.read'];
vi.mock('../../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ identity: { permissions: mockPerms } }),
}));

let mockImpl: (resource: string, action: string, params?: unknown) => Promise<unknown> =
  () => Promise.resolve(null);
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: [string, string, unknown?]) => mockImpl(...a),
  AdminApiError: class extends Error {},
}));

import StatusStrip from './StatusStrip';

type Call = { resource: string; action: string };

function router(byAction: Record<string, () => Promise<unknown>>) {
  return (_resource: string, action: string) => {
    const fn = byAction[action];
    if (!fn) return Promise.reject(new Error(`sem mock pra action ${action}`));
    return fn();
  };
}

describe('StatusStrip', () => {
  beforeEach(() => {
    mockPerms = ['jobs.read', 'errors.read', 'system_health.read'];
  });

  it('mostra Jobs em danger quando ha falhas nas ultimas 24h', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 2 }, { jobid: 2, fails_24h: 0 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { sends: 0, success: 0, partial: 0, error: 0, error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Jobs · 2 falha\(s\) \(24h\)/)).toBeInTheDocument());
  });

  it('mostra Jobs em success quando nao ha falhas', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 0 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Jobs · OK')).toBeInTheDocument());
  });

  it('mostra Erros nas 3 faixas de acordo com error_rate', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 7.5 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Erros · 7.5%')).toBeInTheDocument());
  });

  it('mostra Banco com o mean_ms da query mais lenta', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [{ query: 'select 1', calls: 10, mean_ms: 1234, total_ms: 12340 }] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Banco · 1234ms')).toBeInTheDocument());
  });

  it('mostra Banco OK quando slow_by_mean vem vazio', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Banco · OK')).toBeInTheDocument());
  });

  it('mostra Auth com contagem de falhas de login', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [
        { event_message: 'invalid login attempt', timestamp: 'x' },
        { event_message: 'user signed in', timestamp: 'y' },
      ] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Auth · 1 falha\(s\) login \(24h\)/)).toBeInTheDocument());
  });

  it('mostra Auth indisponivel quando o fetch de logs falha, sem quebrar os outros pills', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 0 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.reject(new Error('Management API nao configurada')),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Auth · indisponível')).toBeInTheDocument());
    expect(screen.getByText('Jobs · OK')).toBeInTheDocument();
  });

  it('clicar num pill chama onJumpTo com a key da aba', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 1 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    const onJumpTo = vi.fn();
    render(<StatusStrip onJumpTo={onJumpTo} />);
    await waitFor(() => expect(screen.getByText(/Jobs ·/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Jobs ·/));
    expect(onJumpTo).toHaveBeenCalledWith('jobs');
  });

  it('sem permissao de errors.read, nao renderiza nem busca o pill de Erros', async () => {
    mockPerms = ['jobs.read'];
    const calls: string[] = [];
    mockImpl = (_resource, action) => {
      calls.push(action);
      if (action === 'cron-jobs') return Promise.resolve({ items: [] });
      return Promise.reject(new Error(`nao deveria chamar ${action}`));
    };
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Jobs · OK')).toBeInTheDocument());
    expect(screen.queryByText(/Erros ·/)).not.toBeInTheDocument();
    expect(calls).not.toContain('dispatch-errors');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd admin && npx vitest run src/pages/monitoring/StatusStrip.test.tsx`
Expected: FAIL — `Cannot find module './StatusStrip'`

- [ ] **Step 3: Implementar `StatusStrip.tsx`**

```tsx
// admin/src/pages/monitoring/StatusStrip.tsx
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-success/25 bg-success-bg text-success-ink',
  warning: 'border-warning/25 bg-warning-bg text-warning-ink',
  danger: 'border-danger/25 bg-danger-bg text-danger-ink',
  neutral: 'border-line bg-surface-1 text-ink-secondary',
};

function Pill({ tone, label, onClick }: { tone: Tone; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors hover:opacity-80 ${TONE_CLASSES[tone]}`}
    >
      {label}
    </button>
  );
}

function isAuthFailureLine(row: Record<string, unknown>): boolean {
  return /login|password|invalid|denied|fail/i.test(String(row.event_message ?? ''));
}

function JobsPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading } = useAsync(
    () => callAdminApi<{ items: Array<{ fails_24h: number }> }>('monitoring', 'cron-jobs', {}),
    [],
  );
  if (loading || !data) return <Pill tone="neutral" label="Jobs · ..." onClick={() => onJumpTo('jobs')} />;
  const fails = data.items.reduce((sum, j) => sum + j.fails_24h, 0);
  return fails > 0
    ? <Pill tone="danger" label={`Jobs · ${fails} falha(s) (24h)`} onClick={() => onJumpTo('jobs')} />
    : <Pill tone="success" label="Jobs · OK" onClick={() => onJumpTo('jobs')} />;
}

function ErrorsPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading } = useAsync(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 3600_000);
    return callAdminApi<{ totals: { error_rate: number } }>('monitoring', 'dispatch-errors', {
      from: from.toISOString(), to: to.toISOString(),
    });
  }, []);
  if (loading || !data) return <Pill tone="neutral" label="Erros · ..." onClick={() => onJumpTo('erros')} />;
  const rate = data.totals.error_rate;
  const tone: Tone = rate > 5 ? 'danger' : rate >= 1 ? 'warning' : 'success';
  const label = rate < 1 ? 'Erros · OK' : `Erros · ${rate}%`;
  return <Pill tone={tone} label={label} onClick={() => onJumpTo('erros')} />;
}

function BancoPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading } = useAsync(
    () => callAdminApi<{ slow_by_mean: Array<{ mean_ms: number }> }>('monitoring', 'db-health', {}),
    [],
  );
  if (loading || !data) return <Pill tone="neutral" label="Banco · ..." onClick={() => onJumpTo('saude')} />;
  const meanMs = data.slow_by_mean[0]?.mean_ms;
  if (meanMs == null || meanMs < 200) return <Pill tone="success" label="Banco · OK" onClick={() => onJumpTo('saude')} />;
  const tone: Tone = meanMs >= 1000 ? 'danger' : 'warning';
  return <Pill tone={tone} label={`Banco · ${Math.round(meanMs)}ms`} onClick={() => onJumpTo('saude')} />;
}

function AuthPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading, error } = useAsync(
    () => callAdminApi<{ items: Array<Record<string, unknown>> }>('monitoring', 'logs', { source: 'auth', hours: 24 }),
    [],
  );
  if (error) return <Pill tone="neutral" label="Auth · indisponível" onClick={() => onJumpTo('auth')} />;
  if (loading || !data) return <Pill tone="neutral" label="Auth · ..." onClick={() => onJumpTo('auth')} />;
  const fails = data.items.filter(isAuthFailureLine).length;
  return fails > 0
    ? <Pill tone="warning" label={`Auth · ${fails} falha(s) login (24h)`} onClick={() => onJumpTo('auth')} />
    : <Pill tone="success" label="Auth · OK" onClick={() => onJumpTo('auth')} />;
}

export default function StatusStrip({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const can = (p: string) => hasPermission(perms, p);
  return (
    <div className="flex flex-wrap gap-2">
      {can('jobs.read') && <JobsPill onJumpTo={onJumpTo} />}
      {can('errors.read') && <ErrorsPill onJumpTo={onJumpTo} />}
      {can('system_health.read') && <BancoPill onJumpTo={onJumpTo} />}
      {can('system_health.read') && <AuthPill onJumpTo={onJumpTo} />}
    </div>
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd admin && npx vitest run src/pages/monitoring/StatusStrip.test.tsx`
Expected: PASS (9 testes)

- [ ] **Step 5: Integrar em `MonitoringArea.tsx`**

```tsx
// admin/src/pages/monitoring/MonitoringArea.tsx
import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import JobsTab from './JobsTab';
import ErrorsTab from './ErrorsTab';
import DbHealthTab from './DbHealthTab';
import AuthTab from './AuthTab';
import LogsTab from './LogsTab';
import StatusStrip from './StatusStrip';

const TABS = [
  { key: 'jobs', label: 'Jobs' },
  { key: 'erros', label: 'Erros' },
  { key: 'saude', label: 'Saúde do banco' },
  { key: 'logs', label: 'Logs' },
  { key: 'auth', label: 'Auth' },
] as const;

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}

export default function MonitoringArea() {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'jobs';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  const can = (perm: string) => hasPermission(perms, perm);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Monitoramento</h1>
        <p className="mt-1 text-sm text-ink-secondary">Jobs, erros, saúde do banco, logs e auth.</p>
      </header>
      <StatusStrip onJumpTo={setTab} />
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key ? 'border-b-2 border-ink text-ink' : 'text-ink-secondary hover:text-ink'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {active === 'jobs' && (can('jobs.read') ? <JobsTab /> : <NoPerm />)}
      {active === 'erros' && (can('errors.read') ? <ErrorsTab /> : <NoPerm />)}
      {active === 'saude' && (can('system_health.read') ? <DbHealthTab /> : <NoPerm />)}
      {active === 'logs' && (can('logs.read') ? <LogsTab /> : <NoPerm />)}
      {active === 'auth' && (can('system_health.read') ? <AuthTab /> : <NoPerm />)}
    </section>
  );
}
```

- [ ] **Step 6: Rodar a suíte inteira do `admin/` e o typecheck**

Run: `cd admin && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: todos os testes passando (a única falha esperada, se aparecer, é o flake pré-existente e não-relacionado em `src/pages/integrations/SubscriptionsTab.test.tsx` — documentado na rodada anterior; rode esse arquivo isolado pra confirmar antes de tratar como regressão), typecheck sem erros.

- [ ] **Step 7: Commit**

```bash
git add admin/src/pages/monitoring/StatusStrip.tsx admin/src/pages/monitoring/StatusStrip.test.tsx admin/src/pages/monitoring/MonitoringArea.tsx
git commit -m "feat(admin): faixa de status clicavel no topo de Monitoramento"
```

---

## Verificação final

- [ ] `cd admin && npx vitest run` — suíte inteira passando (ou só o flake pré-existente documentado).
- [ ] `cd admin && npx tsc --noEmit -p tsconfig.json` — sem erros.
- [ ] Testar visualmente em produção após deploy: 4 pills aparecem (ou menos, conforme permissão do admin logado), cores corretas, clique em cada um pula pra aba certa.
