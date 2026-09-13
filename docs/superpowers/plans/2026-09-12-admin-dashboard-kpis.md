# Dashboard KPIs comparativos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar o Dashboard do painel admin (`admin/`) pra mostrar KPIs comparativos (valor + variação % vs período anterior + sparkline), remover a seção "Infraestrutura" (sempre vazia), destacar "Usuários ativos" como card hero, e tornar o feed de atividade clicável.

**Architecture:** Migration Postgres nova (`create or replace function`, aditiva) estende `admin_dashboard_summary` pra devolver `previous`/`series` nas métricas de fluxo. O handler `dashboard.ts` não muda (payload já é passthrough). No front, um componente `KpiCard` novo substitui `StatCard` no Dashboard; `Dashboard.tsx` reorganiza as seções e o feed ganha `<Link>` + ícones.

**Tech Stack:** Postgres/PL·pgSQL (migration), Deno (handler, já existe), React + TypeScript + Tailwind (admin/), Vitest + Testing Library.

## Global Constraints

- Migration deve ser **aditiva**: mesma assinatura de função (`admin_dashboard_summary(p_from timestamptz, p_to timestamptz)`), mesmas keys de métrica já existentes continuam presentes (inclusive as 6 `available:false` de Infraestrutura — só o front para de renderizar).
- `previous`/`series` só nas métricas de fluxo: `users_new`, `offers_created`, `clicks`, `sends`, `sends_success_rate`, `webhooks_received`. Métricas de snapshot (`users_total`, `users_active`, `subs_active`, `subs_canceled`) continuam só com `value`/`available`.
- `series`: array de `{ date: "YYYY-MM-DD", value: number }`, um ponto por dia em `[p_from, p_to]`.
- Selo de variação só aparece quando `previous` existe e é `> 0`; nunca mostra "0%" quando não há base de comparação.
- Visual: reusa os tokens Tailwind já existentes (`ink`, `success`, `danger`, `surface`, `line`, `graphite`) — nenhum token novo, nenhuma cor fora da paleta do `admin/tailwind.config.js`.
- pt-BR em toda a UI nova (labels, textos de erro, etc.), seguindo o padrão do resto do `admin/`.

---

## Mapa de arquivos

- Criar: `supabase/migrations/20260912090000_admin_dashboard_summary_v2.sql` — RPC estendida.
- Criar: `admin/src/components/ui/KpiCard.tsx` — card de KPI com selo + sparkline.
- Criar: `admin/src/components/ui/KpiCard.test.tsx` — testes do `KpiCard`.
- Modificar: `admin/src/pages/Dashboard.tsx` — remove seção Infraestrutura, adiciona card hero, troca `StatCard` por `KpiCard`, feed clicável com ícones.
- Modificar: `admin/src/pages/Dashboard.test.tsx` — casos novos pro selo, sparkline, ausência da seção Infraestrutura, links do feed.

---

### Task 1: Migration `admin_dashboard_summary_v2`

**Files:**
- Create: `supabase/migrations/20260912090000_admin_dashboard_summary_v2.sql`

**Interfaces:**
- Produces: RPC `public.admin_dashboard_summary(p_from timestamptz, p_to timestamptz) returns jsonb`, mesma assinatura de antes. Cada métrica de fluxo agora é `{ "value": n|null, "available": bool, "previous": n|null, "series": [{ "date": "YYYY-MM-DD", "value": n }] }`. Métricas de snapshot continuam `{ "value": n|null, "available": bool }`. `feed` inalterado.

- [ ] **Step 1: Escrever a migration**

