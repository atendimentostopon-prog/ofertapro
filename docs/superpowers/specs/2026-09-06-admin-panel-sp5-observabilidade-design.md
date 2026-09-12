# Painel Admin SP5, Observabilidade Design

Data: 2026-09-06
Status: aprovado (AskUserQuestion), aguardando revisao do usuario antes do plano

## Objetivo

Dar ao painel admin uma area de Monitoramento: ver se os cron jobs rodaram, a taxa de erro de disparo, a saude do banco, logs de Edge Function, e sinais de auth. Da fonte real ao que o Dashboard do SP1 marca como "sem fonte" (`jobs_failed`, `errors_24h`, etc). So leitura, com uma unica acao (re-executar um cron job).

## Decisoes travadas (AskUserQuestion 2026-09-06)

1. Escopo: area "Monitoramento" com abas (Jobs / Erros / Saude do banco / Logs / Auth).
2. Fonte externa: SIM. Logs de Edge Function e advisors do Supabase vem da Management API (`api.supabase.com`), com um PAT do Supabase guardado como secret nova `SUPABASE_MGMT_TOKEN` na admin-api.
3. Jobs: leitura + acao "re-executar agora" (roda o `command` do cron job na hora), gated em `jobs.retry` (DEVELOPER), auditada.
4. Auth: aba propria lendo eventos de auth.
5. Formato: um spec so, plano faseado. Fase A = tudo que e SQL puro (Jobs, Erros, Saude, Auth). Fase B = Management API (Logs de Edge, advisors) + a acao run-now + falha-de-login.

## Fatos verificados no banco de producao (via MCP, 2026-09-06)

- **5 cron jobs ativos** (`cron.job`): `expire_subscriptions` (`0 3 * * *`, jobid 1), `prune_webhook_events` (`0 4 * * *`, jobid 2), `expire_trials` (`0 * * * *`, jobid 3), `aflyo_expire_offers` (`*/15 * * * *`, jobid 8), `aflyo_prune_old_rows` (`10 6 * * *`, jobid 9). Todos `succeeded` nas ultimas execucoes.
- **`cron.job_run_details`**: colunas `jobid`, `runid`, `job_pid`, `database`, `username`, `command`, `status` (`succeeded`|`failed`|`running`), `return_message`, `start_time`, `end_time`.
- **`pg_stat_statements`** instalado (1863 linhas). **`pg_cron`** instalado. `pgaudit` NAO.
- **`auth.audit_log_entries` esta VAZIA** (0 linhas, Supabase nao popula nesse projeto). Colunas: `instance_id`, `id`, `payload` (json), `created_at`, `ip_address`. => a aba Auth em Fase A so consegue derivar de `auth.users` (signup/confirmacao/banido); "falha de login" so via os logs da Management API (source `auth`), Fase B.
- **`auth.users`**: 6 usuarios. Projeto pequeno; a aba Auth vai ter pouco volume.
- **`history.status`** em prod: so `success` (318) e `partial` (69). `error` existe no schema/codigo mas sem linha agora. A aba Erros trata `status in ('error','partial')`.
- **Advisors** (`GET /v1/projects/{ref}/advisors/performance`): retorno `{ result: { lints: [{ name, title, level (INFO|WARN|ERROR), categories:[PERFORMANCE|SECURITY], description, detail, remediation (url), metadata, cache_key, observed_at }] } }`. ~86 KB, centenas de lints INFO ("unindexed foreign key"). A aba Saude vai filtrar `level <> 'INFO'` e agrupar por `name`.
- Advisors e Edge logs precisam da Management API. Endpoints: `GET https://api.supabase.com/v1/projects/{ref}/advisors/{security|performance}` e o endpoint de analytics/logs (`GET /v1/projects/{ref}/analytics/endpoints/logs.all?sql=<clickhouse>&iso_timestamp_start=...&iso_timestamp_end=...`). O `ref` a admin-api deriva de `SUPABASE_URL` (`https://<ref>.supabase.co`).

## Migracao Fase A (`20260901030000_admin_monitoring_reads.sql`)

Todas `stable security definer set search_path = public`. Owner = role da migration (tem acesso a `cron.*` porque as migrations anteriores rodam `SELECT cron.schedule(...)`). Se der `permission denied` em `cron.*` no deploy, o plano tem um fallback (grant explicito ao owner).

