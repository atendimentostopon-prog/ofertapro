# SP3 — Dashboard operacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaginar `src/pages/Dashboard.tsx` num painel operacional (status do bot em destaque, atalhos, métricas sem clique) com layout único pra todos os planos, onde só a zona de analytics troca entre gráficos (Pro/Business) e um card de upsell (Starter/Free).

**Architecture:** Um `<Dashboard>` que compõe 4 componentes novos de apresentação (`BotStatusCard`, `QuickActions`, `OperationalMetrics`, `AnalyticsZone`) alimentados por 2 hooks: `useDashboardStats` (existente, janela de histórico ampliada) e `useBotStatus` (novo — lê `bot_configs`, deriva um `view`, e liga/desliga `bot_configs.ativo` inline). Nenhuma mudança de backend.

**Tech Stack:** Vite + React 19 + TypeScript + Tailwind + react-router-dom v7 + recharts + Supabase JS client. **Não há framework de teste no repo** — a verificação de cada task é `npm run build` (roda `tsc -b` + `vite build`) + `npx eslint` nos arquivos tocados + QA no navegador (batelada na Task 7).

## Global Constraints

- **Só front.** Nenhuma migration, nenhuma Edge Function, nenhuma mudança em RLS/schema. Rollback = reverter o front.
- **Sem travessão (—) em nenhuma copy** de produto (regra do projeto). Usar hífen ou reescrever.
- Condição única do swap de analytics: `getPlanLimits(plan).advancedAnalytics` (`plan` = `stats.profile?.plan || user?.plan || 'free'`). `true` → gráficos; `false` → card de upsell.
- **O toggle de pausa do bot mexe em `bot_configs.ativo` (booleano), não em `bot_configs.status`.** `status` é o ciclo de conexão com o Telegram (`active`/`paused`/`error`/`pending`/sem linha). Espelha o `handleToggleAtivo` do `BotTab`.
- Não mexer no gating do SP2: `<LockedNumber>` em `/offers`, `/history` e no card "Top Ofertas" do Dashboard continua igual. A vitrine pública não é tocada.
- Design system atual: componentes `Card` / `PageHeader` / `LoadingState` / `ErrorState` / `EmptyState`, paleta mint (positivo) / warning-âmbar (pausado) / danger (erro/expirado) / `surface-*` `line` `ink-*`, fonte de display Space Grotesk (`font-display`), classes globais `btn-secondary` / `btn-gradient`.
- `bot_configs` **pode não ter linha** pro usuário (nunca conectou o bot) — todo acesso é via `.maybeSingle()` e trata `null` sem erro.
- Spec de referência: `docs/superpowers/specs/2026-09-05-sp3-dashboard-operacional-design.md`.

---

### Task 1: Hook `useBotStatus`

**Files:**
- Create: `src/hooks/useBotStatus.ts`

**Interfaces:**
- Consumes: `supabase` (`src/lib/supabase`), `useUser` (`src/context/UserContext`), `useToast` (`src/context/ToastContext`).
- Produces:
  - `export type BotView = 'not_connected' | 'error' | 'access_revoked' | 'paused_by_user' | 'monitoring'`
  - `export function useBotStatus(): { view: BotView; groupsCount: number; errorMessage: string | null; loading: boolean; toggling: boolean; setMonitoring: (on: boolean) => Promise<void>; refresh: () => Promise<void> }`

- [ ] **Step 1: Criar o arquivo**

Create `src/hooks/useBotStatus.ts` com exatamente este conteúdo:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';

export type BotView =
  | 'not_connected'
  | 'error'
  | 'access_revoked'
  | 'paused_by_user'
  | 'monitoring';

interface BotConfigRow {
  status?: string | null;
  ativo?: boolean | null;
  grupos_origem?: string[] | null;
  paused_reason?: string | null;
  error_message?: string | null;
}

interface BotStatusState {
  view: BotView;
  groupsCount: number;
  errorMessage: string | null;
  loading: boolean;
  toggling: boolean;
  setMonitoring: (on: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

function deriveView(row: BotConfigRow | null): BotView {
  if (!row || row.status !== 'active') {
    if (row?.status === 'error') return 'error';
    if (row?.status === 'paused') return 'access_revoked';
    return 'not_connected';
  }
  return row.ativo === false ? 'paused_by_user' : 'monitoring';
}

export function useBotStatus(): BotStatusState {
  const { user } = useUser();
  const { toast } = useToast();
  const [row, setRow] = useState<BotConfigRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const activeRef = useRef(true);

  const load = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('bot_configs')
        .select('status, ativo, grupos_origem, paused_reason, error_message')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!activeRef.current) return;
      setRow((data as BotConfigRow) ?? null);
    } catch (err) {
      console.error('[useBotStatus] erro ao carregar:', err);
    } finally {
      if (activeRef.current) setLoading(false);
    }
  }, [user?.id]);

  const setMonitoring = useCallback(async (on: boolean) => {
    if (!user?.id) return;
    setToggling(true);
    try {
      const { error } = await supabase
        .from('bot_configs')
        .update({ ativo: on })
        .eq('user_id', user.id);
      if (error) throw error;
      setRow(prev => (prev ? { ...prev, ativo: on } : prev));
      toast(
        on
          ? 'Bot reativado.'
          : 'Bot pausado. Você para de receber novas ofertas até reativar.',
        'success',
      );
    } catch (err: any) {
      toast(err.message || 'Erro ao atualizar o status do bot.', 'error');
    } finally {
      setToggling(false);
    }
  }, [user?.id, toast]);

  useEffect(() => {
    activeRef.current = true;
    load();
    return () => { activeRef.current = false; };
  }, [load]);

  return {
    view: deriveView(row),
    groupsCount: Array.isArray(row?.grupos_origem) ? row!.grupos_origem!.length : 0,
    errorMessage: row?.error_message ?? null,
    loading,
    toggling,
    setMonitoring,
    refresh: load,
  };
}
```

- [ ] **Step 2: Confirmar os imports**

Run: `grep -n "export function useToast\|export const useToast" src/context/ToastContext.tsx`
Expected: encontra o export de `useToast`. Se o nome/caminho divergir, ajustar o import (o `BotTab.tsx` usa `const { toast } = useToast()` — mesmo shape).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro de TypeScript.

- [ ] **Step 4: Lint**

Run: `npx eslint src/hooks/useBotStatus.ts`
Expected: sem erro novo. (`any` em `catch (err: any)` segue o padrão do `BotTab.tsx`/`useDashboardStats.ts`; se o eslint reclamar de `no-explicit-any`, confirmar que os hooks existentes têm o mesmo e deixar igual.)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useBotStatus.ts
git commit -m "feat(dashboard): hook useBotStatus (status do bot + toggle de monitoramento)"
```