```sql
-- SP-dashboard-kpis: estende admin_dashboard_summary com comparacao vs periodo
-- anterior e serie diaria, pras metricas de fluxo (as que contam eventos no
-- periodo, nao snapshot de estado atual).
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
  v_prev_from timestamptz; v_prev_to timestamptz;
  v_prev_users_new bigint; v_prev_offers_new bigint; v_prev_clicks bigint;
  v_prev_sends bigint; v_prev_sends_ok bigint; v_prev_webhooks_recv bigint;
  v_prev_sends_rate numeric;
  s_users_new jsonb; s_offers_new jsonb; s_clicks jsonb; s_sends jsonb; s_webhooks jsonb;
begin
  v_prev_to := p_from;
  v_prev_from := p_from - (p_to - p_from);

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

  select count(*) into v_prev_users_new from public.profiles where created_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_offers_new from public.offers where created_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_clicks from public.clicks where created_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_sends from public.history where sent_at between v_prev_from and v_prev_to;
  select count(*) into v_prev_sends_ok from public.history where sent_at between v_prev_from and v_prev_to and status = 'success';
  select count(*) into v_prev_webhooks_recv from public.webhook_events where processed_at between v_prev_from and v_prev_to;
  v_prev_sends_rate := case when v_prev_sends > 0 then round((v_prev_sends_ok::numeric / v_prev_sends) * 100, 1) else null end;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_users_new
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', created_at) as day, count(*) as n from public.profiles where created_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_offers_new
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', created_at) as day, count(*) as n from public.offers where created_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_clicks
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', created_at) as day, count(*) as n from public.clicks where created_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_sends
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', sent_at) as day, count(*) as n from public.history where sent_at between p_from and p_to group by 1) c on c.day = d.day;

  select coalesce(jsonb_agg(jsonb_build_object('date', to_char(d.day, 'YYYY-MM-DD'), 'value', coalesce(c.n, 0)) order by d.day), '[]'::jsonb)
    into s_webhooks
    from generate_series(date_trunc('day', p_from), date_trunc('day', p_to), interval '1 day') as d(day)
    left join (select date_trunc('day', processed_at) as day, count(*) as n from public.webhook_events where processed_at between p_from and p_to group by 1) c on c.day = d.day;

  m := jsonb_build_object(
    'users_total',      jsonb_build_object('value', v_users_total, 'available', true),
    'users_active',     jsonb_build_object('value', v_users_active, 'available', true),
    'users_new',        jsonb_build_object('value', v_users_new, 'available', true, 'previous', v_prev_users_new, 'series', s_users_new),
    'subs_active',      jsonb_build_object('value', v_subs_active, 'available', true),
    'subs_canceled',    jsonb_build_object('value', v_subs_canceled, 'available', true),
    'offers_created',   jsonb_build_object('value', v_offers_new, 'available', true, 'previous', v_prev_offers_new, 'series', s_offers_new),
    'links_processed',  jsonb_build_object('value', v_links, 'available', true),
    'clicks',           jsonb_build_object('value', v_clicks, 'available', true, 'previous', v_prev_clicks, 'series', s_clicks),
    'sends',            jsonb_build_object('value', v_sends, 'available', true, 'previous', v_prev_sends, 'series', s_sends),
    'sends_success_rate', jsonb_build_object(
        'value', case when v_sends > 0 then round((v_sends_ok::numeric / v_sends) * 100, 1) else null end,
        'available', v_sends > 0,
        'previous', v_prev_sends_rate),
    'webhooks_received', jsonb_build_object('value', v_webhooks_recv, 'available', true, 'previous', v_prev_webhooks_recv, 'series', s_webhooks),
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

- [ ] **Step 2: Aplicar a migration no banco de desenvolvimento/staging**

Use o fluxo já usado nas migrations anteriores deste repo pra aplicar (`supabase db push`, ou o mesmo mecanismo usado pelos arquivos `_APLICAR_*.sql` na raiz do repo se for esse o processo deste projeto — confira com o usuário qual é o passo real de deploy de migration aqui antes de aplicar em produção).

- [ ] **Step 3: Verificar manualmente a RPC**

Não há teste automatizado de SQL neste repo (os `_test.ts` da admin-api só cobrem funções puras em TypeScript, não fazem round-trip no banco). Verifique manualmente rodando, com um client Postgres (psql, ou a ferramenta MCP do Supabase disponível):

```sql
select jsonb_pretty(public.admin_dashboard_summary(now() - interval '7 days', now()));
```

Confira visualmente: `users_new`, `offers_created`, `clicks`, `sends`, `sends_success_rate`, `webhooks_received` têm `previous` e `series` (série com ~7 pontos, um por dia); `users_total`, `users_active`, `subs_active`, `subs_canceled` continuam só com `value`/`available`; as 6 métricas de infraestrutura continuam `available: false`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260912090000_admin_dashboard_summary_v2.sql
git commit -m "feat(admin-api): admin_dashboard_summary com periodo anterior e serie diaria"
```