- `admin_cron_jobs() returns jsonb`
  -> `{ items: [{ jobid, jobname, schedule, active, last_status, last_return_message, last_start, last_end, last_duration_ms, runs_24h, fails_24h }] }`
  - join `cron.job` LEFT JOIN LATERAL (ultima row de `cron.job_run_details` por `jobid`) + contagem das ultimas 24h.
- `admin_cron_runs(p_job text, p_page int, p_page_size int) returns jsonb`
  -> `{ items: [{ runid, status, return_message, start_time, end_time, duration_ms }], page, pageSize, total }`
  - `p_job` = `jobname` (resolve pra `jobid`); ordena `start_time desc`.
- `admin_dispatch_errors(p_from timestamptz, p_to timestamptz) returns jsonb`
  -> `{ totals: { sends, success, partial, error, error_rate }, by_day: [{ day, sends, partial, error }], top_channels: [{ channel, fails }], recent: [{ id, sent_at, offer_name, user_email, status, failed_channels, error }] }`
  - `by_day`: `date_trunc('day', sent_at)`. `top_channels`: `unnest(failed_channels)` agrupado. `recent`: ultimas 50 com `status in ('error','partial')` + join `profiles`.
- `admin_db_health() returns jsonb`
  -> `{ slow_by_mean: [{ query, calls, mean_ms, total_ms }], slow_by_total: [...], tables: [{ name, total_bytes, total_pretty, live_tup, dead_tup, last_autovacuum }], connections: [{ state, count }], db_size_pretty }`
  - `slow_*`: top 10 de `pg_stat_statements` (query truncada a 200 chars, ignora as do proprio schema `pg_%`/`cron%`). `tables`: top 15 por `pg_total_relation_size` no schema `public` + `pg_stat_user_tables`. `connections`: `pg_stat_activity` group by `state`. `db_size`: `pg_database_size(current_database())`.
- `admin_auth_overview(p_from timestamptz, p_to timestamptz) returns jsonb`
  -> `{ totals: { users, confirmed, unconfirmed, banned }, signups_by_day: [{ day, n }], recent_signups: [{ id, email, created_at, confirmed, last_sign_in_at }] }`
  - de `auth.users`: `email_confirmed_at`, `banned_until`, `created_at`, `last_sign_in_at`.

Grants: `revoke ... from authenticated, anon` + `grant ... to service_role`.

## Migracao Fase B (`20260901030100_admin_monitoring_actions.sql`)

- `admin_cron_run_now(p_actor uuid, p_jobid bigint, p_ctx jsonb) returns jsonb`
  - carrega `command` de `cron.job` por `p_jobid`; se nao existe -> `hint='JOB_NOT_FOUND'`.
  - `EXECUTE` do command num bloco `begin ... exception when others` que captura `sqlerrm`; mede `clock_timestamp()` antes/depois.
  - `admin_audit_write(p_actor, 'CRON_RAN_NOW', 'cron_job', p_jobid::text, null, jsonb_build_object('jobname', v_name, 'ok', v_ok, 'message', v_msg, 'ms', v_ms), null, p_ctx)`.
  - retorna `{ jobid, jobname, ok, message, duration_ms }`. Em erro do command NAO propaga excecao (retorna `ok:false` + message) pra tela mostrar o resultado.
- Grants idem.
- `_pg-errors.ts` ganha `JOB_NOT_FOUND` (not_found). O caso "sem token da Management API" nao passa por RPC: o handler lanca `RbacError('internal', 'Management API nao configurada (SUPABASE_MGMT_TOKEN).')` direto.

## `admin-api`

### `handlers/monitoring.ts` (Fase A)

Perms: `jobs.read` (cron), `errors.read` (dispatch), `system_health.read` (db-health, auth-overview).

- `cron/jobs` -> `admin_cron_jobs`
- `cron/runs` (`params.job`, `params.page`) -> `admin_cron_runs`
- `errors/dispatch` (`params.from`, `params.to`) -> `admin_dispatch_errors` (default: ultimas 24h)
- `health/db` -> `admin_db_health`
- `auth/overview` (`params.from`, `params.to`) -> `admin_auth_overview` (default: 30 dias)

