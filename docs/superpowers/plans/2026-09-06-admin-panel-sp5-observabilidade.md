# Painel Admin SP5, Observabilidade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Area de Monitoramento no painel admin: cron jobs, taxa de erro de disparo, saude do banco, logs de Edge Function e sinais de auth.

**Architecture:** Igual SP1-SP4. `admin-api` (Deno) autoriza (JWT + AAL2 + conta admin ativa + permissao) e: (a) chama RPCs `security definer` de leitura, (b) na Fase B faz proxy pra Management API do Supabase (`api.supabase.com`) com um PAT (`SUPABASE_MGMT_TOKEN`). Front (`admin/`) so consome `admin-api`. So leitura, com uma unica acao (re-executar cron job). Nenhuma mudanca em `src/`, nos cron jobs, nem em tabela de sistema.

**Tech Stack:** Deno + `https://deno.land/std@0.168.0/http/server.ts`. Postgres 17 (2 migrations). React 19.2 + Vite 8 + TS ~6.0 + Tailwind 3.4 + react-router-dom 7.18 + Vitest 2.1.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-09-06-admin-panel-sp5-observabilidade-design.md`. Em conflito, o spec vence.
- **Branch:** `feat/admin-sp5-observabilidade` (ja criada, de `feat/admin-sp4-integracoes`). Carrega a pilha SP1-polish + SP2 + SP3 + SP4.
- **Faseado.** Fase A (Tasks 1-7): SQL puro, entrega software funcional sozinha. Fase B (Tasks 8-11): Management API + a acao run-now + falha-de-login.
- **Toda acao da `admin-api` exige AAL2** (o `authorize` ja faz), leitura inclusive.
- **Copy de UI em pt-BR com acento. Sem travessao (em dash `-`) em lugar nenhum** (codigo, comentario, spec, plano, commit). Rodar `grep -nF -- '-' <arquivo>` (ou `python -c "print(open(f).read().count(chr(8212)))"`) antes de cada commit.
- **`admin/` nao importa de `../shared`** (build standalone). Constantes locais.
- **Numeros de migration:** Fase A `20260901030000_admin_monitoring_reads.sql`, Fase B `20260901030100_admin_monitoring_actions.sql` (depois das do SP4 `20260901020100`).
- **Permissoes (ja no catalogo `20260829130000`, grp `monitoring`, nenhuma nova):** `jobs.read`, `jobs.retry`, `errors.read`, `logs.read` (todas DEVELOPER); `system_health.read` (DEVELOPER + ANALYST).
- **Schema verificado no banco de prod (MCP, 2026-09-06):**
  - `cron.job`: `jobid bigint`, `schedule text`, `command text`, `active bool`, `jobname text` (+ nodename/nodeport/database/username). 5 jobs: `expire_subscriptions`(1), `prune_webhook_events`(2), `expire_trials`(3), `aflyo_expire_offers`(8), `aflyo_prune_old_rows`(9).
  - `cron.job_run_details`: `jobid`, `runid`, `command`, `status` (`succeeded`|`failed`|`running`), `return_message`, `start_time timestamptz`, `end_time timestamptz`.
  - `pg_stat_statements` (PG17): `query`, `calls`, `total_exec_time`, `mean_exec_time`, `rows`, `queryid`, `toplevel`, `stats_since`.
  - `pg_stat_user_tables`: `schemaname`, `relname`, `relid`, `n_live_tup`, `n_dead_tup`, `last_autovacuum`.
  - `pg_stat_activity`: `state` (nullable).
  - `auth.users`: `id uuid`, `email text`, `created_at`, `email_confirmed_at`, `last_sign_in_at`, `banned_until`. **`auth.audit_log_entries` esta VAZIA** (0 linhas).
  - `public.history` (do SP3): `id uuid`, `user_id uuid`, `offer_name text`, `status text` (`success`|`sent`|`partial`|`error`; em prod so `success`/`partial`), `sent_at timestamptz`, `error text` (nullable), `failed_channels text[]`, `successful_channels text[]`.
  - `public.profiles`: `id`, `email`.
  - `admin_audit_write(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb)` (do SP1, 8 args).
- **Management API (Fase B):** base `https://api.supabase.com`. `GET /v1/projects/{ref}/advisors/{security|performance}` -> `{ result: { lints: [{ name, title, level (INFO|WARN|ERROR), categories, description, detail, remediation, metadata }] } }`. Logs: `GET /v1/projects/{ref}/analytics/endpoints/logs.all?sql=<clickhouse>&iso_timestamp_start=<iso>&iso_timestamp_end=<iso>` -> `{ result: [{ ... }] }` (formato pode variar; smoke test no deploy). `ref` deriva de `SUPABASE_URL` (`https://<ref>.supabase.co`). Secret nova: `SUPABASE_MGMT_TOKEN` (PAT `sbp_...`).
- **Comandos** da raiz do worktree `D:/ofertapro-admin-sp1`. Testes admin: `npm --prefix admin test` (ou `npx --prefix admin vitest run <path>`). Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`. Deno: `deno test --allow-env supabase/functions/admin-api/` e `deno check supabase/functions/admin-api/index.ts`.
- **Docker indisponivel:** `.test.sql` verificado por inspecao (padrao SP1-SP4). As queries das RPCs desta feature JA foram rodadas contra prod via MCP e retornaram dados; o `.test.sql` so confirma shape.
- **Commits:** um por task, pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260901030000_admin_monitoring_reads.sql` | 5 funcoes `stable security definer` de leitura. |
| `supabase/tests/manual/20260901030000_admin_monitoring_reads.test.sql` | Asserts de shape das 5. |
| `supabase/migrations/20260901030100_admin_monitoring_actions.sql` | `admin_cron_run_now` + grants. |
| `supabase/tests/manual/20260901030100_admin_monitoring_actions.test.sql` | Assert: run-now de jobid inexistente da hint. |
| `supabase/functions/admin-api/handlers/monitoring.ts` | Helpers puros + handlers de leitura (Fase A) e proxy Management API + run-now (Fase B). |
| `supabase/functions/admin-api/handlers/monitoring_test.ts` | Testa os helpers puros. |
| `supabase/functions/admin-api/_shared/supabase-mgmt.ts` | `mgmtConfigured()`, `mgmtFetch(path)`, `projectRef()` (Fase B). |
| `admin/src/pages/monitoring/MonitoringArea.tsx` | Shell com 5 abas via `?tab=`. |
| `admin/src/pages/monitoring/JobsTab.tsx` + `.test.tsx` | Cron jobs + runs; Fase B: rodar agora. |
| `admin/src/pages/monitoring/ErrorsTab.tsx` + `.test.tsx` | Totais + grafico + top canais + recentes. |
| `admin/src/pages/monitoring/DbHealthTab.tsx` + `.test.tsx` | Queries lentas + tabelas + conexoes; Fase B: advisors. |
| `admin/src/pages/monitoring/AuthTab.tsx` + `.test.tsx` | Totais + signups + recentes; Fase B: falha de login. |
| `admin/src/pages/monitoring/LogsTab.tsx` + `.test.tsx` | Fase B: logs de Edge/Auth/Postgres. |
| `admin/src/components/ui/MiniBars.tsx` | Grafico de barras por dia, SVG inline, sem lib. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/admin-api/index.ts` | `import * as monitoring` + bloco `monitoring:` no `HANDLERS` (5 actions Fase A, +3 Fase B). |
| `supabase/functions/admin-api/handlers/_pg-errors.ts` | (Fase B) `JOB_NOT_FOUND` (not_found) no `BY_HINT`. |
| `admin/src/nav.ts` | Secao "Monitoramento": item unico `{ label: 'Monitoramento', to: '/monitoring', permission: 'system_health.read', icon: Activity }`. Remove "Jobs e filas" e "Erros e logs". |
| `admin/src/App.tsx` | +imports; rota `/monitoring` sob `RequirePermission permission="system_health.read"`. |
| `admin/src/lib/permission-labels.ts` | Conferir rotulos pt-BR de `jobs.read`/`jobs.retry`/`errors.read`/`logs.read`/`system_health.read`; traduzir os crus (Task 3). |

---

## Task 1: Migracao de leitura `20260901030000_admin_monitoring_reads.sql`

**Files:**
- Create: `supabase/migrations/20260901030000_admin_monitoring_reads.sql`
- Create: `supabase/tests/manual/20260901030000_admin_monitoring_reads.test.sql`

**Interfaces:**
- Consumes: `cron.job`, `cron.job_run_details`, `pg_stat_statements`, `pg_stat_user_tables`, `pg_stat_activity`, `auth.users`, `public.history`, `public.profiles`.
- Produces:
  - `admin_cron_jobs() returns jsonb` -> `{ items: [{ jobid, jobname, schedule, active, last_status, last_return_message, last_start, last_end, last_duration_ms, runs_24h, fails_24h }] }`
  - `admin_cron_runs(p_job text, p_page int, p_page_size int) returns jsonb` -> `{ items: [{ runid, status, return_message, start_time, end_time, duration_ms }], page, pageSize, total }`
  - `admin_dispatch_errors(p_from text, p_to text) returns jsonb` -> `{ totals: { sends, success, partial, error, error_rate }, by_day: [{ day, sends, bad }], top_channels: [{ channel, fails }], recent: [{ id, sent_at, offer_name, user_email, status, failed_channels, error }] }`
  - `admin_db_health() returns jsonb` -> `{ slow_by_mean: [...], slow_by_total: [...], tables: [...], connections: [{ state, count }], db_size, stats_since }`
  - `admin_auth_overview(p_from text, p_to text) returns jsonb` -> `{ totals: { users, confirmed, unconfirmed, banned }, signups_by_day: [{ day, n }], recent_signups: [{ id, email, created_at, confirmed, last_sign_in_at }] }`

- [ ] **Step 1: Escrever `supabase/tests/manual/20260901030000_admin_monitoring_reads.test.sql`**

```sql
do $$
declare v jsonb;
begin
  v := public.admin_cron_jobs();
  assert v ? 'items', 'cron_jobs precisa de items';
  assert jsonb_array_length(v->'items') >= 1, 'esperado >= 1 cron job';

  v := public.admin_cron_runs('expire_trials', 1, 5);
  assert v ? 'items' and v ? 'total', 'cron_runs precisa de items/total';

  v := public.admin_dispatch_errors(null, null);
  assert v ? 'totals' and v ? 'by_day' and v ? 'top_channels' and v ? 'recent', 'dispatch_errors incompleto';

  v := public.admin_db_health();
  assert v ? 'slow_by_mean' and v ? 'tables' and v ? 'connections' and v ? 'db_size', 'db_health incompleto';

  v := public.admin_auth_overview(null, null);
  assert v ? 'totals' and v ? 'signups_by_day', 'auth_overview incompleto';
  assert (v->'totals'->>'users')::int >= 1, 'esperado >= 1 usuario';

  raise notice 'PASS admin_monitoring_reads';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha** (Docker indisponivel: pular, verificar por inspecao)

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901030000_admin_monitoring_reads.test.sql`
Expected: `function public.admin_cron_jobs() does not exist`.

- [ ] **Step 3: Escrever `supabase/migrations/20260901030000_admin_monitoring_reads.sql`**

```sql
-- SP5 Fase A: funcoes de leitura da area de Monitoramento. So SELECT.
-- Owner = role da migration (opera cron.* como as migrations anteriores).

