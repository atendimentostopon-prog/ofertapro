# Admin Dark Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar uma identidade visual de verdade ao painel admin: Sidebar/Topbar/Breadcrumbs ficam escuros pra sempre (afeta todas as páginas), e Dashboard + Monitoramento ganham um redesign completo em cima da paleta `graphite`/`mint` já existente no `tailwind.config.js` (hoje sem uso).

**Architecture:** É um reskin puro — troca de classes Tailwind em componentes já existentes, sem nenhuma mudança de lógica, estado, ou contrato de dados. `<main>` (o fundo por trás do conteúdo de toda página) continua claro globalmente — só Sidebar/Topbar ficam escuros — pra não quebrar a legibilidade das 9 páginas ainda não redesenhadas. Dashboard e Monitoramento aplicam o próprio fundo escuro só na área deles, como um cartão escuro cheio dentro do `main` claro.

**Tech Stack:** React + TypeScript, Tailwind (admin/), Vitest + Testing Library (só pra confirmar que nada quebrou — essa rodada não muda comportamento nem adiciona teste novo).

## Global Constraints

- Zero mudança em `tailwind.config.js` — só reaproveita tokens já existentes: `graphite` (50-900), `mint` (`DEFAULT` `#5EE7A5`), `success`/`warning`/`danger` (usando a variante `DEFAULT` com opacidade, não mais `-bg`/`-ink`).
- `<main>` (em `AdminLayout.tsx`) **não muda** — continua com o fundo claro atual. Não editar `AdminLayout.tsx` nem `AnnouncementBanner.tsx` nessa rodada.
- Não editar `Badge.tsx`, `StatCard.tsx`, `MiniBars.tsx`, `Skeleton.tsx`, `ErrorState.tsx`, `EmptyState.tsx`, nem o conteúdo das 5 abas de Monitoramento (`JobsTab.tsx`, `ErrorsTab.tsx`, `DbHealthTab.tsx`, `LogsTab.tsx`, `AuthTab.tsx`) — são compartilhados com as 9 páginas fora de escopo.
- Nenhuma mudança de comportamento, estado, prop, ou contrato entre componentes — só classes Tailwind. Nenhum teste existente deve precisar de edição (nenhum afirma uma classe de cor que muda nessa rodada — todos checam texto ou `data-testid`/`text-4xl`, que não mudam).
- pt-BR em toda cópia (não muda nessa rodada, só estilo).

---

## Mapa de arquivos

- Modificar: `admin/src/components/Sidebar.tsx`
- Modificar: `admin/src/components/Topbar.tsx`
- Modificar: `admin/src/components/Breadcrumbs.tsx`
- Modificar: `admin/src/components/ui/KpiCard.tsx`
- Modificar: `admin/src/pages/Dashboard.tsx`
- Modificar: `admin/src/pages/monitoring/MonitoringArea.tsx`
- Modificar: `admin/src/pages/monitoring/StatusStrip.tsx`

---

### Task 1: Shell escuro — Sidebar, Topbar, Breadcrumbs

**Files:**
- Modify: `admin/src/components/Sidebar.tsx`
- Modify: `admin/src/components/Topbar.tsx`
- Modify: `admin/src/components/Breadcrumbs.tsx`

**Interfaces:**
- Consumes: nada de outra task (são os arquivos raiz do shell, usados por `AdminLayout.tsx`, que não muda).
- Produces: nada consumido por outra task desse plano (Dashboard/Monitoramento não importam Sidebar/Topbar/Breadcrumbs).

Essa rodada não muda comportamento (nenhum teste cobre cor de classe hoje), então não há teste novo pra escrever — o passo de verificação roda a suíte existente pra confirmar que nada quebrou.

- [ ] **Step 1: Reescrever `Sidebar.tsx`**

```tsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV } from '../nav';
import { useAdminAuth } from '../context/AdminAuthContext';
import { hasPermission } from '../lib/permissions';

const STORAGE_KEY = 'admin:sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export default function Sidebar() {
  const { identity } = useAdminAuth();
  const granted = identity?.permissions ?? [];
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* storage indisponivel: segue so com o estado em memoria */
      }
      return next;
    });
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-white/10 bg-graphite-900 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && <span className="font-display text-sm font-bold text-white">Aflyo Admin</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="rounded-md p-1 text-white/50 transition-colors hover:bg-white/5 hover:text-white"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-6">
        {NAV.map((section) => {
          const items = section.items.filter(
            (i) => !i.permission || hasPermission(granted, i.permission),
          );
          if (items.length === 0) return null;
          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-white/40">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  if (item.comingSoon || !item.to) {
                    return (
                      <li key={item.label}>
                        <span
                          aria-disabled
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-white/30"
                          title="Em breve"
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          {!collapsed && (
                            <span className="flex-1 truncate">
                              {item.label}
                              <span className="ml-1.5 text-[10px] font-semibold uppercase">Em breve</span>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.label}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-mint text-graphite-900'
                              : 'text-white/60 hover:bg-white/5 hover:text-white'
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: Reescrever `Topbar.tsx`**

```tsx
import { LogOut } from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';
import Breadcrumbs from './Breadcrumbs';