---

### Task 2: Componente `KpiCard`

**Files:**
- Create: `admin/src/components/ui/KpiCard.tsx`
- Test: `admin/src/components/ui/KpiCard.test.tsx`

**Interfaces:**
- Consumes: nada de outras tasks (componente de UI puro).
- Produces:
  ```ts
  export type KpiSeriesPoint = { date: string; value: number };
  export function KpiCard(props: {
    label: string;
    value: number | null;
    available: boolean;
    suffix?: string;
    previous?: number | null;
    series?: KpiSeriesPoint[];
    size?: 'default' | 'hero';
  }): JSX.Element;
  ```
  Task 3 (`Dashboard.tsx`) importa `KpiCard` e `KpiSeriesPoint` daqui.

- [ ] **Step 1: Escrever os testes (falhando)**

```tsx
// admin/src/components/ui/KpiCard.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('mostra "Dados indisponiveis" quando available e false', () => {
    render(<KpiCard label="Jobs falhos" value={null} available={false} />);
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });

  it('formata numero em pt-BR e aplica suffix', () => {
    render(<KpiCard label="Taxa" value={98.5} available suffix="%" />);
    expect(screen.getByText('98,5%')).toBeInTheDocument();
  });

  it('mostra selo verde quando value > previous', () => {
    render(<KpiCard label="Novos usuarios" value={120} available previous={100} />);
    expect(screen.getByText('▲ 20%')).toBeInTheDocument();
  });

  it('mostra selo vermelho quando value < previous', () => {
    render(<KpiCard label="Novos usuarios" value={80} available previous={100} />);
    expect(screen.getByText('▼ 20%')).toBeInTheDocument();
  });

  it('nao mostra selo sem previous', () => {
    render(<KpiCard label="Usuarios totais" value={500} available />);
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });

  it('nao mostra selo quando previous e 0', () => {
    render(<KpiCard label="Novos usuarios" value={5} available previous={0} />);
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });

  it('renderiza sparkline quando series tem 2+ pontos', () => {
    render(
      <KpiCard
        label="Cliques"
        value={40}
        available
        series={[{ date: '2026-09-01', value: 10 }, { date: '2026-09-02', value: 30 }]}
      />,
    );
    expect(screen.getByTestId('kpi-sparkline')).toBeInTheDocument();
  });

  it('nao renderiza sparkline com menos de 2 pontos', () => {
    render(
      <KpiCard label="Cliques" value={40} available series={[{ date: '2026-09-01', value: 10 }]} />,
    );
    expect(screen.queryByTestId('kpi-sparkline')).not.toBeInTheDocument();
  });

  it('aplica tratamento maior quando size e hero', () => {
    render(<KpiCard label="Usuarios ativos" value={300} available size="hero" />);
    expect(screen.getByText('300')).toHaveClass('text-4xl');
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd admin && npx vitest run src/components/ui/KpiCard.test.tsx`
Expected: FAIL — `Cannot find module './KpiCard'`

- [ ] **Step 3: Implementar `KpiCard`**