create or replace function public.admin_cron_jobs()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'jobid', j.jobid, 'jobname', j.jobname, 'schedule', j.schedule, 'active', j.active,
      'last_status', r.status, 'last_return_message', r.return_message,
      'last_start', r.start_time, 'last_end', r.end_time,
      'last_duration_ms', case when r.end_time is not null and r.start_time is not null
        then round(extract(epoch from (r.end_time - r.start_time)) * 1000) else null end,
      'runs_24h', coalesce(c.runs, 0), 'fails_24h', coalesce(c.fails, 0)
    ) order by j.jobid)
    from cron.job j
    left join lateral (
      select * from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1
    ) r on true
    left join lateral (
      select count(*) runs, count(*) filter (where d.status = 'failed') fails
      from cron.job_run_details d where d.jobid = j.jobid and d.start_time > now() - interval '24 hours'
    ) c on true
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_cron_runs(p_job text, p_page int, p_page_size int)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_jobid bigint; v_total bigint; v_items jsonb;
begin
  select jobid into v_jobid from cron.job where jobname = p_job;
  if v_jobid is null then
    return jsonb_build_object('items', '[]'::jsonb, 'page', greatest(1, coalesce(p_page,1)), 'pageSize', v_size, 'total', 0);
  end if;
  select count(*) into v_total from cron.job_run_details where jobid = v_jobid;
  select coalesce(jsonb_agg(x order by x->>'start_time' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'runid', d.runid, 'status', d.status, 'return_message', d.return_message,
      'start_time', d.start_time, 'end_time', d.end_time,
      'duration_ms', case when d.end_time is not null and d.start_time is not null
        then round(extract(epoch from (d.end_time - d.start_time)) * 1000) else null end
    ) as x
    from cron.job_run_details d where d.jobid = v_jobid
    order by d.start_time desc offset v_off limit v_size
  ) s;
  return jsonb_build_object('items', v_items, 'page', greatest(1, coalesce(p_page,1)), 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_dispatch_errors(p_from text, p_to text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := coalesce(nullif(p_from,'')::timestamptz, now() - interval '24 hours');
  v_to   timestamptz := coalesce(nullif(p_to,'')::timestamptz, now());
begin
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'sends', count(*),
        'success', count(*) filter (where status = 'success'),
        'partial', count(*) filter (where status = 'partial'),
        'error', count(*) filter (where status = 'error'),
        'error_rate', case when count(*) > 0
          then round((count(*) filter (where status in ('error','partial'))::numeric / count(*)) * 100, 1)
          else 0 end)
      from public.history where sent_at between v_from and v_to),
    'by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'sends', sends, 'bad', bad) order by d)
      from (
        select date_trunc('day', sent_at)::date d, count(*) sends,
          count(*) filter (where status in ('error','partial')) bad
        from public.history where sent_at between v_from and v_to group by 1
      ) g), '[]'::jsonb),
    'top_channels', coalesce((
      select jsonb_agg(jsonb_build_object('channel', ch, 'fails', n) order by n desc)
      from (
        select ch, count(*) n
        from public.history h, unnest(coalesce(h.failed_channels, array[]::text[])) ch
        where h.sent_at between v_from and v_to and h.status in ('error','partial')
        group by ch order by n desc limit 10
      ) g), '[]'::jsonb),
    'recent', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id::text, 'sent_at', h.sent_at, 'offer_name', h.offer_name,
        'user_email', p.email, 'status', h.status,
        'failed_channels', to_jsonb(coalesce(h.failed_channels, array[]::text[])),
        'error', h.error
      ) order by h.sent_at desc)
      from (
        select * from public.history
        where sent_at between v_from and v_to and status in ('error','partial')
        order by sent_at desc limit 50
      ) h left join public.profiles p on p.id = h.user_id), '[]'::jsonb)
  );
end; $$;

create or replace function public.admin_db_health()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'slow_by_mean', coalesce((
      select jsonb_agg(jsonb_build_object(
        'query', left(query, 200), 'calls', calls,
        'mean_ms', round(mean_exec_time::numeric, 1), 'total_ms', round(total_exec_time::numeric, 0))
        order by mean_exec_time desc)
      from (
        select query, calls, mean_exec_time, total_exec_time from pg_stat_statements
        where query not ilike '%pg_stat_statements%' and query not ilike '%cron.job%'
        order by mean_exec_time desc limit 10
      ) g), '[]'::jsonb),
    'slow_by_total', coalesce((
      select jsonb_agg(jsonb_build_object(
        'query', left(query, 200), 'calls', calls,
        'mean_ms', round(mean_exec_time::numeric, 1), 'total_ms', round(total_exec_time::numeric, 0))
        order by total_exec_time desc)
      from (
        select query, calls, mean_exec_time, total_exec_time from pg_stat_statements
        where query not ilike '%pg_stat_statements%' and query not ilike '%cron.job%'
        order by total_exec_time desc limit 10
      ) g), '[]'::jsonb),
    'tables', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', relname, 'total_bytes', pg_total_relation_size(relid),
        'total_pretty', pg_size_pretty(pg_total_relation_size(relid)),
        'live_tup', n_live_tup, 'dead_tup', n_dead_tup, 'last_autovacuum', last_autovacuum)
        order by pg_total_relation_size(relid) desc)
      from (
        select relname, relid, n_live_tup, n_dead_tup, last_autovacuum
        from pg_stat_user_tables where schemaname = 'public'
        order by pg_total_relation_size(relid) desc limit 15
      ) g), '[]'::jsonb),
    'connections', coalesce((
      select jsonb_agg(jsonb_build_object('state', coalesce(state, 'background'), 'count', c) order by c desc)
      from (select state, count(*) c from pg_stat_activity group by state) g), '[]'::jsonb),
    'db_size', pg_size_pretty(pg_database_size(current_database())),
    'stats_since', (select min(stats_since) from pg_stat_statements)
  );
end; $$;