export default function Topbar() {
  const { identity, signOut } = useAdminAuth();

  return (
    <header className="flex items-center justify-between border-b border-white/10 bg-graphite-900 px-6 py-3">
      <Breadcrumbs />
      <div className="flex items-center gap-3">
        <span className="hidden text-xs font-semibold text-white/60 sm:inline">{identity?.email}</span>
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/10"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
          Sair
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Reescrever `Breadcrumbs.tsx`**

```tsx
import { useLocation } from 'react-router-dom';
import { NAV_ITEMS } from '../nav';

const EXTRA_LABELS: Record<string, string> = {
  '/admins/invite': 'Convidar admin',
};

export default function Breadcrumbs() {
  const { pathname } = useLocation();
  const match = NAV_ITEMS.find((i) => i.to === pathname);
  const label = match?.label ?? EXTRA_LABELS[pathname] ?? 'Painel';

  return (
    <nav aria-label="Trilha" className="text-xs text-white/50">
      <span className="text-white/40">Aflyo Admin</span>
      <span className="mx-1.5 text-white/40">/</span>
      <span className="font-semibold text-white">{label}</span>
    </nav>
  );
}
```

- [ ] **Step 4: Rodar a suíte inteira do `admin/` e o typecheck**

Run: `cd admin && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: todos os testes passando (nenhum afirma uma cor de classe do Sidebar/Topbar/Breadcrumbs), typecheck sem erros. Se aparecer uma falha isolada num arquivo de lista com filtro debounced (ex. `SubscriptionsTab.test.tsx` ou `SendsList.test.tsx`), é o flake pré-existente já documentado em rodadas anteriores — rode esse arquivo sozinho pra confirmar que passa isolado antes de seguir.

- [ ] **Step 5: Commit**

```bash
git add admin/src/components/Sidebar.tsx admin/src/components/Topbar.tsx admin/src/components/Breadcrumbs.tsx
git commit -m "feat(admin): shell escuro (Sidebar/Topbar/Breadcrumbs) com acento mint"
```

---

### Task 2: `KpiCard.tsx` recolorido

**Files:**
- Modify: `admin/src/components/ui/KpiCard.tsx`

**Interfaces:**
- Consumes: nada de outra task (props/tipos do componente não mudam: `KpiCard`, `KpiSeriesPoint` mantêm a mesma assinatura já usada pelo `Dashboard.tsx` atual).
- Produces: mesma assinatura de antes — `Dashboard.tsx` (Task 3) não muda a forma como importa/usa `KpiCard`.

- [ ] **Step 1: Reescrever `KpiCard.tsx`**

```tsx
const nf = new Intl.NumberFormat('pt-BR');
const pctFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });

export type KpiSeriesPoint = { date: string; value: number };

function Sparkline({ series }: { series: KpiSeriesPoint[] }) {
  const max = Math.max(1, ...series.map((p) => p.value));
  const w = 100 / series.length;
  const height = 28;
  return (
    <svg
      data-testid="kpi-sparkline"
      aria-hidden="true"
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      className="mt-2 w-full"
      style={{ height }}
    >
      {series.map((p, i) => {
        const h = (p.value / max) * (height - 4);
        return (
          <rect
            key={p.date}
            x={i * w + w * 0.2}
            y={height - h}
            width={w * 0.6}
            height={h}
            className="fill-mint/70"
          />
        );
      })}
    </svg>
  );
}

