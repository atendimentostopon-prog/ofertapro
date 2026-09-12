# Painel Admin — Faixa de status em Monitoramento, Design

Data: 2026-09-12
Status: aprovado (confirmação no chat), aguardando revisao do usuario antes do plano

## Objetivo

Segunda rodada do redesign de KPIs do painel admin. Primeira rodada (Dashboard) ja
mergeada. Essa rodada cobre **so a pagina Monitoramento**
(`admin/src/pages/monitoring/`): adicionar uma faixa de status compacta, clicavel,
acima das abas — hoje o admin precisa abrir cada uma das 5 abas (Jobs, Erros, Saude
do banco, Logs, Auth) pra saber se algo esta quebrado.

## Decisoes travadas (confirmadas no chat, 2026-09-12)

1. Escopo: so a faixa de status no topo de `MonitoringArea.tsx`. Nao mexe no
   conteudo interno de nenhuma aba (diferente do Dashboard, aqui os dados ja sao
   reais — o problema e falta de visao geral, nao falta de dado).
2. Sem migration nova: a faixa reaproveita as 4 chamadas que as abas ja fazem
   (`monitoring/cron-jobs`, `monitoring/dispatch-errors`, `monitoring/db-health`,
   e a logica de `monitoring/logs source=auth` que `AuthTab`'s `LoginFailures`
   ja usa), disparadas em paralelo assim que `MonitoringArea` monta — nao so
   quando o admin clica na aba correspondente.
3. Cada indicador e clicavel: clicar nele muda `?tab=` pra pular direto pra aba.
4. Respeita RBAC: um indicador so aparece/e buscado se o admin tem a permissao
   daquela aba (`jobs.read`, `errors.read`, `system_health.read` pra banco e auth).

## Fatos verificados no codigo (2026-09-12)

- `admin/src/pages/monitoring/MonitoringArea.tsx`: shell com `useSearchParams`
  (`tab` na URL), `TABS` array, `setTab(t)` que so faz `params.set('tab', t)`.
  A faixa entra entre o `<header>` e o `<div className="flex gap-1 border-b ...">`
  das abas.
- `admin/src/pages/monitoring/JobsTab.tsx`: busca `monitoring/cron-jobs` ->
  `{ items: Job[] }`, `Job.fails_24h: number`. Sem paginacao, lista completa.
- `admin/src/pages/monitoring/ErrorsTab.tsx`: busca `monitoring/dispatch-errors`
  com `{ from, to }` (ISO) -> `{ totals: { sends, success, partial, error,
  error_rate }, by_day, top_channels, recent }`. `error_rate` ja vem calculado
  em %.
- `admin/src/pages/monitoring/DbHealthTab.tsx`: busca `monitoring/db-health`
  (sem params) -> `{ slow_by_mean: Slow[], slow_by_total: Slow[], tables,
  connections, db_size, stats_since }`, `Slow = { query, calls, mean_ms,
  total_ms }`. **`slow_by_mean` e SEMPRE as top-10 queries por `mean_exec_time`**
  (`supabase/migrations/20260901030000_admin_monitoring_reads.sql:107-116`,
  `limit 10` fixo, sem filtro de threshold) — ou seja, `.length` NAO e um sinal
  de saude (quase sempre sera 10). O sinal correto e o **valor** da mais lenta:
  `slow_by_mean[0]?.mean_ms`.
- `admin/src/pages/monitoring/AuthTab.tsx`, funcao `LoginFailures`: busca
  `monitoring/logs` com `{ source: 'auth', hours: 24 }` -> `{ items:
  Array<Record<string, unknown>> }`, filtra client-side com
  `/login|password|invalid|denied|fail/i.test(row.event_message)`. Esse handler
  (`logsQuery` em `supabase/functions/admin-api/handlers/monitoring.ts:109-126`)
  chama `requireMgmt()` e **lanca erro se `SUPABASE_MGMT_TOKEN` nao estiver
  configurado** — `LoginFailures` trata isso retornando `null` (card some). A
  faixa precisa do mesmo tratamento tolerante (indicador de Auth mostra
  "indisponivel", neutro, em vez de quebrar as outras 3).
- Tokens de cor ja usados no painel: `Badge` (`admin/src/components/ui/Badge.tsx`)
  com tons `success`/`warning`/`danger`/`neutral`/`info`.
- Permissoes por aba (`MonitoringArea.tsx:49-53`): `jobs.read` (Jobs),
  `errors.read` (Erros), `system_health.read` (Saude do banco E Auth), `logs.read`
  (Logs, sem indicador nessa rodada — nao ha metrica natural de "saude" pra logs
  brutos).

## Front-end

### Componente `StatusStrip` (novo)

`admin/src/pages/monitoring/StatusStrip.tsx`. Recebe `onJumpTo: (tab: string) =>
void` (a `MonitoringArea` passa seu `setTab`) e le permissoes via
`useAdminAuth()` internamente (mesmo padrao das abas).

