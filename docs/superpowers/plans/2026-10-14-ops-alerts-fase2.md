# Central de alertas, Fase 2 (saúde e erros) Implementation Plan

> Para agentes: execute task a task. Este plano é a fonte de verdade; spec de origem: `docs/superpowers/specs/2026-10-13-ops-alerts-design.md` (seções 3.1 e 3.2, Fase 2) e a lista "Próximas fases" de `docs/OPS_ALERTS.md`.

**Objetivo:** o operador é avisado quando algo falha por dentro: banco/PostgREST parado, cron falhando ou parado, bot com erro, conexões e disco do banco no limite, alertas não entregues, conta que expira, erro não tratado em Edge Function e falha ao gravar webhook de pagamento.

**Arquitetura:** tudo continua passando por `ops_emit` (SQL) e `notify`. Um job `ops_healthcheck` roda a cada 5 minutos no `pg_cron`; um trigger em `profiles` avisa expiração; um helper `withAlerts` envolve o `serve(...)` das Edge Functions. A checagem externa de "site/API fora do ar" é feita pelo Uptime Kuma do operador (já configurado), que passa a consultar também `rpc/ops_health`.

## Restrições globais

- Texto ao operador em pt-BR, **nunca travessão (—)**. Segredos só em secrets/Vault; nada em arquivo versionado; nunca ler `.env`.
- Padrão de banco da produção: `ops_emit` lê a chave do **Vault** (`app_service_role_key`) e a URL do `notify` é constante na função. Nada de `alter database ... set app.*`.
- Funções SQL novas: `security definer`, `set search_path = public` (ou `public, vault`), `revoke all ... from public, anon, authenticated`, exceto `ops_health` (ver Task A1). Todo bloco que emite alerta é **fail-open** (nunca lança para quem chamou).
- Edge Functions: o wrapper nunca pode mudar status, corpo, cabeçalhos ou ordem de efeitos da resposta original, nem lançar por conta própria.
- Verificação: `deno check` e `deno test` **sem** `--no-check`; `node scripts/check-ops-alerts.mjs`.
- Commit: `feat(ops): ...`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` literal.
- Migrations novas **não** são aplicadas pelo agente (o operador aplica no SQL Editor).

## Fatos verificados no banco de produção (2026-10-14)

- `pg_cron` jobs: `aflyo_expire_offers` (`*/15 * * * *`), `aflyo_prune_old_rows` (`10 6 * * *`), `expire_subscriptions` (`0 3 * * *`), `expire_trials` (`0 * * * *`), `ops_prune` (`20 6 * * *`), `ops_trial_expiring_scan` (`5 * * * *`), `prune_webhook_events` (`0 4 * * *`), `trial_email_reminders` (`0 12 * * *`).
- Houve 39 falhas "job startup timeout" em 48h nos jobs `aflyo_expire_offers`, `expire_trials`, `expire_subscriptions`, `prune_webhook_events` (última em 2026-10-13 10:45 UTC).
- `cron.job_run_details(jobid, runid, job_pid, database, username, command, status, return_message, start_time, end_time)`; `status` vale `succeeded`, `failed`, etc. `cron.job(jobid, jobname, schedule, active, ...)`.
- `max_connections = 60`; plano Free do Supabase (limite de disco 500 MB).
- `bot_configs.status` assume `active`, `paused`, `pending`; `last_seen_at` é nulo em todos (o bot não reporta sinal de vida), `last_error text` existe, `paused_reason text` existe, `ativo bool`, `updated_at`.
- `ops_events` tem: `id, created_at, last_seen_at, severity, category, title, detail, user_id, fingerprint, occurrences, notified_at`.
- `profiles` tem: `id, email, full_name, display_name, phone, plan, account_status, trial_ends_at, trial_started_at`; `account_status` aceita `trialing, active, expired, canceled` (e pode ser nulo).
- `webhook_events(id, provider_event_id, event_type, provider_subscription_id, payload, processed_at)`.
- Todas as Edge Functions iniciam com `serve(async (req) => {...})` (std `http/server`). `verify_jwt` em produção: `public-api`, `enrich-product`, `evolution-webhook`, `cakto-webhook`, `email-hook` = false; todas as demais = true.

---

## Task A: migration SQL de saúde (um arquivo)

**Arquivos:**
- Criar `supabase/migrations/20261014000000_ops_phase2_health.sql`
- Criar `supabase/rollbacks/20261014000000_ops_phase2_health_rollback.sql`
- Criar `supabase/tests/manual/20261014000000_ops_phase2_health.test.sql`
- Modificar `scripts/check-ops-alerts.mjs` (novos contratos)
- Modificar `docs/OPS_ALERTS.md`

### A1. `public.ops_health() returns jsonb`
`language sql stable`, **executável por `anon` e `authenticated`** (é consultada pelo Uptime Kuma via PostgREST, `GET /rest/v1/rpc/ops_health?apikey=<publishable>`). Retorna `jsonb_build_object('ok', true, 'ts', now())`. Não lê nenhuma tabela. `security invoker`. `grant execute ... to anon, authenticated, service_role`.

### A2. Colunas de reenvio em `ops_events`
`alter table public.ops_events add column if not exists notify_attempts int not null default 0, add column if not exists last_notify_attempt_at timestamptz;`

### A3. `public.ops_retry_undelivered() returns int`
`security definer`, `set search_path = public, vault`. Seleciona até 20 eventos com `notified_at is null`, `severity in ('critical','error','business')`, `created_at > now() - interval '24 hours'`, `created_at < now() - interval '2 minutes'`, `notify_attempts < 3`, `coalesce(last_notify_attempt_at, '-infinity') < now() - interval '5 minutes'`, ordenados por `created_at`. Para cada um: lê o segredo do Vault como em `ops_emit`, faz `net.http_post` para `https://zuqaccivowbzdfrpgekz.functions.supabase.co/notify` com `{"event_id": id}` e `Authorization: Bearer <chave>`, e atualiza `notify_attempts = notify_attempts + 1, last_notify_attempt_at = now()`. Sem chave no Vault: `raise notice` e retorna 0. Cada envio dentro de bloco `begin ... exception when others then raise warning ... end` para um erro não impedir os demais. Retorna a quantidade de reenvios.