---

### Task 2: Ampliar `useDashboardStats` para 30 dias de histórico

**Files:**
- Modify: `src/hooks/useDashboardStats.ts`

**Interfaces:**
- Consumes: nada novo.
- Produces: o objeto retornado ganha `dispatches30d: number` (contagem de `history` nos últimos 30 dias). `activeOffers` e `connectedChannels` **já são retornados hoje** — não mexer neles.

- [ ] **Step 1: Ampliar a busca de histórico**

Em `src/hooks/useDashboardStats.ts`, na `Promise.all` (por volta da linha 60-68), trocar a linha do `history`:

```ts
        fetchWithFallback(supabase.from('history').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5), 'history', 4000),
```

por:

```ts
        fetchWithFallback(supabase.from('history').select('*').eq('user_id', user.id).gte('sent_at', thirtyDaysAgo.toISOString()).order('sent_at', { ascending: false }), 'history', 4000),
```

(`thirtyDaysAgo` já está definido no início do `loadStats`, por volta da linha 33.)

- [ ] **Step 2: Expor `dispatches30d`**

No objeto passado pro `setStats({ ... })` (por volta da linha 191), adicionar a linha logo depois de `totalClicks30d,`:

```ts
        dispatches30d: recentHistory.length,
```

E no estado inicial do `useState` (por volta da linha 7-22), adicionar depois de `totalClicks30d: 0,`:

```ts
    dispatches30d: 0,
```

- [ ] **Step 3: Confirmar que "Disparos Recentes" continua com no máx. 4 itens**