```tsx
// admin/src/components/ui/KpiCard.tsx
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
            className="fill-ink/50"
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
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card" aria-disabled={!available || undefined}>
      <p className="text-xs font-semibold text-ink-secondary">{label}</p>
      {available && value !== null ? (
        <>
          <div className="mt-1 flex items-baseline gap-2">
            <p className={`font-display font-bold text-ink ${size === 'hero' ? 'text-4xl' : 'text-2xl'}`}>
              {nf.format(value)}{suffix ?? ''}
            </p>
            {delta != null && (
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${up ? 'bg-success-bg text-success-ink' : 'bg-danger-bg text-danger-ink'}`}>
                {up ? '▲' : '▼'} {pctFmt.format(Math.abs(delta))}%
              </span>
            )}
          </div>
          {series && series.length >= 2 && <Sparkline series={series} />}
        </>
      ) : (
        <p className="mt-1 text-sm font-semibold text-ink-tertiary">Dados indisponíveis</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd admin && npx vitest run src/components/ui/KpiCard.test.tsx`
Expected: PASS (9 testes)

- [ ] **Step 5: Commit**

```bash
git add admin/src/components/ui/KpiCard.tsx admin/src/components/ui/KpiCard.test.tsx
git commit -m "feat(admin): componente KpiCard (selo de variacao + sparkline)"
```

---

### Task 3: Reorganizar `Dashboard.tsx`

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx`
- Modify: `admin/src/pages/Dashboard.test.tsx`

**Interfaces:**
- Consumes: `KpiCard`, `KpiSeriesPoint` de `../components/ui/KpiCard` (Task 2).
- Produces: nada consumido por outra task (página final da rodada).

- [ ] **Step 1: Atualizar o payload mockado no teste existente e escrever os casos novos (falhando)**

```tsx
// admin/src/pages/Dashboard.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockImpl: (resource: string, action: string, params?: unknown) => Promise<unknown> =
  () => Promise.resolve(null);
vi.mock('../lib/admin-api', () => ({
  callAdminApi: (...a: [string, string, unknown?]) => mockImpl(...a),
  AdminApiError: class extends Error {},
}));

import Dashboard from './Dashboard';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

const basePayload = {
  range: { from: 'x', to: 'y' },
  labels: {},
  metrics: {
    users_total: { value: 1200, available: true },
    users_active: { value: 300, available: true },
    users_new: { value: 120, available: true, previous: 100, series: [{ date: '2026-09-01', value: 60 }, { date: '2026-09-02', value: 60 }] },
    subs_active: { value: 50, available: true },
    subs_canceled: { value: 5, available: true },
    offers_created: { value: 10, available: true, previous: 8, series: [] },
    links_processed: { value: 200, available: true },
    clicks: { value: 400, available: true, previous: 500, series: [] },
    sends: { value: 30, available: true, previous: 20, series: [] },
    sends_success_rate: { value: 95, available: true, previous: 90 },
    webhooks_received: { value: 15, available: true, previous: 15, series: [] },
    webhooks_failed: { value: null, available: false },
    jobs_failed: { value: null, available: false },
    jobs_pending: { value: null, available: false },
    queue_depth: { value: null, available: false },
    errors_24h: { value: null, available: false },
    services_degraded: { value: null, available: false },
  },
  feed: [
    { id: 'u1', type: 'user_registered', title: 'Ana', at: new Date().toISOString(), href: null },
    { id: 'o1', type: 'promotion_created', title: 'Oferta X', at: new Date().toISOString(), href: null },
    { id: 's1', type: 'send', title: 'Envio Y', at: new Date().toISOString(), href: null },
  ],
};

describe('Dashboard', () => {
  it('mostra metrica real e indisponivel', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });

  it('mostra erro com retry', async () => {
    mockImpl = () => Promise.reject(new Error('falhou'));
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/falhou|nao foi possivel/i)).toBeInTheDocument());
  });

  it('nao renderiza a secao Infraestrutura e mostra o card-link pro Monitoramento', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    expect(screen.queryByText('Infraestrutura')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /monitoramento/i })).toHaveAttribute('href', '/monitoring');
  });

  it('mostra usuarios ativos como card hero', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('300')).toBeInTheDocument());
    expect(screen.getByText('300')).toHaveClass('text-4xl');
  });

  it('linka itens de usuario e promocao no feed, deixa envio sem link', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Ana/i })).toHaveAttribute('href', '/users/u1');
    expect(screen.getByRole('link', { name: /Oferta X/i })).toHaveAttribute('href', '/promotions/o1');
    expect(screen.queryByRole('link', { name: /Envio Y/i })).not.toBeInTheDocument();
    expect(screen.getByText('Envio Y')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd admin && npx vitest run src/pages/Dashboard.test.tsx`
Expected: FAIL (secao Infraestrutura ainda existe, feed sem links, sem card hero de 300 em `text-4xl`)

- [ ] **Step 3: Reescrever `Dashboard.tsx`**

```tsx
// admin/src/pages/Dashboard.tsx
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
    <section className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Dashboard</h1>
          <p className="mt-1 text-sm text-ink-secondary">Visão executiva do Aflyo.</p>
        </div>
        <div className="flex gap-1 rounded-lg border border-line bg-surface-0 p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                range === r.key ? 'bg-graphite-900 text-ink-inverse' : 'text-ink-secondary hover:bg-surface-1'
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
                  <h2 className="font-display text-sm font-bold text-ink">{section.title}</h2>
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
              className="flex items-center gap-3 rounded-xl border border-line bg-surface-0 p-4 transition-colors hover:bg-surface-1"
            >
              <Activity className="h-5 w-5 shrink-0 text-ink-secondary" aria-hidden />
              <div>
                <p className="text-sm font-semibold text-ink">Monitoramento</p>
                <p className="text-xs text-ink-secondary">Jobs, erros e saúde do banco em tempo real.</p>
              </div>
            </Link>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold text-ink">Atividade recente</h2>
            {data.feed.length === 0 ? (
              <div className="mt-3">
                <EmptyState title="Sem atividade no período" />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-line-subtle rounded-xl border border-line bg-surface-0">
                {data.feed.map((item) => {
                  const Icon = FEED_ICONS[item.type] ?? ScrollText;
                  const href = FEED_HREF[item.type]?.(item.id);
                  const content = (
                    <>
                      <Icon className="h-4 w-4 shrink-0 text-ink-tertiary" aria-hidden />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">{item.title || 'Sem título'}</p>
                        <p className="text-xs text-ink-tertiary">{FEED_TYPE_LABELS[item.type] ?? item.type}</p>
                      </div>
                      <span className="shrink-0 text-xs text-ink-tertiary">{relative(item.at)}</span>
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

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd admin && npx vitest run src/pages/Dashboard.test.tsx`
Expected: PASS (5 testes)

- [ ] **Step 5: Rodar a suíte inteira do `admin/` e o typecheck**

Run: `cd admin && npx vitest run && npx tsc --noEmit -p tsconfig.json`
Expected: todos os testes passando, typecheck sem erros.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/Dashboard.tsx admin/src/pages/Dashboard.test.tsx
git commit -m "feat(admin): Dashboard com KPIs comparativos, hero de usuarios ativos e feed clicavel"
```

---

## Verificação final

- [ ] `cd admin && npx vitest run` — suíte inteira passando.
- [ ] `cd admin && npx tsc --noEmit -p tsconfig.json` — sem erros.
- [ ] Rodar a migration num ambiente de teste/staging e conferir a query manual do Task 1 Step 3.
- [ ] Testar visualmente em `admin.aflyo.com.br/` (ou preview) após deploy: card hero de Usuários ativos, selos ▲/▼ coloridos, sparklines, ausência da seção Infraestrutura, card-link pro Monitoramento, links do feed em usuário/promoção.