### A4. `public.ops_healthcheck() returns jsonb`
`security definer`, `set search_path = public`. Cada checagem em seu próprio `begin ... exception when others then raise warning '[ops_healthcheck] ...' end`, para uma falha não impedir as outras. Usa `ops_emit` sem `p_dedupe_key` (agrupa por título em janela de 10 min), exceto onde indicado. Retorna jsonb com a contagem de alertas emitidos por checagem (para o teste manual).

1. **Cron falhando:** para cada `jobname` com `cron.job_run_details.status = 'failed'` e `start_time > now() - interval '15 minutes'`: `ops_emit('error','cron','Job do cron falhou: ' || jobname, jsonb{job, falhas (count), ultima (max start_time), mensagem (left(return_message, 200))})`.
2. **Cron parado:** lista fixa de `(jobname, intervalo_maximo)`: `aflyo_expire_offers` 45 min, `expire_trials` 3 h, `ops_trial_expiring_scan` 3 h. Para cada job `active` cuja última execução `succeeded` (`max(end_time)`) é anterior a `now() - intervalo_maximo` (ou inexistente): `ops_emit('error','cron','Cron parado: ' || jobname, jsonb{job, ultima_execucao_ok, esperado_a_cada})`.
3. **Bots com erro:** `bot_configs` com `status = 'active'` e `last_error` não vazio. Se houver: `ops_emit('error','bot','Bots com erro: ' || n, jsonb{quantidade, amostra: array de até 5 objetos {user_id, erro: left(last_error, 160)}})`. Observação: `last_seen_at` é nulo para todos os bots hoje, **não** use sinal de vida.
4. **Conexões:** `count(*) from pg_stat_activity` acima de 80% de `max_connections` (`current_setting('max_connections')::int`): `ops_emit('error','health','Conexões do banco acima de 80%', jsonb{ativas, maximo, percentual})`.
5. **Disco:** `pg_database_size(current_database())` acima de 400 MB (constante no topo da função, 80% do limite Free de 500 MB): ` ops_emit('error','health','Banco perto do limite de disco', jsonb{tamanho_mb, limite_mb})`.
6. **Reenvio:** chama `public.ops_retry_undelivered()` e, se > 0, **não** emite alerta (só devolve a contagem no jsonb).
7. `ops_events` sem eventos `critical`/`error` aparecendo em loop não é tratado aqui.

Agendamento: `select cron.schedule('ops_healthcheck', '*/5 * * * *', $$ select public.ops_healthcheck(); $$);`. `revoke` de `public, anon, authenticated` em `ops_retry_undelivered` e `ops_healthcheck`.