### `handlers/monitoring.ts` (Fase B) + `_shared/supabase-mgmt.ts`

- `_shared/supabase-mgmt.ts`: `mgmtConfigured(): boolean` e `mgmtFetch(path): Promise<Response>` (base `https://api.supabase.com`, header `Authorization: Bearer ${SUPABASE_MGMT_TOKEN}`). `projectRef()` deriva de `SUPABASE_URL`.
- `cron/run-now` (perm `jobs.retry`): `params.jobid` -> `admin_cron_run_now`.
- `health/advisors` (perm `system_health.read`): se `!mgmtConfigured()` -> `RbacError('internal', 'Management API nao configurada (SUPABASE_MGMT_TOKEN).')`. Senao `mgmtFetch('/v1/projects/{ref}/advisors/security')` + `.../performance`, junta, filtra `level in ('WARN','ERROR')`, agrupa por `name` -> `{ groups: [{ name, title, level, category, count, remediation, examples: [detail...3] }] }`.
- `logs/query` (perm `logs.read`): `params.source` (`function_edge_logs` default | `auth` | `postgres_logs`), `params.hours` (1..24, default 6), `params.q` (filtro opcional de texto). Monta uma SQL ClickHouse simples (`select id, timestamp, event_message, metadata from <source> ... order by timestamp desc limit 100`) e chama o endpoint de analytics. Se `!mgmtConfigured()` -> mesmo erro amigavel.

`index.ts`: `import * as monitoring` + bloco `monitoring:` no `HANDLERS` (Fase A registra 5 actions, Fase B mais 3).

## Front (`admin/`)

- `admin/src/pages/monitoring/MonitoringArea.tsx`: shell com abas via `?tab=jobs|erros|saude|logs|auth` (default `jobs`).
- `JobsTab.tsx`: tabela de `cron/jobs` (jobname, schedule, ultima execucao com badge succeeded/failed/running, duracao, fails 24h). Linha expande -> `cron/runs` daquele job (historico paginado com `return_message`). Fase B: botao "rodar agora" por linha (gated `jobs.retry`) -> `cron/run-now` -> toast com o resultado + reload.
- `ErrorsTab.tsx`: `errors/dispatch` com seletor de periodo (24h / 7d / 30d). Mostra os totais (sends / partial / error / taxa), um mini grafico de barras por dia (SVG inline simples, sem lib), top canais que falharam, e a lista das ultimas 50 com `failed_channels` + `error` expansivel.
- `DbHealthTab.tsx`: `health/db` -> cards: "Queries mais lentas (media)" e "(total)" (tabela query/calls/ms), "Maiores tabelas" (nome/tamanho/dead tuples/ultimo autovacuum), "Conexoes" (por state), tamanho do banco. Fase B: secao "Advisors" -> `health/advisors` (grupos WARN/ERROR com count + link de remediacao); se a Management API nao estiver configurada, mostra um aviso discreto "configure SUPABASE_MGMT_TOKEN pra ver advisors".
- `LogsTab.tsx` (Fase B): seletor de source (Edge Functions / Auth / Postgres) + janela (1h..24h) + busca de texto -> `logs/query`. Lista `timestamp` + `event_message`. Se Management API nao configurada -> aviso e nada mais.
- `AuthTab.tsx`: `auth/overview` -> totais (usuarios / confirmados / nao confirmados / banidos), signups por dia (mesmo mini grafico), lista dos ultimos cadastros. Fase B: card "Falhas de login (ultimas 24h)" puxando `logs/query` com `source='auth'` filtrado por evento de falha; sem Management API o card fica oculto.
- `admin/src/nav.ts`: secao "Monitoramento" com item unico `{ label: 'Monitoramento', to: '/monitoring', permission: 'system_health.read', icon: Activity }`. Remove "Jobs e filas" e "Erros e logs". `Activity` continua importado.
- `admin/src/App.tsx`: rota `/monitoring` sob `RequirePermission permission="system_health.read"`.

Cada aba, ao montar, checa a permissao especifica via `useAdminAuth` + `hasPermission` e mostra um estado "sem permissao pra esta aba" em vez de chamar a API (o `RequirePermission` da rota so cobre `system_health.read`).

## Permissoes