export function KpiCard({
  label,
  value,
  available,
  suffix,
  previous,
  series,
  size = 'default',
}: {
  label: string;
  value: number | null;
  available: boolean;
  suffix?: string;
  previous?: number | null;
  series?: KpiSeriesPoint[];
  size?: 'default' | 'hero';
}) {
  const hasDelta = available && value !== null && previous != null && previous > 0;
  const delta = hasDelta ? ((value! - previous!) / previous!) * 100 : null;
  const up = delta != null && delta >= 0;

  return (
    <div className="rounded-xl border border-white/10 bg-graphite-800 p-4" aria-disabled={!available || undefined}>
      <p className="text-xs font-semibold text-white/60">{label}</p>
      {available && value !== null ? (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <p
              className={`font-display font-bold text-white ${
                size === 'hero' ? 'text-4xl drop-shadow-[0_0_20px_rgba(94,231,165,0.45)]' : 'text-2xl'
              }`}
            >
              {nf.format(value)}{suffix ?? ''}
            </p>
            {delta != null && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
                aria-label={`${up ? 'aumento' : 'queda'} de ${pctFmt.format(Math.abs(delta))}%`}
              >
                {up ? '▲' : '▼'} {pctFmt.format(Math.abs(delta))}%
              </span>
            )}
          </div>
          {series && series.length >= 2 && <Sparkline series={series} />}
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold text-white/40">Dados indisponíveis</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Rodar os testes do `KpiCard` e confirmar que continuam passando**

Run: `cd admin && npx vitest run src/components/ui/KpiCard.test.tsx`
Expected: PASS (9/9 — nenhuma assertion do arquivo de teste afirma uma classe de cor; `toHaveClass('text-4xl')` continua verdadeiro, já que só foi adicionada uma classe extra ao lado, não removida).

- [ ] **Step 3: Commit**

```bash
git add admin/src/components/ui/KpiCard.tsx
git commit -m "feat(admin): KpiCard recolorido pro shell escuro (glow mint no hero)"
```

---

### Task 3: `Dashboard.tsx` — cartão escuro cheio

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `KpiCard` de `../components/ui/KpiCard` (Task 2, mesma assinatura de antes — só a cor mudou por dentro).
- Produces: nada consumido por outra task.

- [ ] **Step 1: Reescrever `Dashboard.tsx`**

```tsx
import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { UserPlus, Megaphone, Send, Plug, ScrollText, Activity } from 'lucide-react';
import { callAdminApi } from '../lib/admin-api';
import { useAsync } from '../lib/use-async';
import { KpiCard, type KpiSeriesPoint } from '../components/ui/KpiCard';
import { Skeleton } from '../components/ui/Skeleton';
import { ErrorState } from '../components/ui/ErrorState';
import { EmptyState } from '../components/ui/EmptyState';

type Range = 'today' | '7d' | '30d' | '90d';

type Metric = { value: number | null; available: boolean; previous?: number | null; series?: KpiSeriesPoint[] };
type FeedItem = { id: string; type: string; title: string; at: string; href: string | null };
type DashboardSummary = {
  range: { from: string; to: string };
  labels: Record<string, string>;
  metrics: Record<string, Metric>;
  feed: FeedItem[];
};

const DASHBOARD_SECTIONS: { title: string; keys: string[] }[] = [
  { title: 'Usuários', keys: ['users_new', 'users_total'] },
  { title: 'Assinaturas', keys: ['subs_active', 'subs_canceled'] },
  { title: 'Conteúdo', keys: ['offers_created', 'links_processed', 'clicks'] },
  { title: 'Envios', keys: ['sends', 'sends_success_rate', 'webhooks_received'] },
];

const METRIC_LABELS_FALLBACK: Record<string, string> = {
  users_total: 'Usuários totais',
  users_active: 'Usuários ativos',
  users_new: 'Novos usuários no período',
  subs_active: 'Assinaturas ativas',
  subs_canceled: 'Assinaturas canceladas',
  offers_created: 'Promoções criadas',
  links_processed: 'Links processados',
  clicks: 'Cliques',
  sends: 'Envios',
  sends_success_rate: 'Taxa de sucesso de envio',
  webhooks_received: 'Webhooks recebidos',
};

const FEED_ICONS: Record<string, typeof UserPlus> = {
  user_registered: UserPlus,
  promotion_created: Megaphone,
  send: Send,
  webhook_received: Plug,
  admin_action: ScrollText,
};

const FEED_TYPE_LABELS: Record<string, string> = {
  user_registered: 'Usuário registrado',
  promotion_created: 'Promoção criada',
  send: 'Envio',
  webhook_received: 'Webhook recebido',
  admin_action: 'Ação de admin',
};

const FEED_HREF: Record<string, (id: string) => string> = {
  user_registered: (id) => `/users/${id}`,
  promotion_created: (id) => `/promotions/${id}`,
};

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: '30d', label: '30 dias' },
  { key: '90d', label: '90 dias' },
];

const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });

function relative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  return rtf.format(Math.round(diffSec / 86400), 'day');
}

export default function Dashboard() {
  const [range, setRange] = useState<Range>('7d');
  const fetcher = useCallback(
    () => callAdminApi<DashboardSummary>('dashboard', 'summary', { range }),
    [range],
  );
  const { data, loading, error, reload } = useAsync(fetcher, [range]);
  const activeUsers = data?.metrics.users_active;

  return (
    <section className="space-y-6 rounded-2xl bg-graphite-900 p-6 shadow-lg">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-white">Dashboard</h1>
          <p className="mt-1 text-sm text-white/60">Visão executiva do Aflyo.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-white/10 bg-white/5 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                range === r.key ? 'bg-mint text-graphite-900' : 'text-white/60 hover:bg-white/10'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {error && <ErrorState message={error} onRetry={reload} />}

      {!error && loading && (
        <div className="grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!error && !loading && data && (
        <>
          {activeUsers && (
            <KpiCard
              label={data.labels.users_active ?? METRIC_LABELS_FALLBACK.users_active}
              value={activeUsers.value}
              available={activeUsers.available}
              size="hero"
            />
          )}

          <div className="space-y-6">
            {DASHBOARD_SECTIONS.map((section) => {
              const keys = section.keys.filter((k) => k in data.metrics);
              if (keys.length === 0) return null;
              return (
                <div key={section.title}>
                  <h2 className="font-display text-sm font-bold text-white">{section.title}</h2>
                  <div className="mt-2 grid grid-cols-1 gap-3 xs:grid-cols-2 lg:grid-cols-4">
                    {keys.map((key) => {
                      const m = data.metrics[key];
                      return (
                        <KpiCard
                          key={key}
                          label={data.labels[key] ?? METRIC_LABELS_FALLBACK[key] ?? key}
                          value={m.value}
                          available={m.available}
                          previous={m.previous}
                          series={m.series}
                          suffix={key === 'sends_success_rate' ? '%' : undefined}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <Link
              to="/monitoring"
              className="flex items-center gap-3 rounded-xl border border-white/10 bg-graphite-800 p-4 transition-colors hover:bg-white/5"
            >
              <Activity className="h-5 w-5 shrink-0 text-mint" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-white">Monitoramento</p>
                <p className="text-xs text-white/60">Jobs, erros e saúde do banco em tempo real.</p>
              </div>
            </Link>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold text-white">Atividade recente</h2>
            {data.feed.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="Sem atividade no período" />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-white/10 rounded-xl border border-white/10 bg-graphite-800">
                {data.feed.map((item) => {
                  const Icon = FEED_ICONS[item.type] ?? ScrollText;
                  const href = FEED_HREF[item.type]?.(item.id);
                  const content = (
                    <>
                      <Icon className="h-4 w-4 shrink-0 text-white/40" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{item.title || 'Sem título'}</p>
                        <p className="text-xs text-white/40">{FEED_TYPE_LABELS[item.type] ?? item.type}</p>
                      </div>
                      <span className="shrink-0 text-xs text-white/40">{relative(item.at)}</span>
                    </>
                  );
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                      {href ? (
                        <Link to={href} className="flex flex-1 items-center gap-3 hover:opacity-80">
                          {content}
                        </Link>
                      ) : (
                        <div className="flex flex-1 items-center gap-3">{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Rodar os testes do `Dashboard` e confirmar que continuam passando**

Run: `cd admin && npx vitest run src/pages/Dashboard.test.tsx`
Expected: PASS (5/5 — nenhuma assertion afirma uma cor de classe; os textos, links e `toHaveClass('text-4xl')` continuam iguais).

- [ ] **Step 3: Rodar a suíte inteira do `admin/` e o typecheck**

Run: `cd admin && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: mesmo resultado do Task 1 Step 4 (tudo passando, exceto o flake pré-existente já documentado).

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/Dashboard.tsx
git commit -m "feat(admin): Dashboard como cartao escuro cheio"
```

---

### Task 4: Monitoramento — `MonitoringArea.tsx` e `StatusStrip.tsx`

**Files:**
- Modify: `admin/src/pages/monitoring/MonitoringArea.tsx`
- Modify: `admin/src/pages/monitoring/StatusStrip.tsx`

**Interfaces:**
- Consumes: nada de outra task desse plano.
- Produces: nada consumido por outra task.

- [ ] **Step 1: Reescrever `StatusStrip.tsx`** (só a constante `TONE_CLASSES` muda — resto do arquivo idêntico)

```tsx
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  danger: 'border-danger/30 bg-danger/10 text-danger',
  neutral: 'border-white/10 bg-white/5 text-white/50',
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
  const { data, loading, error } = useAsync(
    () => callAdminApi<{ items: Array<{ fails_24h: number }> }>('monitoring', 'cron-jobs', {}),
    [],
  );
  if (error) return <Pill tone="neutral" label="Jobs · indisponível" onClick={() => onJumpTo('jobs')} />;
  if (loading || !data) return <Pill tone="neutral" label="Jobs · ..." onClick={() => onJumpTo('jobs')} />;
  const fails = data.items.reduce((sum, j) => sum + j.fails_24h, 0);
  return fails > 0
    ? <Pill tone="danger" label={`Jobs · ${fails} falha(s) (24h)`} onClick={() => onJumpTo('jobs')} />
    : <Pill tone="success" label="Jobs · OK" onClick={() => onJumpTo('jobs')} />;
}

function ErrorsPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading, error } = useAsync(() => {
    const to = new Date();
    const from = new Date(to.getTime() - 24 * 3600_000);
    return callAdminApi<{ totals: { error_rate: number } }>('monitoring', 'dispatch-errors', {
      from: from.toISOString(), to: to.toISOString(),
    });
  }, []);
  if (error) return <Pill tone="neutral" label="Erros · indisponível" onClick={() => onJumpTo('erros')} />;
  if (loading || !data) return <Pill tone="neutral" label="Erros · ..." onClick={() => onJumpTo('erros')} />;
  const rate = data.totals.error_rate;
  const tone: Tone = rate > 5 ? 'danger' : rate >= 1 ? 'warning' : 'success';
  const label = rate < 1 ? 'Erros · OK' : `Erros · ${rate}%`;
  return <Pill tone={tone} label={label} onClick={() => onJumpTo('erros')} />;
}