Layout: `<div className="flex flex-wrap gap-2">` com ate 4 `StatusPill` (um por
area com permissao). Cada `StatusPill` e um `<button>` (nao um link — muda
estado local via `onJumpTo`, nao navegacao de rota), com `Badge`-like styling:
`rounded-full border px-3 py-1.5 text-xs font-semibold` + tom por severidade,
label da area + valor, ex.: `Jobs · 2 falhas (24h)`.

Quatro sub-fetches independentes, cada um com seu proprio `useAsync` (mesmo hook
`admin/src/lib/use-async.ts` ja usado em todo canto) — uma falha isolada em um
NAO derruba os outros 3:

1. **Jobs** (`can('jobs.read')`): `callAdminApi('monitoring', 'cron-jobs', {})`.
   Soma `fails_24h` de todos os itens. `0` -> tom `success`, label "Jobs · OK".
   `> 0` -> tom `danger`, label `` `Jobs · ${n} falha(s) (24h)` ``.
2. **Erros** (`can('errors.read')`): `callAdminApi('monitoring',
   'dispatch-errors', { from, to })` com `from`/`to` = ultimas 24h (mesmo padrao
   de `ErrorsTab`). Le `totals.error_rate` (numero, ja em %). `< 1` -> `success`
   "Erros · OK"; `1 <= x <= 5` -> `warning` `` `Erros · ${rate}%` ``; `> 5` ->
   `danger` `` `Erros · ${rate}%` ``.
3. **Banco** (`can('system_health.read')`): `callAdminApi('monitoring',
   'db-health', {})`. Le `slow_by_mean[0]?.mean_ms` (pode ser `undefined` se a
   lista vier vazia). Sem entradas -> `success` "Banco · OK". `mean_ms < 200` ->
   `success` "Banco · OK". `200 <= mean_ms < 1000` -> `warning` `` `Banco ·
   ${round(mean_ms)}ms` ``. `>= 1000` -> `danger` mesma label.
4. **Auth** (`can('system_health.read')`): `callAdminApi('monitoring', 'logs',
   { source: 'auth', hours: 24 })`, mesmo filtro regex de `LoginFailures`. Se a
   chamada falhar (Management API nao configurada ou qualquer erro) -> tom
   `neutral`, label "Auth · indisponivel", **sem** propagar erro pra UI (mesmo
   padrao silencioso de `LoginFailures`). Sucesso: `0` falhas -> `success` "Auth
   · OK"; `> 0` -> `warning` `` `Auth · ${n} falha(s) login (24h)` ``.

Enquanto uma sub-fetch esta carregando, o pill correspondente mostra tom
`neutral` com um label estatico ("Jobs · ...") — sem skeleton dedicado, e uma
faixa pequena, nao justifica o componente extra.

### `MonitoringArea.tsx`

Import `StatusStrip`, renderiza entre `<header>` e a `<div>` das abas:

```tsx
<StatusStrip onJumpTo={setTab} />
```

Nenhuma outra mudanca nesse arquivo.

## Testes

- `StatusStrip.test.tsx` (novo): mocka `callAdminApi` por `resource`/`action`
  (mesmo padrao de mock usado em `Dashboard.test.tsx`). Casos:
  - Jobs com `fails_24h` somando > 0 -> mostra "2 falha(s) (24h)" tom danger.
  - Jobs todos com `fails_24h = 0` -> "OK" tom success.
  - Erros com `error_rate` nas 3 faixas (ok/warning/danger).
  - Banco: `slow_by_mean` vazio -> OK; `mean_ms` nas 3 faixas.
  - Auth: chamada de logs rejeita (simula Management API nao configurada) ->
    mostra "indisponivel", nao quebra os outros pills nem lanca erro pro
    console/UI.
  - Clicar num pill chama `onJumpTo` com a key certa da aba (`'jobs'`, `'erros'`,
    `'saude'`, `'auth'`).
  - Pill de uma area sem permissao nao renderiza (nem faz a chamada — verificar
    que `callAdminApi` nao foi chamado pro resource daquela area).
- `MonitoringArea.test.tsx`: nao existe hoje (verificado: sem teste pra esse
  arquivo shell). Nao criar nessa rodada — a logica testavel esta toda em
  `StatusStrip`; `MonitoringArea` so faz composicao.

## Fora de escopo

- Qualquer mudanca dentro de `JobsTab`/`ErrorsTab`/`DbHealthTab`/`LogsTab`/`AuthTab`.
- Indicador pra aba Logs (sem metrica natural de saude pra logs brutos).
- Auto-refresh/polling da faixa (carrega uma vez ao montar `MonitoringArea`,
  mesmo comportamento de qualquer outra tela do painel).