create or replace function public.admin_auth_overview(p_from text, p_to text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_from timestamptz := coalesce(nullif(p_from,'')::timestamptz, now() - interval '30 days');
  v_to   timestamptz := coalesce(nullif(p_to,'')::timestamptz, now());
begin
  return jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'users', count(*),
        'confirmed', count(*) filter (where email_confirmed_at is not null),
        'unconfirmed', count(*) filter (where email_confirmed_at is null),
        'banned', count(*) filter (where banned_until is not null and banned_until > now()))
      from auth.users),
    'signups_by_day', coalesce((
      select jsonb_agg(jsonb_build_object('day', d, 'n', n) order by d)
      from (
        select date_trunc('day', created_at)::date d, count(*) n
        from auth.users where created_at between v_from and v_to group by 1
      ) g), '[]'::jsonb),
    'recent_signups', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id::text, 'email', email, 'created_at', created_at,
        'confirmed', email_confirmed_at is not null, 'last_sign_in_at', last_sign_in_at)
        order by created_at desc)
      from (select id, email, created_at, email_confirmed_at, last_sign_in_at
            from auth.users order by created_at desc limit 20) g), '[]'::jsonb)
  );
end; $$;

revoke execute on function public.admin_cron_jobs() from authenticated, anon;
revoke execute on function public.admin_cron_runs(text, int, int) from authenticated, anon;
revoke execute on function public.admin_dispatch_errors(text, text) from authenticated, anon;
revoke execute on function public.admin_db_health() from authenticated, anon;
revoke execute on function public.admin_auth_overview(text, text) from authenticated, anon;
grant execute on function public.admin_cron_jobs() to service_role;
grant execute on function public.admin_cron_runs(text, int, int) to service_role;
grant execute on function public.admin_dispatch_errors(text, text) to service_role;
grant execute on function public.admin_db_health() to service_role;
grant execute on function public.admin_auth_overview(text, text) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa** (ou por inspecao: as 5 queries ja rodaram contra prod via MCP e retornaram dados; conferir que os nomes de coluna batem com as Global Constraints e que `030000` roda depois de `20260901020100`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901030000_admin_monitoring_reads.sql supabase/tests/manual/20260901030000_admin_monitoring_reads.test.sql
git commit -m "feat(admin): migration do SP5 Fase A (5 funcoes de leitura de Monitoramento)

Docker indisponivel: test.sql por inspecao; as 5 queries rodaram contra prod
via MCP e retornaram dados.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `admin-api` helpers + leitura (Fase A)

**Files:**
- Create: `supabase/functions/admin-api/handlers/monitoring.ts`
- Create: `supabase/functions/admin-api/handlers/monitoring_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`, `RbacError` de `rbac.ts`.
- Produces:
  - `reqStr(params, key): string` -> `RbacError('validation', ...)` se ausente.
  - `cronJobs`, `cronRuns`, `dispatchErrors`, `dbHealth`, `authOverview` (Handlers).

- [ ] **Step 1: Escrever `handlers/monitoring_test.ts`**

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqStr } from './monitoring.ts';