### A5. Expiração e cancelamento de conta (trigger em `public.profiles`)
Função `public.ops_on_account_status_change()` `security definer`, fail-open (bloco aninhado), e trigger `trg_ops_account_status` `after update of account_status on public.profiles for each row when (old.account_status is distinct from new.account_status and new.account_status in ('expired','canceled'))`.
Título: `old = 'trialing' and new = 'expired'` => `Trial expirou`; `new = 'expired'` (outros) => `Assinatura expirou`; `new = 'canceled'` => `Conta cancelada`. Severidade `business`, categoria `billing`. `p_dedupe_key = 'acct:' || new.id || ':' || new.account_status || ':' || extract(epoch from now())::bigint::text` (um alerta por transição, sem fundir usuários). Detail (sem nulos, `jsonb_strip_nulls`): `nome` (full_name ou display_name), `email` (completo), `telefone`, `plano` (profiles.plan), `situacao_anterior`, `situacao_atual`, `painel` = `https://admin.aflyo.com.br/users/<id>`. `user_id` = new.id. `revoke` de `public, anon, authenticated`.

### A6. Rollback, teste manual, contratos, docs
- **Rollback:** `cron.unschedule('ops_healthcheck')` (protegido), `drop trigger if exists trg_ops_account_status on public.profiles`, `drop function` das 5 funções novas (ordem segura), `alter table public.ops_events drop column if exists notify_attempts, drop column if exists last_notify_attempt_at`.
- **Teste manual SQL**, no estilo dos existentes, com "espera ..." em cada bloco: `select public.ops_health()`; privilégios (`ops_health` executável por anon; as outras não); `select public.ops_healthcheck()` retorna jsonb; um bloco `begin; ... rollback;` que simula `update public.profiles set account_status = 'expired' where id = <um perfil com trialing>` e confere o evento criado (com aviso de que gera alerta real se não for revertido; os http enfileirados são descartados pelo rollback); e a observação de que as 39 falhas "job startup timeout" aparecem na checagem 1.
- **`scripts/check-ops-alerts.mjs`:** contratos novos: a migration contém `ops_health`, `grant execute on function public.ops_health() to anon`, `revoke all on function public.ops_healthcheck`, `revoke all on function public.ops_retry_undelivered`, `trg_ops_account_status`, `'acct:'`, `cron.schedule('ops_healthcheck'` e **não** contém `alter database` nem `current_setting('app.`.
- **`docs/OPS_ALERTS.md`:** seção "Saúde (Fase 2)": o que o healthcheck checa e com que limites, a tabela dos novos alertas, como silenciar um job, e a recomendação de monitor no Kuma para `https://zuqaccivowbzdfrpgekz.supabase.co/rest/v1/rpc/ops_health?apikey=<publishable>` (HTTP 200, corpo contém `"ok":true`). Atualize a lista "Próximas fases" removendo o que a Fase 2 entrega (expiração, reenvio de `notified_at` nulo, falha de gravação do webhook, throttle do secret inválido, timeout nos envios, `withAlerts`).

---

## Task B: código das Edge Functions

**Arquivos:**
- Criar `supabase/functions/_shared/ops/with-alerts.ts` e `with-alerts_test.ts`
- Modificar o `serve(...)` de: `public-api`, `enrich-product`, `evolution-webhook`, `evolution-groups-select`, `evolution-groups-sync`, `evolution-instance-create`, `evolution-instance-delete`, `evolution-instance-status`, `api-key-generate`, `api-key-reveal`, `api-key-revoke`, `cakto-create-payment`, `cakto-cancel-subscription`, `cleanup-storage` (cada um em `supabase/functions/<nome>/index.ts`)
- Modificar `supabase/functions/cakto-webhook/index.ts` e `ops.ts` (+ `ops_test.ts`)
- Modificar `docs/OPS_ALERTS.md` (lista de funções cobertas)

**Fora de escopo (não alterar):** `admin-api` (tem tratamento próprio), `send-email` e `email-hook` (caminho de e-mail do Auth), `notify` (não alertar sobre si mesmo).