function BancoPill({ onJumpTo }: { onJumpTo: (tab: string) => void }) {
  const { data, loading, error } = useAsync(
    () => callAdminApi<{ slow_by_mean: Array<{ mean_ms: number }> }>('monitoring', 'db-health', {}),
    [],
  );
  if (error) return <Pill tone="neutral" label="Banco · indisponível" onClick={() => onJumpTo('saude')} />;
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

- [ ] **Step 2: Rodar os testes do `StatusStrip` e confirmar que continuam passando**

Run: `cd admin && npx vitest run src/pages/monitoring/StatusStrip.test.tsx`
Expected: PASS (12/12 — nenhuma assertion afirma classe de cor).

- [ ] **Step 3: Reescrever `MonitoringArea.tsx`**

```tsx
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
  return <p className="text-sm text-white/50">Voce nao tem permissao pra esta aba.</p>;
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
    <section className="space-y-6 rounded-2xl bg-graphite-900 p-6 shadow-lg">
      <header>
        <h1 className="font-display text-xl font-bold text-white">Monitoramento</h1>
        <p className="mt-1 text-sm text-white/60">Jobs, erros, saúde do banco, logs e auth.</p>
      </header>
      <StatusStrip onJumpTo={setTab} />
      <div className="flex gap-1 border-b border-white/10">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key ? 'border-b-2 border-mint text-white' : 'text-white/40 hover:text-white/70'
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

- [ ] **Step 4: Rodar a suíte inteira do `admin/` e o typecheck**

Run: `cd admin && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: mesmo resultado das tasks anteriores (tudo passando, exceto o flake pré-existente já documentado).

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/monitoring/MonitoringArea.tsx admin/src/pages/monitoring/StatusStrip.tsx
git commit -m "feat(admin): Monitoramento como cartao escuro cheio (pills e abas recoloridos)"
```

---

## Verificação final

- [ ] `cd admin && npx vitest run` — suíte inteira passando (ou só o flake pré-existente documentado).
- [ ] `cd admin && npx tsc --noEmit -p tsconfig.json` — sem erros.
- [ ] Testar visualmente em produção após deploy: Sidebar/Topbar escuros em TODAS as páginas (inclusive as 9 fora de escopo — só o shell muda pra elas, o conteúdo continua claro e legível); Dashboard e Monitoramento como cartões escuros cheios com acento mint (selos, sparkline, item de nav ativo, glow no hero).