Deno.test('reqStr devolve o valor', () => {
  assertEquals(reqStr({ job: ' expire_trials ' }, 'job'), 'expire_trials');
});
Deno.test('reqStr ausente lanca', () => {
  assertThrows(() => reqStr({}, 'job'));
  assertThrows(() => reqStr({ job: '' }, 'job'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/monitoring_test.ts`
Expected: FAIL, `./monitoring.ts` nao encontrado.

- [ ] **Step 3: Escrever `handlers/monitoring.ts`** (Fase A)

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqStr(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

export const cronJobs: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cron_jobs', {});
  if (error) throw new Error(error.message);
  return data;
};

export const cronRuns: Handler = async (params) => {
  const job = reqStr(params, 'job');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cron_runs', {
    p_job: job, p_page: num(params.page, 1), p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const dispatchErrors: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_dispatch_errors', {
    p_from: str(params.from), p_to: str(params.to),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const dbHealth: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_db_health', {});
  if (error) throw new Error(error.message);
  return data;
};

export const authOverview: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_auth_overview', {
    p_from: str(params.from), p_to: str(params.to),
  });
  if (error) throw new Error(error.message);
  return data;
};
```

- [ ] **Step 4: Registrar no `index.ts`**

`import * as monitoring from './handlers/monitoring.ts';` junto aos outros. No `HANDLERS`, depois de `webhooks`:

```ts
  monitoring: {
    'cron-jobs':       { permission: 'jobs.read',          handler: monitoring.cronJobs },
    'cron-runs':       { permission: 'jobs.read',          handler: monitoring.cronRuns },
    'dispatch-errors': { permission: 'errors.read',        handler: monitoring.dispatchErrors },
    'db-health':       { permission: 'system_health.read', handler: monitoring.dbHealth },
    'auth-overview':   { permission: 'system_health.read', handler: monitoring.authOverview },
  },
```

- [ ] **Step 5: Rodar testes + tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (34 testes: 32 do SP4 + 2 de `reqStr`), sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-api/handlers/monitoring.ts supabase/functions/admin-api/handlers/monitoring_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): leitura de Monitoramento (cron, dispatch errors, db health, auth)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Rotas + nav + shell + stubs + MiniBars

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/lib/permission-labels.ts` (so se algum rotulo estiver cru)
- Create: `admin/src/components/ui/MiniBars.tsx`
- Create: `admin/src/pages/monitoring/MonitoringArea.tsx`
- Create: `admin/src/pages/monitoring/{JobsTab,ErrorsTab,DbHealthTab,AuthTab,LogsTab}.tsx` (stubs)

**Interfaces:**
- Produces: rota `/monitoring` (MonitoringArea, 5 abas via `?tab=`) sob `RequirePermission permission="system_health.read"`. Menu "Monitoramento" com item unico. `MiniBars` reutilizavel.

- [ ] **Step 1: `admin/src/nav.ts`**

Na secao `title: 'Monitoramento'`, trocar `items` por:
```ts
    items: [
      { label: 'Monitoramento', to: '/monitoring', permission: 'system_health.read', icon: Activity },
    ],
```
(`Activity` ja importado.)

- [ ] **Step 2: `admin/src/lib/permission-labels.ts`**

Conferir que existem rotulos pt-BR pra `jobs.read`, `jobs.retry`, `errors.read`, `logs.read`, `system_health.read`. Se algum estiver igual a chave (cru), trocar por: `'Ver jobs'`, `'Re-executar job'`, `'Ver erros'`, `'Ver logs'`, `'Ver saude do sistema'`. Ajustar `permission-labels.test.ts` se ele fixa a lista.

- [ ] **Step 3: `MiniBars.tsx`**

```tsx
type Bar = { label: string; value: number; alt?: number };

export function MiniBars({ bars, height = 64 }: { bars: Bar[]; height?: number }) {
  if (bars.length === 0) return <p className="text-xs text-ink-secondary">Sem dados no periodo.</p>;
  const max = Math.max(1, ...bars.map((b) => b.value));
  const w = 100 / bars.length;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {bars.map((b, i) => {
        const h = (b.value / max) * (height - 14);
        const ah = b.alt ? (b.alt / max) * (height - 14) : 0;
        return (
          <g key={b.label}>
            <rect x={i * w + w * 0.15} y={height - 12 - h} width={w * 0.7} height={h}
              className="fill-ink/70" />
            {b.alt ? (
              <rect x={i * w + w * 0.15} y={height - 12 - ah} width={w * 0.7} height={ah}
                className="fill-danger-ink" />
            ) : null}
            <title>{b.label}: {b.value}{b.alt != null ? ` (${b.alt} com falha)` : ''}</title>
          </g>
        );
      })}
    </svg>
  );
}
```

- [ ] **Step 4: `MonitoringArea.tsx`**

```tsx
import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import JobsTab from './JobsTab';
import ErrorsTab from './ErrorsTab';
import DbHealthTab from './DbHealthTab';
import AuthTab from './AuthTab';
import LogsTab from './LogsTab';

const TABS = [
  { key: 'jobs', label: 'Jobs', perm: 'jobs.read' },
  { key: 'erros', label: 'Erros', perm: 'errors.read' },
  { key: 'saude', label: 'Saúde do banco', perm: 'system_health.read' },
  { key: 'logs', label: 'Logs', perm: 'logs.read' },
  { key: 'auth', label: 'Auth', perm: 'system_health.read' },
] as const;

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

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}
```

- [ ] **Step 5: Stubs** (cada um substituido nas Tasks 4-7 e 10)

`JobsTab.tsx` / `ErrorsTab.tsx` / `DbHealthTab.tsx` / `AuthTab.tsx` / `LogsTab.tsx`:
```tsx
// Placeholder da Task 3. Tela real na Task 4/5/6/7/10.
export default function JobsTab() {
  return <p className="text-sm text-ink-secondary">Jobs</p>;
}
```
(trocar nome/texto por arquivo)

- [ ] **Step 6: `admin/src/App.tsx`**

Import `import MonitoringArea from './pages/monitoring/MonitoringArea';`. Rota (antes de `path="*"`):
```tsx
          <Route path="/monitoring" element={<RequirePermission permission="system_health.read"><MonitoringArea /></RequirePermission>} />
```

- [ ] **Step 7: Rodar testes + build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: 66 testes passam (nada novo quebra), build OK.

- [ ] **Step 8: Commit**

```bash
git add admin/src/nav.ts admin/src/App.tsx admin/src/lib/permission-labels.ts admin/src/components/ui/MiniBars.tsx admin/src/pages/monitoring/
git commit -m "feat(admin): rota /monitoring com 5 abas + MiniBars + menu Monitoramento

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `JobsTab` (leitura)

**Files:**
- Modify: `admin/src/pages/monitoring/JobsTab.tsx`
- Create: `admin/src/pages/monitoring/JobsTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `DataTable`/`Column`, `Badge`, `Skeleton`.

**Shapes:**
- `monitoring/cron-jobs` -> `{ items: Array<{ jobid, jobname, schedule, active, last_status, last_return_message, last_start, last_end, last_duration_ms, runs_24h, fails_24h }> }`
- `monitoring/cron-runs` -> `{ items: Array<{ runid, status, return_message, start_time, end_time, duration_ms }>, page, pageSize, total }`

- [ ] **Step 1: `JobsTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][],
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'cron-jobs') return Promise.resolve({ items: [
      { jobid: 3, jobname: 'expire_trials', schedule: '0 * * * *', active: true,
        last_status: 'succeeded', last_return_message: 'UPDATE 0', last_start: '2026-09-06T13:00:00Z',
        last_end: '2026-09-06T13:00:00Z', last_duration_ms: 118, runs_24h: 24, fails_24h: 0 },
    ] });
    if (action === 'cron-runs') return Promise.resolve({
      items: [{ runid: 1, status: 'succeeded', return_message: 'UPDATE 0', start_time: '2026-09-06T13:00:00Z', end_time: '2026-09-06T13:00:00Z', duration_ms: 118 }],
      page: 1, pageSize: 25, total: 1 });
    return Promise.resolve({});
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['jobs.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import JobsTab from './JobsTab';

it('lista os cron jobs e expande o historico', async () => {
  render(<MemoryRouter><JobsTab /></MemoryRouter>);
  await screen.findByText('expire_trials');
  expect(screen.getByText('succeeded')).toBeInTheDocument();
  await userEvent.click(screen.getByText('expire_trials'));
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('monitoring');
    expect(last[1]).toBe('cron-runs');
    expect((last[2] as { job?: string }).job).toBe('expire_trials');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/monitoring/JobsTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `JobsTab.tsx`**

```tsx
import { useState } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Job = {
  jobid: number; jobname: string; schedule: string; active: boolean;
  last_status: string | null; last_return_message: string | null;
  last_start: string | null; last_end: string | null; last_duration_ms: number | null;
  runs_24h: number; fails_24h: number;
};
type Run = { runid: number; status: string; return_message: string | null; start_time: string; end_time: string | null; duration_ms: number | null };

const TONE: Record<string, 'success' | 'danger' | 'warning' | 'neutral'> = {
  succeeded: 'success', failed: 'danger', running: 'warning',
};
function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

function JobRow({ job }: { job: Job }) {
  const [open, setOpen] = useState(false);
  const runs = useAsync(
    () => (open ? callAdminApi<{ items: Run[] }>('monitoring', 'cron-runs', { job: job.jobname, page: 1, pageSize: 20 }) : Promise.resolve(null)),
    [open, job.jobname],
  );
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full flex-wrap items-center justify-between gap-2 text-left">
        <span className="font-display text-sm font-bold text-ink">{job.jobname}</span>
        <span className="font-mono text-xs text-ink-secondary">{job.schedule}</span>
        <Badge tone={TONE[job.last_status ?? ''] ?? 'neutral'}>{job.last_status ?? 'sem execucao'}</Badge>
        <span className="text-xs text-ink-secondary">
          {fmt(job.last_start)} {job.last_duration_ms != null ? `- ${job.last_duration_ms}ms` : ''}
        </span>
        {job.fails_24h > 0 && <Badge tone="danger">{job.fails_24h} falha(s) 24h</Badge>}
      </button>
      {job.last_return_message && <p className="mt-1 font-mono text-[11px] text-ink-secondary">{job.last_return_message}</p>}
      {open && (
        <div className="mt-3 border-t border-line pt-3">
          {runs.loading && <Skeleton className="h-24 w-full" />}
          {runs.data && (
            <table className="w-full text-left text-xs">
              <thead className="text-ink-secondary">
                <tr><th className="py-1">Quando</th><th>Status</th><th>Duracao</th><th>Mensagem</th></tr>
              </thead>
              <tbody>
                {runs.data.items.map((r) => (
                  <tr key={r.runid} className="border-t border-line-subtle">
                    <td className="py-1">{fmt(r.start_time)}</td>
                    <td><Badge tone={TONE[r.status] ?? 'neutral'}>{r.status}</Badge></td>
                    <td>{r.duration_ms != null ? `${r.duration_ms}ms` : '-'}</td>
                    <td className="font-mono">{r.return_message ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export default function JobsTab() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Job[] }>('monitoring', 'cron-jobs', {}),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-3">
      {data.items.map((j) => <JobRow key={j.jobid} job={j} />)}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/monitoring/JobsTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/monitoring/JobsTab.tsx admin/src/pages/monitoring/JobsTab.test.tsx
git commit -m "feat(admin): aba Jobs (cron jobs + historico de execucao)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `ErrorsTab` (leitura)

**Files:**
- Modify: `admin/src/pages/monitoring/ErrorsTab.tsx`
- Create: `admin/src/pages/monitoring/ErrorsTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `MiniBars`, `Badge`, `Skeleton`, `ErrorState`.

**Shape de `monitoring/dispatch-errors`:** `{ totals: { sends, success, partial, error, error_rate }, by_day: Array<{ day, sends, bad }>, top_channels: Array<{ channel, fails }>, recent: Array<{ id, sent_at, offer_name, user_email, status, failed_channels, error }> }`.

- [ ] **Step 1: `ErrorsTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][],
  impl: (): Promise<unknown> => Promise.resolve({
    totals: { sends: 155, success: 86, partial: 69, error: 0, error_rate: 44.5 },
    by_day: [{ day: '2026-09-03', sends: 155, bad: 69 }],
    top_channels: [{ channel: 'Best Promos #1', fails: 53 }],
    recent: [{ id: 'h1', sent_at: '2026-09-03T21:00:00Z', offer_name: 'Fone TWS', user_email: 'c@x.com', status: 'partial', failed_channels: ['Best Promos #1'], error: null }],
  }) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(); },
  AdminApiError: class extends Error {},
}));

import ErrorsTab from './ErrorsTab';

it('mostra totais, top canais e recentes; troca de periodo re-chama a API', async () => {
  render(<MemoryRouter><ErrorsTab /></MemoryRouter>);
  await screen.findByText('Fone TWS');
  expect(screen.getByText('Best Promos #1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /7 dias/i }));
  await waitFor(() => expect(h.calls.length).toBeGreaterThan(1));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/monitoring/ErrorsTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `ErrorsTab.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { MiniBars } from '../../components/ui/MiniBars';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Payload = {
  totals: { sends: number; success: number; partial: number; error: number; error_rate: number };
  by_day: Array<{ day: string; sends: number; bad: number }>;
  top_channels: Array<{ channel: string; fails: number }>;
  recent: Array<{ id: string; sent_at: string; offer_name: string; user_email: string | null; status: string; failed_channels: string[]; error: string | null }>;
};

const RANGES = [
  { key: '24h', label: '24 horas', hours: 24 },
  { key: '7d', label: '7 dias', hours: 24 * 7 },
  { key: '30d', label: '30 dias', hours: 24 * 30 },
] as const;

export default function ErrorsTab() {
  const [range, setRange] = useState<(typeof RANGES)[number]['key']>('24h');
  const from = useMemo(() => {
    const r = RANGES.find((x) => x.key === range)!;
    return new Date(Date.now() - r.hours * 3600_000).toISOString();
  }, [range]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'dispatch-errors', { from, to: new Date().toISOString() }),
    [from],
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button key={r.key} type="button" onClick={() => setRange(r.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              range === r.key ? 'border-ink bg-ink text-surface-0' : 'border-line bg-surface-0 text-ink-secondary'
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && <Skeleton className="h-40 w-full" />}
      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Disparos" value={data.totals.sends} />
            <Stat label="Parciais" value={data.totals.partial} />
            <Stat label="Com erro" value={data.totals.error} />
            <Stat label="Taxa de falha" value={`${data.totals.error_rate}%`} />
          </div>

          <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Por dia</h3>
            <div className="mt-3">
              <MiniBars bars={data.by_day.map((d) => ({ label: d.day, value: d.sends, alt: d.bad }))} />
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Canais que mais falharam</h3>
            {data.top_channels.length === 0 ? (
              <p className="mt-2 text-xs text-ink-secondary">Nenhum.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm text-ink">
                {data.top_channels.map((c) => (
                  <li key={c.channel} className="flex justify-between">
                    <span>{c.channel}</span><span className="text-ink-secondary">{c.fails}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
            <h3 className="font-display text-sm font-bold text-ink">Ultimos com falha</h3>
            {data.recent.length === 0 ? (
              <p className="mt-2 text-xs text-ink-secondary">Nada no periodo.</p>
            ) : (
              <ul className="mt-2 space-y-2 text-sm">
                {data.recent.map((r) => (
                  <li key={r.id} className="border-b border-line-subtle pb-2 last:border-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-ink">{r.offer_name}</span>
                      <Badge tone={r.status === 'error' ? 'danger' : 'warning'}>{r.status}</Badge>
                      <span className="text-xs text-ink-secondary">{r.user_email ?? '-'}</span>
                      <span className="text-xs text-ink-tertiary">{new Date(r.sent_at).toLocaleString('pt-BR')}</span>
                    </div>
                    {r.error && <p className="mt-1 text-[11px] text-danger-ink">{r.error}</p>}
                    {r.failed_channels.length > 0 && (
                      <p className="mt-0.5 text-[11px] text-ink-secondary">Falharam: {r.failed_channels.join(', ')}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/monitoring/ErrorsTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/monitoring/ErrorsTab.tsx admin/src/pages/monitoring/ErrorsTab.test.tsx
git commit -m "feat(admin): aba Erros (totais + grafico por dia + top canais + recentes)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `DbHealthTab` (leitura, Fase A)

**Files:**
- Modify: `admin/src/pages/monitoring/DbHealthTab.tsx`
- Create: `admin/src/pages/monitoring/DbHealthTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `Skeleton`, `ErrorState`.

**Shape de `monitoring/db-health`:** `{ slow_by_mean: Array<{ query, calls, mean_ms, total_ms }>, slow_by_total: [...], tables: Array<{ name, total_pretty, live_tup, dead_tup, last_autovacuum }>, connections: Array<{ state, count }>, db_size: string, stats_since: string }`.

- [ ] **Step 1: `DbHealthTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (): Promise<unknown> => Promise.resolve({
    slow_by_mean: [{ query: 'SELECT name FROM pg_timezone_names', calls: 395, mean_ms: 900.3, total_ms: 355605 }],
    slow_by_total: [{ query: 'SELECT name FROM pg_timezone_names', calls: 395, mean_ms: 900.3, total_ms: 355605 }],
    tables: [{ name: 'offers', total_pretty: '1480 kB', live_tup: 1, dead_tup: 27, last_autovacuum: null }],
    connections: [{ state: 'idle', count: 13 }, { state: 'active', count: 2 }],
    db_size: '31 MB', stats_since: '2026-09-01T00:00:00Z',
  }),
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: () => h.impl(),
  AdminApiError: class extends Error {},
}));

import DbHealthTab from './DbHealthTab';

it('mostra queries lentas, tabelas e conexoes', async () => {
  render(<MemoryRouter><DbHealthTab /></MemoryRouter>);
  expect(await screen.findByText(/pg_timezone_names/)).toBeInTheDocument();
  expect(screen.getByText('offers')).toBeInTheDocument();
  expect(screen.getByText('31 MB')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/monitoring/DbHealthTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `DbHealthTab.tsx`**

```tsx
import type { ReactNode } from 'react';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Slow = { query: string; calls: number; mean_ms: number; total_ms: number };
type Payload = {
  slow_by_mean: Slow[]; slow_by_total: Slow[];
  tables: Array<{ name: string; total_pretty: string; live_tup: number; dead_tup: number; last_autovacuum: string | null }>;
  connections: Array<{ state: string; count: number }>;
  db_size: string; stats_since: string | null;
};

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-ink-secondary">{hint}</p>}
      <div className="mt-3 overflow-x-auto">{children}</div>
    </div>
  );
}
function SlowTable({ rows }: { rows: Slow[] }) {
  return (
    <table className="w-full text-left text-xs">
      <thead className="text-ink-secondary"><tr><th className="py-1">Query</th><th>Calls</th><th>Media</th><th>Total</th></tr></thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-t border-line-subtle align-top">
            <td className="py-1 font-mono">{r.query}</td>
            <td>{r.calls}</td><td>{r.mean_ms}ms</td><td>{Math.round(r.total_ms)}ms</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DbHealthTab() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'db-health', {}),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-secondary">
        Tamanho do banco: <span className="font-semibold text-ink">{data.db_size}</span>
        {data.stats_since ? ` - stats desde ${new Date(data.stats_since).toLocaleString('pt-BR')}` : ''}
      </p>
      <Card title="Queries mais lentas (media)" hint="pg_stat_statements, desde o ultimo reset">
        <SlowTable rows={data.slow_by_mean} />
      </Card>
      <Card title="Queries que mais consomem (total)">
        <SlowTable rows={data.slow_by_total} />
      </Card>
      <Card title="Maiores tabelas">
        <table className="w-full text-left text-xs">
          <thead className="text-ink-secondary"><tr><th className="py-1">Tabela</th><th>Tamanho</th><th>Linhas</th><th>Dead</th><th>Autovacuum</th></tr></thead>
          <tbody>
            {data.tables.map((t) => (
              <tr key={t.name} className="border-t border-line-subtle">
                <td className="py-1">{t.name}</td><td>{t.total_pretty}</td><td>{t.live_tup}</td>
                <td className={t.dead_tup > 1000 ? 'text-danger-ink' : ''}>{t.dead_tup}</td>
                <td>{t.last_autovacuum ? new Date(t.last_autovacuum).toLocaleDateString('pt-BR') : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Conexoes">
        <ul className="text-sm text-ink">
          {data.connections.map((c) => (
            <li key={c.state} className="flex justify-between"><span>{c.state}</span><span className="text-ink-secondary">{c.count}</span></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/monitoring/DbHealthTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/monitoring/DbHealthTab.tsx admin/src/pages/monitoring/DbHealthTab.test.tsx
git commit -m "feat(admin): aba Saude do banco (queries lentas + tabelas + conexoes)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `AuthTab` (leitura, Fase A) + verificacao da Fase A

**Files:**
- Modify: `admin/src/pages/monitoring/AuthTab.tsx`
- Create: `admin/src/pages/monitoring/AuthTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `MiniBars`, `Badge`, `Skeleton`, `ErrorState`.

**Shape de `monitoring/auth-overview`:** `{ totals: { users, confirmed, unconfirmed, banned }, signups_by_day: Array<{ day, n }>, recent_signups: Array<{ id, email, created_at, confirmed, last_sign_in_at }> }`.

- [ ] **Step 1: `AuthTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (): Promise<unknown> => Promise.resolve({
    totals: { users: 6, confirmed: 5, unconfirmed: 1, banned: 0 },
    signups_by_day: [{ day: '2026-09-01', n: 2 }],
    recent_signups: [{ id: 'u1', email: 'novo@x.com', created_at: '2026-09-01T10:00:00Z', confirmed: true, last_sign_in_at: '2026-09-05T10:00:00Z' }],
  }),
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: () => h.impl(), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['system_health.read'] } }) }));

import AuthTab from './AuthTab';

it('mostra totais e ultimos cadastros', async () => {
  render(<MemoryRouter><AuthTab /></MemoryRouter>);
  expect(await screen.findByText('novo@x.com')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/monitoring/AuthTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `AuthTab.tsx`** (Fase A; o card de falha-de-login entra na Task 10)

```tsx
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { MiniBars } from '../../components/ui/MiniBars';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Payload = {
  totals: { users: number; confirmed: number; unconfirmed: number; banned: number };
  signups_by_day: Array<{ day: string; n: number }>;
  recent_signups: Array<{ id: string; email: string; created_at: string; confirmed: boolean; last_sign_in_at: string | null }>;
};

export default function AuthTab() {
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'auth-overview', {}),
    [],
  );
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Usuarios" value={data.totals.users} />
        <Stat label="Confirmados" value={data.totals.confirmed} />
        <Stat label="Nao confirmados" value={data.totals.unconfirmed} />
        <Stat label="Banidos" value={data.totals.banned} />
      </div>
      <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
        <h3 className="font-display text-sm font-bold text-ink">Cadastros por dia (30d)</h3>
        <div className="mt-3">
          <MiniBars bars={data.signups_by_day.map((d) => ({ label: d.day, value: d.n }))} />
        </div>
      </div>
      <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
        <h3 className="font-display text-sm font-bold text-ink">Ultimos cadastros</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {data.recent_signups.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-2 border-b border-line-subtle pb-1 last:border-0">
              <span className="text-ink">{u.email}</span>
              {u.confirmed ? <Badge tone="success">confirmado</Badge> : <Badge tone="warning">pendente</Badge>}
              <span className="text-xs text-ink-tertiary">{new Date(u.created_at).toLocaleDateString('pt-BR')}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/monitoring/AuthTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Verificacao da Fase A inteira**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: vitest ~71 passam, deno 34 passam, build + lint + check OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/monitoring/AuthTab.tsx admin/src/pages/monitoring/AuthTab.test.tsx
git commit -m "feat(admin): aba Auth (totais + cadastros por dia + ultimos)

Fecha a Fase A do SP5: /monitoring com Jobs, Erros, Saude do banco, Auth em leitura.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Migracao de acao `20260901030100_admin_monitoring_actions.sql`

**Files:**
- Create: `supabase/migrations/20260901030100_admin_monitoring_actions.sql`
- Create: `supabase/tests/manual/20260901030100_admin_monitoring_actions.test.sql`
- Modify: `supabase/functions/admin-api/handlers/_pg-errors.ts`

**Interfaces:**
- Produces:
  - `admin_cron_run_now(p_actor uuid, p_jobid bigint, p_ctx jsonb) returns jsonb` -> `{ jobid, jobname, ok, message, duration_ms }`. `hint='JOB_NOT_FOUND'` se o jobid nao existe. Nao propaga excecao do command (retorna `ok:false` + message).

- [ ] **Step 1: `supabase/tests/manual/20260901030100_admin_monitoring_actions.test.sql`**

```sql
do $$
declare v jsonb;
begin
  -- jobid inexistente
  begin
    perform public.admin_cron_run_now('00000000-0000-0000-0000-000000000000', 999999, '{}'::jsonb);
    assert false, 'deveria ter falhado (JOB_NOT_FOUND)';
  exception when others then
    assert sqlerrm ilike '%nao encontrado%' or sqlerrm ilike '%JOB_NOT_FOUND%', 'hint errado: ' || sqlerrm;
  end;

  -- job real idempotente: expire_trials (jobid 3). Nao deve lancar; retorna ok:true.
  v := public.admin_cron_run_now('00000000-0000-0000-0000-000000000000', 3, '{}'::jsonb);
  assert (v->>'ok')::boolean = true, 'run_now do expire_trials deveria dar ok';
  assert v ? 'duration_ms', 'run_now sem duration_ms';

  raise notice 'PASS admin_monitoring_actions';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha** (Docker indisponivel: inspecao).

- [ ] **Step 3: Escrever `supabase/migrations/20260901030100_admin_monitoring_actions.sql`**

```sql
-- SP5 Fase B: acao de re-executar um cron job na hora.

create or replace function public.admin_cron_run_now(
  p_actor uuid, p_jobid bigint, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_cmd text; v_ok boolean := true; v_msg text := 'ok';
  v_t0 timestamptz := clock_timestamp(); v_ms int;
begin
  select jobname, command into v_name, v_cmd from cron.job where jobid = p_jobid;
  if v_name is null then
    raise exception 'cron job nao encontrado' using errcode='P0002', hint='JOB_NOT_FOUND';
  end if;

  begin
    execute v_cmd;
  exception when others then
    v_ok := false;
    v_msg := sqlerrm;
  end;

  v_ms := round(extract(epoch from (clock_timestamp() - v_t0)) * 1000);

  perform public.admin_audit_write(p_actor, 'CRON_RAN_NOW', 'cron_job', p_jobid::text,
    null, jsonb_build_object('jobname', v_name, 'ok', v_ok, 'message', left(v_msg, 500), 'ms', v_ms),
    null, p_ctx);

  return jsonb_build_object('jobid', p_jobid, 'jobname', v_name, 'ok', v_ok, 'message', v_msg, 'duration_ms', v_ms);
end; $$;

revoke execute on function public.admin_cron_run_now(uuid, bigint, jsonb) from authenticated, anon;
grant execute on function public.admin_cron_run_now(uuid, bigint, jsonb) to service_role;
```

- [ ] **Step 4: `_pg-errors.ts`** - acrescentar ao `BY_HINT`:

```ts
  JOB_NOT_FOUND: { code: 'not_found', message: 'Cron job nao encontrado.' },
```

- [ ] **Step 5: `deno check` + inspecao da migration** (roda depois de `030000`; so `create or replace` + grants; `admin_audit_write` com 8 args).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260901030100_admin_monitoring_actions.sql supabase/tests/manual/20260901030100_admin_monitoring_actions.test.sql supabase/functions/admin-api/handlers/_pg-errors.ts
git commit -m "feat(admin): migration do SP5 Fase B (admin_cron_run_now) + hint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: `admin-api` Fase B (Management API + run-now)

**Files:**
- Create: `supabase/functions/admin-api/_shared/supabase-mgmt.ts`
- Modify: `supabase/functions/admin-api/handlers/monitoring.ts`
- Modify: `supabase/functions/admin-api/handlers/monitoring_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Produces:
  - `_shared/supabase-mgmt.ts`: `mgmtConfigured(): boolean`, `projectRef(): string`, `mgmtFetch(path: string): Promise<Response>`.
  - `groupAdvisors(lints): {...}` (helper puro, testavel).
  - Handlers `runJob` (`jobs.retry`), `advisors` (`system_health.read`), `logsQuery` (`logs.read`).

- [ ] **Step 1: Testes em `monitoring_test.ts`**

```ts
import { groupAdvisors } from './monitoring.ts';

Deno.test('groupAdvisors filtra INFO e agrupa por name', () => {
  const out = groupAdvisors([
    { name: 'a', title: 'A', level: 'INFO', categories: ['PERFORMANCE'], detail: 'x', remediation: 'u' },
    { name: 'b', title: 'B', level: 'WARN', categories: ['SECURITY'], detail: 'y1', remediation: 'u' },
    { name: 'b', title: 'B', level: 'WARN', categories: ['SECURITY'], detail: 'y2', remediation: 'u' },
    { name: 'c', title: 'C', level: 'ERROR', categories: ['SECURITY'], detail: 'z', remediation: 'u' },
  ]);
  assertEquals(out.groups.length, 2);
  const b = out.groups.find((g: { name: string }) => g.name === 'b');
  assertEquals(b.count, 2);
  assertEquals(b.examples.length, 2);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/monitoring_test.ts`
Expected: FAIL (`groupAdvisors` nao exportado).

- [ ] **Step 3: `_shared/supabase-mgmt.ts`**

```ts
const MGMT_BASE = 'https://api.supabase.com';

export function mgmtConfigured(): boolean {
  return !!Deno.env.get('SUPABASE_MGMT_TOKEN');
}

export function projectRef(): string {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const m = url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : '';
}

export async function mgmtFetch(path: string): Promise<Response> {
  return fetch(`${MGMT_BASE}${path}`, {
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_MGMT_TOKEN') ?? ''}` },
  });
}
```

- [ ] **Step 4: Acrescentar em `handlers/monitoring.ts`**

```ts
import { mgmtConfigured, mgmtFetch, projectRef } from '../_shared/supabase-mgmt.ts';

type Lint = { name: string; title: string; level: string; categories?: string[]; detail?: string; remediation?: string };

export function groupAdvisors(lints: Lint[]): { groups: Array<{ name: string; title: string; level: string; category: string; count: number; remediation: string; examples: string[] }> } {
  const byName = new Map<string, { name: string; title: string; level: string; category: string; count: number; remediation: string; examples: string[] }>();
  for (const l of lints) {
    if (l.level === 'INFO') continue;
    const g = byName.get(l.name) ?? {
      name: l.name, title: l.title, level: l.level,
      category: (l.categories ?? [])[0] ?? '', count: 0, remediation: l.remediation ?? '', examples: [],
    };
    g.count += 1;
    if (g.examples.length < 3 && l.detail) g.examples.push(l.detail);
    byName.set(l.name, g);
  }
  return { groups: [...byName.values()].sort((a, b) => b.count - a.count) };
}

function requireMgmt() {
  if (!mgmtConfigured() || !projectRef()) {
    throw new RbacError('internal', 'Management API nao configurada (SUPABASE_MGMT_TOKEN).');
  }
}

export const runJob: Handler = async (params, identity, ctx) => {
  const jobid = num(params.jobid, NaN);
  if (!Number.isFinite(jobid)) throw new RbacError('validation', 'jobid e obrigatorio.');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cron_run_now', {
    p_actor: identity.adminId, p_jobid: jobid, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const advisors: Handler = async () => {
  requireMgmt();
  const ref = projectRef();
  const out: Lint[] = [];
  for (const type of ['security', 'performance']) {
    const res = await mgmtFetch(`/v1/projects/${ref}/advisors/${type}`);
    if (!res.ok) throw new Error(`advisors/${type} -> ${res.status}`);
    const body = await res.json();
    for (const l of (body?.result?.lints ?? body?.lints ?? [])) out.push(l as Lint);
  }
  return groupAdvisors(out);
};

export const logsQuery: Handler = async (params) => {
  requireMgmt();
  const ref = projectRef();
  const source = ['function_edge_logs', 'auth', 'postgres_logs'].includes(str(params.source))
    ? str(params.source) : 'function_edge_logs';
  const hours = Math.min(24, Math.max(1, num(params.hours, 6)));
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600_000);
  const sql = `select id, timestamp, event_message from ${source} order by timestamp desc limit 100`;
  const qs = new URLSearchParams({
    sql, iso_timestamp_start: start.toISOString(), iso_timestamp_end: end.toISOString(),
  });
  const res = await mgmtFetch(`/v1/projects/${ref}/analytics/endpoints/logs.all?${qs.toString()}`);
  if (!res.ok) throw new Error(`logs.all -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const rows = (body?.result ?? body?.data ?? []) as Array<Record<string, unknown>>;
  return { source, hours, items: rows.slice(0, 100) };
};
```

- [ ] **Step 5: Registrar no `index.ts`** (acrescentar ao bloco `monitoring`)

```ts
    'run-job':  { permission: 'jobs.retry',          handler: monitoring.runJob },
    advisors:   { permission: 'system_health.read',  handler: monitoring.advisors },
    'logs':     { permission: 'logs.read',           handler: monitoring.logsQuery },
```

- [ ] **Step 6: Rodar testes + tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (35 testes: 34 + `groupAdvisors`), sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-api/_shared/supabase-mgmt.ts supabase/functions/admin-api/handlers/monitoring.ts supabase/functions/admin-api/handlers/monitoring_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): Fase B do SP5 (run-job, advisors, logs via Management API)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Front Fase B (run-now, LogsTab, advisors, falha de login)

**Files:**
- Modify: `admin/src/pages/monitoring/JobsTab.tsx` + `.test.tsx`
- Modify: `admin/src/pages/monitoring/DbHealthTab.tsx` + `.test.tsx`
- Modify: `admin/src/pages/monitoring/AuthTab.tsx` + `.test.tsx`
- Modify: `admin/src/pages/monitoring/LogsTab.tsx` + Create `LogsTab.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth`, `useToast`, `hasPermission`, `AdminApiError`.

- [ ] **Step 1: `JobsTab` - botao "rodar agora"**

Em `JobRow`, ao lado do header, com `jobs.retry`:
```tsx
{hasPermission(identity?.permissions ?? [], 'jobs.retry') && (
  <button type="button" onClick={(e) => { e.stopPropagation(); runNow(); }} disabled={busy}
    className="rounded-lg border border-line bg-ink px-2 py-1 text-[11px] font-semibold text-surface-0 disabled:opacity-50">
    {busy ? '...' : 'rodar agora'}
  </button>
)}
```
`runNow`:
```tsx
const runNow = async () => {
  setBusy(true);
  try {
    const res = await callAdminApi<{ ok: boolean; message: string; duration_ms: number }>(
      'monitoring', 'run-job', { jobid: job.jobid });
    toast(res.ok ? `OK em ${res.duration_ms}ms: ${res.message}` : `Falhou: ${res.message}`);
  } catch (e) {
    toast(e instanceof AdminApiError ? e.message : 'Falha ao rodar o job.');
  } finally { setBusy(false); }
};
```
(adicionar imports `useAdminAuth`/`useToast`/`hasPermission`/`AdminApiError` e o `const { identity } = useAdminAuth(); const toast = useToast(); const [busy,setBusy]=useState(false)` no `JobRow`.)

`JobsTab.test.tsx`: acrescentar mock `action === 'run-job'` -> `Promise.resolve({ ok: true, message: 'UPDATE 0', duration_ms: 40 })`, `useAdminAuth` mutavel `['jobs.read','jobs.retry']`, e um teste que clicar "rodar agora" nao quebra a tela.

- [ ] **Step 2: `LogsTab.tsx`**

```tsx
import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { Skeleton } from '../../components/ui/Skeleton';

const SOURCES = [
  { key: 'function_edge_logs', label: 'Edge Functions' },
  { key: 'auth', label: 'Auth' },
  { key: 'postgres_logs', label: 'Postgres' },
] as const;

type Payload = { source: string; hours: number; items: Array<Record<string, unknown>> };

export default function LogsTab() {
  const [source, setSource] = useState<string>('function_edge_logs');
  const [hours, setHours] = useState(6);
  const { data, loading, error } = useAsync(
    () => callAdminApi<Payload>('monitoring', 'logs', { source, hours }),
    [source, hours],
  );
  const notConfigured = error && /Management API/i.test(error);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s) => (
          <button key={s.key} type="button" onClick={() => setSource(s.key)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
              source === s.key ? 'border-ink bg-ink text-surface-0' : 'border-line bg-surface-0 text-ink-secondary'
            }`}>{s.label}</button>
        ))}
        <select value={hours} onChange={(e) => setHours(Number(e.target.value))}
          className="rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-xs text-ink">
          {[1, 6, 12, 24].map((h) => <option key={h} value={h}>{h}h</option>)}
        </select>
      </div>
      {notConfigured && (
        <p className="rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-xs text-warning-ink">
          Configure o secret SUPABASE_MGMT_TOKEN na admin-api pra ver logs.
        </p>
      )}
      {loading && <Skeleton className="h-40 w-full" />}
      {data && (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface-0 p-3 shadow-card">
          <table className="w-full text-left text-[11px]">
            <tbody>
              {data.items.map((row, i) => (
                <tr key={i} className="border-b border-line-subtle align-top">
                  <td className="whitespace-nowrap py-1 pr-3 font-mono text-ink-secondary">
                    {String(row.timestamp ?? '')}
                  </td>
                  <td className="py-1 font-mono text-ink">{String(row.event_message ?? JSON.stringify(row))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.items.length === 0 && <p className="text-xs text-ink-secondary">Sem linhas no periodo.</p>}
        </div>
      )}
    </div>
  );
}
```
`LogsTab.test.tsx`: mock `action === 'logs'` -> `{ source:'function_edge_logs', hours:6, items:[{ timestamp:'2026-09-06T13:00:00Z', event_message:'boot' }] }`; teste que renderiza a linha; segundo teste que, com `callAdminApi` rejeitando `new AdminApiError('internal','Management API nao configurada...')`, aparece o aviso.

- [ ] **Step 3: `DbHealthTab` - secao Advisors**

Acrescentar um `useAsync` pra `monitoring/advisors` e um `<Card title="Advisors (WARN/ERROR)">`. Se o erro casar `/Management API/i` -> aviso discreto "configure SUPABASE_MGMT_TOKEN". Senao lista `groups` com `name`/`level`/`count` + link `remediation` (`<a target="_blank" rel="noreferrer">`).
`DbHealthTab.test.tsx`: acrescentar mock `action === 'advisors'` -> `{ groups: [{ name:'auth_rls_initplan', title:'...', level:'WARN', category:'PERFORMANCE', count:3, remediation:'https://x', examples:['a'] }] }`; assert que "auth_rls_initplan" aparece.

- [ ] **Step 4: `AuthTab` - card falha de login (Fase B)**

Acrescentar `useAsync` pra `monitoring/logs` com `{ source: 'auth', hours: 24 }`, filtrar client-side linhas cujo `event_message` casa `/login|password|invalid|denied/i` e mostrar a contagem num card "Sinais de auth (24h)" + as ultimas 10. Se erro `/Management API/i` -> ocultar o card.
`AuthTab.test.tsx`: mock `action === 'logs'` -> `{ items: [{ timestamp:'...', event_message:'login failed for x' }] }`; assert que o card aparece com contagem 1. Segundo caminho: `logs` rejeita com Management API -> card nao aparece (nao quebra).

- [ ] **Step 5: Rodar os testes de monitoring + build + lint**

Run:
```bash
npx --prefix admin vitest run src/pages/monitoring/
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: PASS, build + lint OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/monitoring/
git commit -m "feat(admin): SP5 Fase B no front (rodar agora, Logs, advisors, sinais de auth)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: Verificacao final + deploy

**Files:** nenhum (verificacao; correcoes pontuais se algo falhar).

- [ ] **Step 1: Suite completa**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: tudo verde.

- [ ] **Step 2: Migrations por inspecao**

`20260901030000` e `20260901030100`: so `create or replace function` + `revoke`/`grant`; rodam depois de `20260901020100`; colunas conferidas (Global Constraints). Se `admin_cron_jobs`/`admin_cron_runs`/`admin_cron_run_now` derem `permission denied for schema cron` no deploy, rodar antes (uma vez, no SQL Editor): `grant usage on schema cron to postgres; grant select on all tables in schema cron to postgres;` (o owner das funcoes).

- [ ] **Step 3: Em-dash sweep**

Run: `python -c "import glob; [print(f, open(f,encoding='utf-8').read().count(chr(8212))) for f in glob.glob('admin/src/pages/monitoring/*.tsx') + glob.glob('supabase/migrations/2026090103*.sql') + ['supabase/functions/admin-api/handlers/monitoring.ts','docs/superpowers/plans/2026-09-06-admin-panel-sp5-observabilidade.md','docs/superpowers/specs/2026-09-06-admin-panel-sp5-observabilidade-design.md']]"`
Expected: 0 em cada.

- [ ] **Step 4: PR**

```bash
git push -u origin feat/admin-sp5-observabilidade
gh pr create --base main --head feat/admin-sp5-observabilidade \
  --title "Painel admin SP5: Observabilidade (Monitoramento: jobs, erros, saude, logs, auth)" \
  --body "$(cat <<'EOF'
Ver docs/superpowers/specs/2026-09-06-admin-panel-sp5-observabilidade-design.md. Fase A (SQL puro: Jobs, Erros, Saude do banco, Auth) + Fase B (Management API: Logs de Edge, advisors, falha de login + acao rodar-agora). Empilha sobre #44, #47, #48, #49, #51.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Handoff de deploy pro usuario**

1. Aplicar `20260901030000_admin_monitoring_reads.sql` e depois `20260901030100_admin_monitoring_actions.sql` no SQL Editor. Se der `permission denied for schema cron`, rodar o grant do Step 2 primeiro. Conferir: `select proname from pg_proc where proname like 'admin_cron%' or proname like 'admin_db_health' or proname like 'admin_dispatch_errors' or proname like 'admin_auth_overview';` -> 6 linhas.
2. (Fase B, opcional) Criar um PAT em https://supabase.com/dashboard/account/tokens e setar como secret: `supabase secrets set SUPABASE_MGMT_TOKEN=sbp_... --project-ref zuqaccivowbzdfrpgekz`. Sem isso, as abas Logs e a secao Advisors mostram aviso; o resto funciona.
3. `supabase functions deploy admin-api --project-ref zuqaccivowbzdfrpgekz`.
4. `cd admin` ; `vercel deploy --prod --yes` ; `cd ..`.

Smoke test pos-deploy (login DEVELOPER):
- `/monitoring` -> aba **Jobs**: os 5 cron jobs, ultima execucao verde, expandir mostra o historico.
- **Erros**: totais + grafico; no periodo de 7d deve aparecer o pico de 2026-09-03 (69 parciais).
- **Saude do banco**: queries lentas, tabelas, conexoes, tamanho 31 MB.
- **Auth**: 6 usuarios.
- **Logs** + **Advisors**: dados se o `SUPABASE_MGMT_TOKEN` estiver setado, senao aviso.
- Botao "rodar agora" num job idempotente (`aflyo_expire_offers`) -> toast com "OK em Nms"; conferir `CRON_RAN_NOW` no `/audit`.

- [ ] **Step 6: Atualizar a memoria**

`project_admin_panel.md` + `MEMORY.md`: SP5 implementado (Fase A + B), PR, estado do deploy, secret `SUPABASE_MGMT_TOKEN`. Proximo: SP6 (Seguranca).

---

## Self-Review

**1. Spec coverage:**

| Spec | Task |
|---|---|
| Migration Fase A: 5 RPCs de leitura | Task 1 |
| Migration Fase B: `admin_cron_run_now` | Task 8 |
| `_pg-errors` hint `JOB_NOT_FOUND` | Task 8 |
| admin-api leitura (`cron-jobs`, `cron-runs`, `dispatch-errors`, `db-health`, `auth-overview`) | Task 2 |
| admin-api Fase B (`run-job` `jobs.retry`, `advisors` `system_health.read`, `logs` `logs.read`) + `_shared/supabase-mgmt.ts` | Task 9 |
| nav "Monitoramento" item unico, remove Jobs e filas / Erros e logs | Task 3 |
| Rota `/monitoring` sob RequirePermission | Task 3 |
| MonitoringArea 5 abas + checagem de permissao por aba | Task 3 |
| `MiniBars` SVG inline sem lib | Task 3 |
| JobsTab (cron + runs expansivel) + Fase B rodar agora | Task 4 + Task 10 |
| ErrorsTab (totais + grafico + top canais + recentes, seletor de periodo) | Task 5 |
| DbHealthTab (queries lentas mean/total + tabelas + conexoes + db_size) + Fase B advisors | Task 6 + Task 10 |
| AuthTab (totais + signups + recentes) + Fase B falha de login | Task 7 + Task 10 |
| LogsTab (Edge/Auth/Postgres + janela) | Task 10 |
| `auth.audit_log_entries` vazia -> AuthTab Fase A magra, so `auth.users` | Task 1 (`admin_auth_overview` so le `auth.users`) |
| advisors filtra `level <> 'INFO'` no handler | Task 9 (`groupAdvisors`) |
| Sem token -> erro amigavel, secoes ocultas/avisadas | Task 9 (`requireMgmt`) + Task 10 (avisos) |
| Verificacao + deploy + memoria | Task 11 |
| Fora de escopo (sem alertas, sem jobs.cancel, sem editar cron, sem src/) | nenhuma task viola; nas Global Constraints |

Sem lacuna.

**2. Placeholder scan:** todos os steps de codigo tem codigo real. Task 10 Steps 1/3/4 descrevem edicoes com o corpo dos handlers/`it()` dados e o mock nomeado (`action === 'run-job'|'advisors'|'logs'`); o executor tem o padrao das Tasks 4-7 + do SP4 Task 10. "conferir a contagem de testes" nos steps de verificacao e verificacao, nao placeholder.

**3. Type consistency:**
- `reqStr(params, key)` (Task 2) reusado na Task 9 (`runJob` usa `num`, nao `reqStr`, mas `str`/`num` sao do mesmo arquivo).
- `groupAdvisors(lints)` (Task 9) -> shape `{ groups: [{ name, title, level, category, count, remediation, examples }] }` consumido no `DbHealthTab` (Task 10 Step 3).
- Actions no `HANDLERS`: `monitoring/{cron-jobs,cron-runs,dispatch-errors,db-health,auth-overview}` (Task 2) + `{run-job,advisors,logs}` (Task 9). As mesmas strings usadas no front (Tasks 4-7, 10).
- Shapes RPC (Task 1) == consumo handler (Task 2) == consumo front (Tasks 4-7): `admin_cron_jobs` -> `{items:[...]}`; `admin_cron_runs` -> `{items,page,pageSize,total}`; `admin_dispatch_errors` -> `{totals,by_day,top_channels,recent}`; `admin_db_health` -> `{slow_by_mean,slow_by_total,tables,connections,db_size,stats_since}`; `admin_auth_overview` -> `{totals,signups_by_day,recent_signups}`.
- `admin_cron_run_now` (Task 8) -> `{jobid,jobname,ok,message,duration_ms}` == `runJob` handler passthrough (Task 9) == `runNow` no front (Task 10 Step 1).
- Permissoes: `jobs.read`/`jobs.retry`/`errors.read`/`logs.read`/`system_health.read` -- todas ja no catalogo (Global Constraints). Nav item e route guard usam `system_health.read`; cada aba checa a sua.
- `MiniBars` props `{ bars: Array<{label,value,alt?}>, height? }` (Task 3) == uso em ErrorsTab (`value`=sends, `alt`=bad) e AuthTab (`value`=n) (Tasks 5, 7).

**4. Ordem:** 1 (mig leitura) -> 2 (handlers leitura) -> 3 (rotas+shell+MiniBars) -> 4/5/6/7 (abas Fase A) == Fase A shippable. 8 (mig acao) -> 9 (handlers Fase B) -> 10 (front Fase B) -> 11 (verificacao+deploy). Rodar em ordem.