### B1. `withAlerts`
```ts
export interface AlertsOpts {
  critical?: boolean;                 // severidade critical em vez de error
  getClient?: () => RpcClient;        // injeção para teste; padrão: getSupabaseAdmin()
  timeoutMs?: number;                 // teto de espera da emissão, padrão 1500
  emit?: typeof emitOps;              // injeção para teste
}
export function withAlerts(
  name: string,
  handler: (req: Request) => Response | Promise<Response>,
  opts?: AlertsOpts,
): (req: Request) => Promise<Response>;
```
Comportamento:
1. `try { res = await handler(req) } catch (e) { await emitirComTeto(...erro...); throw e; }` — **relança o mesmo erro** (a plataforma devolve o mesmo 500 de antes).
2. Se `res.status >= 500`: emite `error`, categoria `edge_error`, título `Function {name} respondeu {status}`, sem consumir o corpo (use `res.clone()` somente se for necessário; o padrão é **não** ler o corpo). Devolve `res` intacto.
3. Nunca emite para 2xx, 3xx, 4xx. Ignora (não emite) quando o erro é `AbortError` ou a requisição foi cancelada.
4. Erro lançado: severidade `critical` quando `opts.critical`, senão `error`; categoria `edge_error`; título `Erro na function {name}`; `detail` = `{ funcao, metodo, rota (apenas pathname, sem query string), erro: mensagem do erro, tipo: nome da classe }`. Nunca incluir cabeçalhos, corpo ou query.
5. A emissão é protegida: `Promise.race([emit(...), timeout(timeoutMs)])` dentro de try/catch; qualquer falha da emissão é engolida e registrada com `console.error` (só a mensagem). O wrapper **nunca** lança por causa do alerta.
6. Testes: sem alerta em 200/401/404; alerta em 500 retornado; alerta e relançamento em exceção (mesmo objeto de erro); resposta original devolvida idêntica (mesmo objeto `Response`); emissão lenta não segura a resposta além do teto; emissão que lança não afeta o resultado; `critical` aplicado; detail sem query string nem cabeçalho (teste com `Authorization` e `?token=abc` na requisição).

### B2. Aplicação nas funções
Em cada arquivo listado, troque `serve(async (req) => { ... })` por `serve(withAlerts("<nome-da-function>", async (req) => { ... }))`, adicionando só o `import`. `critical: true` para `public-api`, `cakto-create-payment`, `cakto-cancel-subscription` e `evolution-webhook`; as demais `error`. Não altere nenhuma outra linha de lógica. Mostre o `git diff` de cada arquivo no relatório e confirme que só mudou o `import` e a chamada do `serve`.

### B3. `cakto-webhook`
1. **Falha ao gravar `webhook_events`** (o `catch` de `recordEventIfNew` que hoje devolve 500): emitir alerta `critical`, categoria `billing`, título `Webhook Cakto não gravou o evento`, detail `{ evento, pedido (data.id), erro }` (use um helper puro em `ops.ts`, com teste), usando o mesmo `emit()` protegido; a resposta continua exatamente `500 "Internal error"`.
2. **Throttle do secret inválido:** em memória do isolate, no máximo **1 emissão por 60 segundos** para o alerta de secret inválido (helper puro e testável `shouldEmitInvalidSecret(now: number, state: {last: number})` em `ops.ts`). O 401 e o corpo continuam idênticos; o `await emit` passa a acontecer só quando o throttle libera.
3. Testes em `ops_test.ts` para o helper de falha de gravação e para o throttle (liberar na 1ª, bloquear dentro de 60 s, liberar depois).

### Verificação de B
`deno check` nos arquivos novos e em `cakto-webhook/index.ts` + os `index.ts` alterados (se algum falhar só por resolução de módulo remoto, diga), `deno test --allow-env supabase/functions/_shared/ops/ supabase/functions/notify/ supabase/functions/cakto-webhook/ops_test.ts` (tudo verde), `node scripts/check-ops-alerts.mjs`, e grep de travessão nas linhas adicionadas (nenhum).

---

## Review Focus

1. `withAlerts` não pode alterar o comportamento de nenhuma função (status, corpo, cabeçalhos, exceções): o foco do revisor é a `public-api`, que a bot usa em produção.
2. Alerta em loop: um erro repetido 1000 vezes deve gerar 1 linha em `ops_events` e mensagens só em 1/5/25/100.
3. Falsos positivos do healthcheck (bots `pending`, jobs que nunca rodaram, `last_seen_at` nulo).
4. Rajada na expiração em massa (muitos `update` de `account_status` na mesma hora): cada transição vira um alerta; o reenvio cobre os 429 do Discord.
5. Vazamento: `detail` do `withAlerts` nunca carrega query string, cabeçalho ou corpo.