Ja no catalogo (`20260829130000`), grp `monitoring`, nenhuma nova:
- `jobs.read`, `jobs.retry` (DEVELOPER)
- `errors.read` (DEVELOPER)
- `logs.read` (DEVELOPER)
- `system_health.read` (DEVELOPER, ANALYST)

Rotulos pt-BR em `admin/src/lib/permission-labels.ts`: conferir no plano; se `jobs.retry`/`errors.read`/`logs.read`/`system_health.read` estiverem crus, traduzir.

## Ordem de implementacao (resumo pro plano)

**Fase A (SQL puro):**
1. Migracao `20260901030000` (5 RPCs de leitura) + `.test.sql`.
2. `admin-api` `handlers/monitoring.ts` Fase A (5 handlers) + `index.ts` + `monitoring_test.ts` (helpers puros: parse de periodo, clamp de pagina).
3. `nav.ts` + `App.tsx` + `MonitoringArea` (shell) + 5 stubs.
4. `JobsTab` (jobs + runs expansivel) + teste.
5. `ErrorsTab` (totais + grafico + top canais + recentes) + teste.
6. `DbHealthTab` (queries lentas + tabelas + conexoes) + teste.
7. `AuthTab` (totais + signups + recentes) + teste.

**Fase B (Management API + acao):**
8. Migracao `20260901030100` (`admin_cron_run_now`) + hints no `_pg-errors`.
9. `admin-api` `_shared/supabase-mgmt.ts` + `cron/run-now` + `health/advisors` + `logs/query` + testes (mockando `mgmtFetch`).
10. Front: botao "rodar agora" no `JobsTab`; `LogsTab`; secao Advisors no `DbHealthTab`; card falha-de-login no `AuthTab` + testes.
11. Verificacao (vitest + deno + build + lint) + deploy (2 migrations no SQL Editor, `supabase functions deploy admin-api`, setar `SUPABASE_MGMT_TOKEN` como secret, `vercel deploy --prod`) + smoke test + memoria.

## Fora de escopo

- Alertas, notificacao, e-mail de incidente, paginas de status publicas.
- `jobs.cancel` (matar um job em execucao), editar schedule de cron, criar/remover cron job.
- Retencao/limpeza dos proprios logs; escrever em qualquer tabela de sistema.
- Health-check ativo de servico externo (bot, Evolution, Cakto) por probe.
- Mudancas em `src/` (app do cliente) ou nos comandos dos cron jobs.
- APM / tracing distribuido / metricas custom com retencao.
- `pgaudit` (nao instalado; instalar e mudanca de infra, fora daqui).

## Riscos e notas

- **`cron.*` sob `security definer`**: a funcao precisa que o owner (role da migration) tenha `USAGE` no schema `cron` e `SELECT` em `cron.job`/`cron.job_run_details`. As migrations anteriores ja operam `cron` nesse mesmo role, entao deve funcionar; o plano tem um `grant` de fallback comentado.
- **`admin_cron_run_now` roda comando destrutivo**: e o MESMO comando do cron (ex.: `expire_subscriptions` faz UPDATE/DELETE). "Seguro" no sentido de que ja roda sozinho todo dia, mas e uma acao com efeito. Gated `jobs.retry` (so DEVELOPER) + audit. Nao roda em transacao aninhada perigosa: cada command dos 5 jobs e idempotente por design.
- **`auth.audit_log_entries` vazia**: a aba Auth em Fase A e magra (6 usuarios, so signup trend). A parte util (falha de login) depende da Management API. Documentado; o usuario aprovou a aba mesmo assim.
- **Management API token**: `SUPABASE_MGMT_TOKEN` e um PAT do Supabase (colaborador serve pra advisors/logs). Sem ele, `health/advisors` e `logs/query` retornam erro amigavel e as secoes correspondentes ficam ocultas/avisadas. O resto do SP5 funciona sem token.
- **Advisors volumoso**: filtrar `level <> 'INFO'` no handler antes de mandar pro front (as centenas de INFO de FK sem indice sao ruido).
- **`pg_stat_statements` reseta**: os numeros sao desde o ultimo reset/restart do Postgres, nao "sempre". A tela deixa isso claro no rotulo.
- **Base da branch**: `feat/admin-sp5-observabilidade` sai de `feat/admin-sp4-integracoes`. PR empilha sobre #44/#47/#48/#49/#51, base `main`.