Run: `grep -n "recentHistory" src/pages/Dashboard.tsx`
Expected: o consumo em `Dashboard.tsx` é `recentHistory.slice(0, 4)` (linha ~433). Como a lista agora pode ter dezenas de itens, confirmar que **todo** consumo de `recentHistory` pra renderizar lista usa `.slice(0, N)`. O único consumo hoje é o `.slice(0, 4)` do card "Disparos Recentes". Nenhuma mudança necessária aqui além de anotar (a Task 7 reescreve esse trecho e mantém o `.slice(0, 4)`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro.

- [ ] **Step 5: Lint**

Run: `npx eslint src/hooks/useDashboardStats.ts`
Expected: sem erro novo.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDashboardStats.ts
git commit -m "feat(dashboard): useDashboardStats traz 30 dias de historico + dispatches30d"
```

---

### Task 3: Helper `timeAgo` + componente `BotStatusCard`

**Files:**
- Modify: `src/lib/format.ts` (adicionar `timeAgo`)
- Create: `src/components/dashboard/BotStatusCard.tsx`

**Interfaces:**
- Consumes: `BotView` (Task 1), `pluralize` (existente em `src/lib/format.ts`), `useNavigate`.
- Produces:
  - `export function timeAgo(value: string | number | Date | null | undefined): string`
  - `export const BotStatusCard: React.FC<{ view: BotView; groupsCount: number; errorMessage: string | null; lastDispatchAt: string | null; toggling: boolean; onToggle: (on: boolean) => void; isExpired: boolean }>`

- [ ] **Step 1: Adicionar `timeAgo` em `src/lib/format.ts`**

No fim de `src/lib/format.ts`, adicionar:

```ts
/**
 * Tempo relativo curto em PT-BR pra "último disparo".
 *   timeAgo(Date.now())              -> "agora"
 *   timeAgo(Date.now() - 5*60_000)   -> "há 5 min"
 *   timeAgo(Date.now() - 3*3_600_000)-> "há 3 h"
 *   timeAgo(Date.now() - 2*86_400_000) -> "há 2 dias"
 */
export function timeAgo(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const then = value instanceof Date ? value.getTime() : new Date(value).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  if (diffMs < 60_000) return 'agora';
  const min = Math.floor(diffMs / 60_000);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${pluralize(d, 'dia', 'dias')}`;
}
```

(`pluralize` está no mesmo arquivo, sem import.)

- [ ] **Step 2: Criar `BotStatusCard.tsx`**

Create `src/components/dashboard/BotStatusCard.tsx` com este conteúdo:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, Radar, Pause, Play, AlertTriangle, Clock } from 'lucide-react';
import { pluralize, timeAgo } from '../../lib/format';
import type { BotView } from '../../hooks/useBotStatus';

interface Props {
  view: BotView;
  groupsCount: number;
  errorMessage: string | null;
  lastDispatchAt: string | null;
  toggling: boolean;
  onToggle: (on: boolean) => void;
  isExpired: boolean;
}

const BASE = 'rounded-2xl border p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4';

export const BotStatusCard: React.FC<Props> = ({
  view, groupsCount, errorMessage, lastDispatchAt, toggling, onToggle, isExpired,
}) => {
  const navigate = useNavigate();
  const resolved = isExpired || view === 'access_revoked' ? 'expired' : view;

  if (resolved === 'monitoring' || resolved === 'paused_by_user') {
    const monitoring = resolved === 'monitoring';
    return (
      <div className={`${BASE} ${monitoring ? 'border-mint-200 bg-ice/50' : 'border-warning/30 bg-warning-bg/40'}`}>
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          monitoring ? 'bg-ice text-mint-700' : 'bg-warning-bg text-warning-ink'
        }`}>
          <Bot className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-ink font-display">
            {monitoring ? 'Bot ativo' : 'Bot pausado'}
          </h3>
          <p className="text-sm text-ink-secondary mt-0.5">
            {monitoring
              ? `Monitorando ${pluralize(groupsCount, 'grupo', 'grupos')} de origem${
                  lastDispatchAt ? ` · último disparo ${timeAgo(lastDispatchAt)}` : ' · nenhum disparo ainda'
                }`
              : 'O bot não está monitorando seus grupos de origem.'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            type="button"
            disabled={toggling}
            onClick={() => onToggle(!monitoring)}
            className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {monitoring ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {monitoring ? 'Pausar bot' : 'Reativar bot'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/integrations')}
            className="text-xs font-semibold text-ink-secondary hover:text-ink cursor-pointer"
          >
            Gerenciar
          </button>
        </div>
      </div>
    );
  }

  const cfg = {
    expired: {
      wrap: 'border-danger/25 bg-danger-bg/40', chip: 'bg-danger-bg text-danger-ink', Icon: Clock,
      title: 'Bot parado',
      body: 'Seu acesso expirou. Assine um plano e o bot volta a monitorar.',
      cta: 'Ver planos', to: '/pricing',
    },
    error: {
      wrap: 'border-danger/25 bg-danger-bg/40', chip: 'bg-danger-bg text-danger-ink', Icon: AlertTriangle,
      title: 'Bot com erro',
      body: errorMessage || 'Reconecte o bot na tela de integrações.',
      cta: 'Gerenciar', to: '/integrations',
    },
    not_connected: {
      wrap: 'border-line bg-surface-1', chip: 'bg-surface-2 text-ink-secondary', Icon: Radar,
      title: 'Bot não conectado',
      body: 'Conecte o bot do Telegram pra ele monitorar seus grupos.',
      cta: 'Conectar bot', to: '/integrations',
    },
  }[resolved];

  const { wrap, chip, Icon, title, body, cta, to } = cfg;
  return (
    <div className={`${BASE} ${wrap}`}>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${chip}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-base font-bold text-ink font-display">{title}</h3>
        <p className="text-sm text-ink-secondary mt-0.5">{body}</p>
      </div>
      <button
        type="button"
        onClick={() => navigate(to)}
        className="btn-secondary px-4 py-2 text-xs font-semibold cursor-pointer flex-shrink-0"
      >
        {cta}
      </button>
    </div>
  );
};
```

Nota: usa `<div>` cru (não `<Card>`) de propósito — igual às faixas de trial/expirado atuais do `Dashboard.tsx` — pra o tom de fundo do estado não brigar com o `bg-surface-0` base do `Card`.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro. Se o TS reclamar que `resolved` pode não ser chave de `cfg`: o `if` anterior já removeu `monitoring`/`paused_by_user`, então `resolved` é `'expired' | 'error' | 'not_connected'` — se necessário, anotar `const cfg: Record<'expired'|'error'|'not_connected', {...}>` ou `resolved as 'expired' | 'error' | 'not_connected'` no acesso.

- [ ] **Step 4: Lint**

Run: `npx eslint src/lib/format.ts src/components/dashboard/BotStatusCard.tsx`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/components/dashboard/BotStatusCard.tsx
git commit -m "feat(dashboard): BotStatusCard com pausa/reativacao inline + helper timeAgo"
```

---

### Task 4: Componente `QuickActions`

**Files:**
- Create: `src/components/dashboard/QuickActions.tsx`

**Interfaces:**
- Consumes: `useNavigate`.
- Produces: `export const QuickActions: React.FC` (sem props).

- [ ] **Step 1: Criar `QuickActions.tsx`**

Create `src/components/dashboard/QuickActions.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, Radio, Radar } from 'lucide-react';

const ACTIONS: { label: string; Icon: React.ComponentType<{ className?: string }>; to: string }[] = [
  { label: 'Nova oferta',       Icon: Plus,  to: '/offers/new' },
  { label: 'Disparar oferta',   Icon: Send,  to: '/offers' },
  { label: 'Conectar canal',    Icon: Radio, to: '/channels' },
  { label: 'Grupos de origem',  Icon: Radar, to: '/integrations' },
];

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {ACTIONS.map(({ label, Icon, to }) => (
        <button
          key={to}
          type="button"
          onClick={() => navigate(to)}
          className="btn-secondary flex flex-col items-center justify-center gap-1.5 py-4 px-2 text-xs font-semibold cursor-pointer"
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/dashboard/QuickActions.tsx`
Expected: sem erro novo.

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/QuickActions.tsx
git commit -m "feat(dashboard): QuickActions (4 atalhos de acao)"
```

---

### Task 5: Componente `OperationalMetrics`

**Files:**
- Create: `src/components/dashboard/OperationalMetrics.tsx`

**Interfaces:**
- Consumes: `Card` (`src/components/ui/Card`), ícones lucide.
- Produces: `export const OperationalMetrics: React.FC<{ dispatches30d: number; connectedChannels: number; channelLimit: number; channelLimited: boolean; channelsAtLimit: boolean; activeOffers: number; groupsMonitored: number }>`

- [ ] **Step 1: Criar `OperationalMetrics.tsx`**

Create `src/components/dashboard/OperationalMetrics.tsx`:

```tsx
import React from 'react';
import { Send, Radio, Package, Radar } from 'lucide-react';
import { Card } from '../ui/Card';

interface Props {
  dispatches30d: number;
  connectedChannels: number;
  channelLimit: number;
  channelLimited: boolean;
  channelsAtLimit: boolean;
  activeOffers: number;
  groupsMonitored: number;
}

export const OperationalMetrics: React.FC<Props> = ({
  dispatches30d, connectedChannels, channelLimit, channelLimited, channelsAtLimit,
  activeOffers, groupsMonitored,
}) => {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card variant="metric" className="p-4 flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Disparos</span>
          <Send className="w-4 h-4 text-mint-700 opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{dispatches30d}</h3>
          <p className="text-[10px] text-ink-tertiary mt-0.5">nos últimos 30 dias</p>
        </div>
      </Card>

      <Card
        variant="metric"
        className="p-4 flex flex-col justify-between group"
        title={channelsAtLimit ? 'Você atingiu o limite de canais do seu plano. Faça upgrade para conectar mais.' : undefined}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Canais</span>
          <Radio className={`w-4 h-4 opacity-70 group-hover:opacity-100 transition-opacity ${channelsAtLimit ? 'text-warning-ink' : 'text-ink-secondary'}`} />
        </div>
        <div className="mt-3">
          <div className="flex items-baseline gap-1">
            <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{connectedChannels}</h3>
            <span className="text-[10px] font-medium text-ink-tertiary">/ {channelLimited ? channelLimit : '∞'}</span>
          </div>
          {channelLimited && (
            <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden mt-2 border border-line-subtle">
              <div
                className={`h-full rounded-full transition-all duration-500 ${channelsAtLimit ? 'bg-warning' : 'bg-mint-500'}`}
                style={{ width: `${Math.min((connectedChannels / channelLimit) * 100, 100)}%` }}
              />
            </div>
          )}
          {channelsAtLimit
            ? <p className="text-[10px] font-semibold text-warning-ink mt-1.5">Limite atingido</p>
            : <p className="text-[10px] text-ink-tertiary mt-0.5">conectados</p>}
        </div>
      </Card>

      <Card variant="metric" className="p-4 flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Ofertas ativas</span>
          <Package className="w-4 h-4 text-info-ink opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{activeOffers}</h3>
          <p className="text-[10px] text-ink-tertiary mt-0.5">publicadas</p>
        </div>
      </Card>

      <Card variant="metric" className="p-4 flex flex-col justify-between group">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold text-ink-tertiary uppercase tracking-wider">Grupos</span>
          <Radar className="w-4 h-4 text-mint-700 opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>
        <div className="mt-3">
          <h3 className="text-2xl font-bold text-ink tracking-tight tabular-nums font-display">{groupsMonitored}</h3>
          <p className="text-[10px] text-ink-tertiary mt-0.5">de origem monitorados</p>
        </div>
      </Card>
    </div>
  );
};
```

- [ ] **Step 2: Confirmar tokens de cor**

Run: `grep -n "info-ink\|warning-ink\|line-subtle" src/index.css tailwind.config.*`
Expected: `info-ink`, `warning-ink` e `line-subtle` existem (o `Dashboard.tsx` atual já usa os três). Se algum não existir, trocar pelo token equivalente já usado no `Dashboard.tsx` (ver o card "Canais" e os `metricCards` originais).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro.

- [ ] **Step 4: Lint**

Run: `npx eslint src/components/dashboard/OperationalMetrics.tsx`
Expected: sem erro novo.

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard/OperationalMetrics.tsx
git commit -m "feat(dashboard): OperationalMetrics (4 metricas sem clique)"
```

---

### Task 6: Componente `AnalyticsZone`

**Files:**
- Create: `src/components/dashboard/AnalyticsZone.tsx`

**Interfaces:**
- Consumes: `Card` (`src/components/ui/Card`), `EmptyState` (`src/components/ui/EmptyState`), `recharts`, `useNavigate`, ícones lucide.
- Produces: `export const AnalyticsZone: React.FC<{ showAnalytics: boolean; totalClicksToday: number; totalClicks7d: number; totalClicks30d: number; clicksByDay: { date: string; cliques: number }[]; clicksBySource: { name: string; value: number }[]; topSource: string; topMarketplace: string }>`

- [ ] **Step 1: Criar `AnalyticsZone.tsx`**

Este componente é o dono do próprio wrapper de layout. O ramo `showAnalytics === true` move pra cá — **sem os overlays de paywall** — os dois cards "Cliques por Dia" e "Origem de Tráfego" que hoje vivem inline no `Dashboard.tsx` (linhas ~227-360), mais `CustomTooltip` (linhas ~26-42) e `COLORS` (linha ~86). O ramo `false` é o card único de upsell.

Create `src/components/dashboard/AnalyticsZone.tsx`:

```tsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart3, Sparkles } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';

const COLORS = ['#3DD98F', '#22C078', '#199A5F', '#88E5B8'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface-0 rounded-md border border-line shadow-md p-3">
        <p className="text-xs font-semibold text-ink mb-1">{label}</p>
        {payload.map((p: any) => (
          <div key={p.name} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.name}:</span>
            <span className="font-semibold text-ink tabular-nums">{p.value.toLocaleString('pt-BR')}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

interface Props {
  showAnalytics: boolean;
  totalClicksToday: number;
  totalClicks7d: number;
  totalClicks30d: number;
  clicksByDay: { date: string; cliques: number }[];
  clicksBySource: { name: string; value: number }[];
  topSource: string;
  topMarketplace: string;
}

export const AnalyticsZone: React.FC<Props> = ({
  showAnalytics, totalClicksToday, totalClicks7d, totalClicks30d,
  clicksByDay, clicksBySource, topSource, topMarketplace,
}) => {
  const navigate = useNavigate();

  if (!showAnalytics) {
    return (
      <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="w-12 h-12 rounded-xl bg-ice border border-mint-200 text-mint-700 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-ink font-display">Analytics completo no Profissional</h3>
          <ul className="mt-2 space-y-1">
            {[
              'Cliques por dia de cada oferta',
              'Origem de tráfego: qual canal converte',
              'Ranking real das suas ofertas por clique',
            ].map(item => (
              <li key={item} className="text-xs text-ink-secondary flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-mint-500 flex-shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          onClick={() => navigate('/pricing')}
          className="btn-gradient px-5 py-2 text-xs font-semibold cursor-pointer flex-shrink-0"
        >
          Fazer upgrade
        </button>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-3">
      <Card className="col-span-12 lg:col-span-8 p-5 flex flex-col relative overflow-hidden min-h-[300px]">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Cliques por Dia</h2>
            <p className="text-[11px] text-ink-secondary mt-0.5">Últimos 7 dias</p>
          </div>
          <div className="flex items-center gap-3 text-[10px] font-semibold text-ink-tertiary tabular-nums">
            <span>Hoje <b className="text-ink">{totalClicksToday}</b></span>
            <span>7d <b className="text-ink">{totalClicks7d}</b></span>
            <span>30d <b className="text-ink">{totalClicks30d}</b></span>
          </div>
        </div>

        {totalClicks30d === 0 ? (
          <div className="flex-grow flex flex-col items-center justify-center py-8 text-center">
            <EmptyState
              icon={BarChart3}
              title="Sem cliques para exibir"
              description="Crie sua primeira oferta e conecte um canal para começar a acompanhar seus resultados."
            />
          </div>
        ) : (
          <div className="flex-grow w-full min-h-[200px]">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={clicksByDay} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCliques" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3DD98F" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3DD98F" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(16, 20, 24, 0.06)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="cliques" name="Cliques" stroke="#22C078" strokeWidth={2} fill="url(#colorCliques)" activeDot={{ r: 5, fill: '#22C078', stroke: '#FFFFFF', strokeWidth: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col justify-between relative overflow-hidden min-h-[300px]">
        <div>
          <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Origem de Tráfego</h2>
          <p className="text-[11px] text-ink-secondary mt-0.5">Cliques por canal</p>
        </div>

        {totalClicks30d === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center">
            <p className="text-xs text-ink-tertiary">Sem dados disponíveis.</p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center gap-3 py-3">
            <div className="space-y-3">
              {clicksBySource.map((item, index) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-ink">{item.name}</span>
                    <span className="font-semibold text-ink tabular-nums">{item.value}</span>
                  </div>
                  <div className="w-full bg-surface-1 h-1.5 rounded-full overflow-hidden border border-line-subtle">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((item.value / totalClicks30d) * 100, 100)}%`,
                        backgroundColor: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-line flex items-center justify-between">
              <div className="text-left">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Destaque</p>
                <p className="text-xs font-semibold text-mint-800 capitalize mt-0.5">
                  {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Marketplace</p>
                <p className="text-xs font-semibold text-ink capitalize mt-0.5">{topMarketplace.toUpperCase()}</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro.

- [ ] **Step 3: Lint**

Run: `npx eslint src/components/dashboard/AnalyticsZone.tsx`
Expected: sem erro novo. (Os `any` em `CustomTooltip` são cópia literal do `Dashboard.tsx` atual — mesmo padrão, mesmo tratamento de eslint.)

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/AnalyticsZone.tsx
git commit -m "feat(dashboard): AnalyticsZone (graficos Pro/Business ou card de upsell Starter/Free)"
```

---

### Task 7: Reescrever o corpo do `Dashboard.tsx`

**Files:**
- Modify: `src/pages/Dashboard.tsx`

**Interfaces:**
- Consumes: `useDashboardStats` (com `dispatches30d`), `useBotStatus` (`view`, `groupsCount`, `errorMessage`, `toggling`, `setMonitoring`), `BotStatusCard`, `QuickActions`, `OperationalMetrics`, `AnalyticsZone`, `useAccountAccess`, `getPlanLimits`, `OnboardingChecklist`.
- Produces: a página `/dashboard` renderizada com o novo layout.

- [ ] **Step 1: Reescrever `src/pages/Dashboard.tsx`**

Substituir o arquivo inteiro por:

```tsx
import React from 'react';
import { ArrowUpRight, Lightbulb, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useDashboardStats } from '../hooks/useDashboardStats';
import { useBotStatus } from '../hooks/useBotStatus';
import OnboardingChecklist from '../components/onboarding/OnboardingChecklist';
import { getPlanLimits } from '../config/plans';
import { PageHeader } from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';
import { Card } from '../components/ui/Card';
import ProductImage from '../components/shared/ProductImage';
import ChannelLogo from '../components/ui/ChannelLogo';
import { useUser } from '../context/UserContext';
import { useAccountAccess } from '../hooks/useAccountAccess';
import { pluralize, toDisplayName } from '../lib/format';
import { LockedNumber } from '../components/billing/LockedNumber';
import { BotStatusCard } from '../components/dashboard/BotStatusCard';
import { QuickActions } from '../components/dashboard/QuickActions';
import { OperationalMetrics } from '../components/dashboard/OperationalMetrics';
import { AnalyticsZone } from '../components/dashboard/AnalyticsZone';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const stats = useDashboardStats();
  const bot = useBotStatus();
  const { user } = useUser();
  const access = useAccountAccess();

  const {
    totalClicksToday, totalClicks7d, totalClicks30d,
    dispatches30d, connectedChannels, activeOffers,
    topOffers, topMarketplace, topSource,
    clicksByDay, clicksBySource, recentHistory, insights,
    loading, error,
  } = stats;

  if (loading) {
    return <LoadingState type="spinner" />;
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-6">
        <ErrorState
          title="Não conseguimos atualizar as métricas agora"
          message="Você pode continuar usando o sistema. Tente atualizar as estatísticas novamente."
          onRetry={stats.refresh}
        />
      </div>
    );
  }

  const plan = stats.profile?.plan || user?.plan || 'free';
  const limits = getPlanLimits(plan);
  const showClicks = limits.advancedAnalytics;

  const channelLimit = limits.maxWhatsappConnections + limits.maxTelegramConnections;
  const channelLimited = limits.maxWhatsappConnections !== Infinity && channelLimit > 0;
  const channelsAtLimit = channelLimited && connectedChannels >= channelLimit;

  const getFirstName = () => {
    if (!user) return 'Usuário';
    if (user.preferred_name?.trim()) return user.preferred_name.trim();
    if (user.full_name?.trim() && user.full_name !== 'Usuário') return user.full_name.trim().split(' ')[0];
    const pName = user.publicName || user.public_display_name;
    if (pName?.trim() && pName !== 'Usuário') return pName.trim().split(' ')[0];
    if (user.username?.trim() && !user.username.includes('_temp')) return user.username.trim();
    if (user.email?.trim()) return user.email.split('@')[0];
    return 'Usuário';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-5 animate-slide-up pb-8">
      <PageHeader
        title={`Olá, ${toDisplayName(getFirstName())}!`}
        description="Acompanhe seus disparos e o que o bot está fazendo."
      >
        <div className="flex items-center gap-1.5 text-[10px] font-medium text-ink-secondary bg-surface-0 border border-line rounded-md px-2.5 py-1.5">
          <Clock className="w-3 h-3 text-ink-tertiary" />
          <span>Atualizado agora</span>
        </div>
      </PageHeader>

      {access.isExpired && (
        <div className="rounded-2xl border border-danger/25 bg-danger-bg/40 p-5 sm:p-6 flex flex-col sm:flex-row gap-4">
          <div className="w-11 h-11 rounded-xl bg-danger-bg text-danger-ink flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-base font-bold text-ink font-display">Seu acesso expirou</h3>
            <p className="text-sm text-ink-secondary mt-1 max-w-2xl">
              O teste grátis de 7 dias terminou e o bot parou de monitorar seus grupos. Suas ofertas,
              canais, grupos de origem e templates continuam salvos. Assine um plano e tudo volta a
              funcionar exatamente como estava.
            </p>
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={() => navigate('/pricing')} className="btn-gradient px-5 py-2 text-xs font-semibold cursor-pointer">
                Ver planos
              </button>
              <button onClick={() => navigate('/feedbacks')} className="btn-secondary px-5 py-2 text-xs font-semibold cursor-pointer">
                Falar com o suporte
              </button>
            </div>
          </div>
        </div>
      )}

      {access.isTrialing && (
        <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 ${
          access.daysLeft <= 1 ? 'border-warning/30 bg-warning-bg/50' : 'border-mint-200 bg-ice/60'
        }`}>
          <Clock className={`w-4 h-4 flex-shrink-0 ${access.daysLeft <= 1 ? 'text-warning-ink' : 'text-mint-700'}`} />
          <p className={`text-xs font-medium flex-1 ${access.daysLeft <= 1 ? 'text-warning-ink' : 'text-mint-800'}`}>
            {access.daysLeft <= 1
              ? 'Último dia do teste grátis. Amanhã o bot para de monitorar e disparar até você assinar.'
              : `Teste grátis. Faltam ${access.daysLeft} dias. Depois disso o bot pausa até você assinar.`}
          </p>
          <button
            onClick={() => navigate('/pricing')}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer flex-shrink-0 ${
              access.daysLeft <= 1 ? 'bg-warning-ink text-white' : 'bg-mint-600 text-white hover:bg-mint-700'
            }`}
          >
            Assinar agora
          </button>
        </div>
      )}

      <OnboardingChecklist />

      <BotStatusCard
        view={bot.view}
        groupsCount={bot.groupsCount}
        errorMessage={bot.errorMessage}
        lastDispatchAt={recentHistory[0]?.sent_at ?? null}
        toggling={bot.toggling}
        onToggle={bot.setMonitoring}
        isExpired={access.isExpired}
      />

      <QuickActions />

      <OperationalMetrics
        dispatches30d={dispatches30d}
        connectedChannels={connectedChannels}
        channelLimit={channelLimit}
        channelLimited={channelLimited}
        channelsAtLimit={channelsAtLimit}
        activeOffers={activeOffers}
        groupsMonitored={bot.groupsCount}
      />

      <AnalyticsZone
        showAnalytics={showClicks}
        totalClicksToday={totalClicksToday}
        totalClicks7d={totalClicks7d}
        totalClicks30d={totalClicks30d}
        clicksByDay={clicksByDay}
        clicksBySource={clicksBySource}
        topSource={topSource}
        topMarketplace={topMarketplace}
      />

      {insights.length > 0 && (
        <Card className="p-4 flex flex-col sm:flex-row sm:items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-ice border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <h4 className="text-xs font-semibold text-mint-800 uppercase tracking-wider">Insights</h4>
            <ul className="space-y-1.5">
              {insights.map((insight: string, idx: number) => (
                <li key={idx} className="text-xs text-ink-secondary flex items-center gap-2 leading-relaxed">
                  <span className="w-1 h-1 rounded-full bg-mint-500 flex-shrink-0" />
                  <span>{insight}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-8 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Top Ofertas por Cliques</h2>
            <button onClick={() => navigate('/offers')} className="text-[11px] font-semibold text-mint-800 hover:text-mint-900 flex items-center gap-0.5 cursor-pointer transition-colors">
              Ver Ofertas <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1.5">
            {topOffers.length === 0 ? (
              <p className="text-xs text-ink-tertiary text-center py-6">Nenhuma oferta cadastrada.</p>
            ) : topOffers.map((offer: any, idx: number) => (
              <div key={offer.id} className="flex items-center gap-3 p-3 rounded-xl bg-surface-1 hover:bg-surface-2 transition-all group border border-line-subtle">
                <div className="w-6 h-6 rounded-md bg-ice border border-mint-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold text-mint-800">{idx + 1}</span>
                </div>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-surface-0 border border-line flex-shrink-0">
                  <ProductImage src={offer.image} alt={offer.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink truncate">{offer.name}</p>
                  <p className="text-[10px] text-ink-tertiary uppercase tracking-wider">{offer.marketplace}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-ink tabular-nums">
                    {showClicks
                      ? (offer.clicks || 0).toLocaleString('pt-BR')
                      : <LockedNumber>{(offer.clicks || 0).toLocaleString('pt-BR')}</LockedNumber>}
                  </p>
                  <p className="text-[9px] text-ink-tertiary uppercase">cliques</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-4 p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-ink tracking-tight font-display">Disparos Recentes</h2>
            <button onClick={() => navigate('/history')} className="text-[11px] font-semibold text-mint-800 hover:text-mint-900 flex items-center gap-0.5 cursor-pointer transition-colors">
              Ver Todos <ArrowUpRight className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-2.5 flex-1">
            {recentHistory.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <p className="text-xs text-ink-tertiary py-6">Nenhum disparo efetuado ainda.</p>
              </div>
            ) : recentHistory.slice(0, 4).map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-xs p-2 rounded-md hover:bg-surface-1 transition-colors">
                <div className="w-9 h-9 rounded-md bg-surface-1 border border-line flex items-center justify-center flex-shrink-0">
                  <ChannelLogo name={h.successful_channels?.[0] || 'telegram'} size="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink truncate">{h.offer_name}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-ink-tertiary mt-0.5">
                    <span>{pluralize(h.channel_count || 0, 'canal', 'canais')}</span>
                    <span className="text-ink-disabled">·</span>
                    <span>{new Date(h.sent_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                </div>
                <div className={`px-2 py-0.5 rounded-md text-[9px] font-semibold flex-shrink-0 ${
                  h.status === 'sent' || h.status === 'success' ? 'bg-success-bg text-success-ink' :
                  h.status === 'partial' ? 'bg-warning-bg text-warning-ink' : 'bg-danger-bg text-danger-ink'
                }`}>
                  {h.status === 'sent' || h.status === 'success' ? 'Sucesso' :
                   h.status === 'partial' ? 'Parcial' : 'Falhou'}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;
```

- [ ] **Step 2: Conferir nomes de campo do `user` usados em `getFirstName`**

Run: `grep -n "preferred_name\|publicName\|public_display_name" src/context/UserContext.tsx src/pages/Dashboard.tsx`
Expected: os campos são os mesmos que o `Dashboard.tsx` atual já usa (o bloco `getFirstName` é cópia literal do original). Nenhuma mudança — só confirmar que nada foi digitado errado ao copiar.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: `✓ built`, sem erro de TypeScript. Ficar de olho em: import não usado (removi `TrendingUp`, `MousePointerClick`, `Radio`, `Activity`, `Sparkles`, `BarChart3`, `AreaChart`/recharts, `useAccountAccess` continua, `EmptyState`, `ProductImage` continua). O `tsc` acusa `TS6133` pra import não usado — remover o que sobrar.

- [ ] **Step 4: Lint**

Run: `npx eslint src/pages/Dashboard.tsx`
Expected: sem erro novo.

- [ ] **Step 5: QA no navegador (`npm run dev`, login pelo `/login`)**

Conta `pro`/`enterprise` não testa o ramo Starter — precisa de conta com `plan='starter'` (`UPDATE profiles SET plan='starter' WHERE id='<id de teste>'` no SQL Editor e recarregar; reverter depois).

- **Conta Starter**: `/dashboard` mostra, sem nenhuma área borrada/morta: card do bot, 4 atalhos, 4 métricas com números reais (Disparos 30d, Canais N/limite, Ofertas ativas, Grupos), **1 card** "Analytics completo no Profissional" (nenhum gráfico coberto), "Top Ofertas" com número borrado + cadeado, "Disparos Recentes" normal.
- **Conta Pro** (reverter o `plan`): mesma página, mas a zona de analytics traz "Cliques por Dia" (com a tirinha Hoje/7d/30d no topo) + "Origem de Tráfego"; nada borrado.
- **Card do bot** (numa conta com `bot_configs`): `status='active'` + `ativo=true` → "Bot ativo" + "Pausar bot"; clicar → toast "Bot pausado...", vira "Bot pausado" + "Reativar bot", e a aba do bot em `/settings` mostra o mesmo estado; "Reativar bot" volta. `status='error'` → "Bot com erro" + "Gerenciar". Conta sem `bot_configs` → "Bot não conectado" + "Conectar bot". Conta expirada (`access.isExpired`) → "Bot parado" + "Ver planos".
- **Métricas**: "Disparos" bate com `SELECT count(*) FROM history WHERE user_id='<id>' AND sent_at >= now() - interval '30 days'`; "Grupos" bate com o tamanho de `bot_configs.grupos_origem`.
- **Estados**: recarregar direto em `/dashboard` (spinner, sem tela branca); onboarding incompleto mostra o checklist; `stats.error` mostra o `ErrorState` com retry.

- [ ] **Step 6: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "feat(dashboard): SP3 painel operacional (bot em destaque, atalhos, metricas sem clique, zona de analytics por plano)"
```

---

## Self-Review

**Spec coverage:**

| Requisito do spec | Task |
|---|---|
| Hook `useBotStatus` (lê `bot_configs`, deriva `view`, toggle `ativo`) | Task 1 |
| `useDashboardStats` histórico 5 → 30 dias + `dispatches30d` | Task 2 |
| Card do bot em destaque, 5 estados + expirado, pausa/reativa inline | Task 3 |
| Atalhos de ação (Nova oferta, Disparar, Conectar canal, Grupos) | Task 4 |
| Métricas sem clique (Disparos 30d, Canais N/limite, Ofertas ativas, Grupos) | Task 5 |
| Zona de analytics: gráficos de hoje (Pro/Business) sem overlay + tirinha Hoje/7d/30d; 1 card de upsell (Starter/Free) | Task 6 |
| Reescrita do `Dashboard.tsx` na nova ordem; mantém banners, onboarding, Insights, Top Ofertas (+`<LockedNumber>`), Disparos Recentes | Task 7 |
| Sem migration / Edge Function / mudança de gating do SP2 | todas (Global Constraints) |
| Verificação (build + lint por task, QA no navegador) | cada task + Task 7 |

Sem gaps.

**Placeholder scan:** nenhum "TBD/TODO". Todo passo de código traz o código real; os passos de `grep` de confirmação (imports, tokens de cor, nomes de campo) vêm com o valor esperado e o fallback explícito.

**Type consistency:**
- `BotView` definido na Task 1, importado como `type` na Task 3 e usado via `bot.view` na Task 7 — mesmo nome.
- `useBotStatus` retorna `{ view, groupsCount, errorMessage, loading, toggling, setMonitoring, refresh }` (Task 1); a Task 7 consome exatamente `bot.view` / `bot.groupsCount` / `bot.errorMessage` / `bot.toggling` / `bot.setMonitoring`.
- `BotStatusCard` props (Task 3): `{ view, groupsCount, errorMessage, lastDispatchAt, toggling, onToggle, isExpired }` — a Task 7 passa todas, com `lastDispatchAt={recentHistory[0]?.sent_at ?? null}` e `onToggle={bot.setMonitoring}` (assinatura `(on: boolean) => Promise<void>` compatível com `onToggle: (on: boolean) => void`).
- `OperationalMetrics` props (Task 5): `{ dispatches30d, connectedChannels, channelLimit, channelLimited, channelsAtLimit, activeOffers, groupsMonitored }` — a Task 7 passa todas com os mesmos nomes; `channelLimited`/`channelsAtLimit` derivados no Dashboard como no arquivo original.
- `AnalyticsZone` props (Task 6): `{ showAnalytics, totalClicksToday, totalClicks7d, totalClicks30d, clicksByDay, clicksBySource, topSource, topMarketplace }` — a Task 7 passa todas; `showAnalytics={showClicks}` onde `showClicks = getPlanLimits(plan).advancedAnalytics`.
- `dispatches30d` produzido na Task 2, consumido na Task 5 via Task 7.
- `timeAgo` definido na Task 3 em `src/lib/format.ts`, usado só dentro de `BotStatusCard` (mesma task).
