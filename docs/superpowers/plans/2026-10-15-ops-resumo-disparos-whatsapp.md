# Alertas: resumo diário, disparos falhando e WhatsApp caído

> Para agentes: este plano é a fonte de verdade. Contexto: `docs/OPS_ALERTS.md`, plano da Fase 2 `docs/superpowers/plans/2026-10-14-ops-alerts-fase2.md`.

**Objetivo:** (1) resumo diário às 08h (BRT) que também serve de "vigia do vigia"; (2) alertas de disparo falhando; (3) alerta de WhatsApp desconectado/com erro e de Evolution API instável.

## Restrições globais

- pt-BR, **nunca travessão (em dash)** em texto ao operador. Segredos só em Vault; nunca ler `.env`.
- `ops_emit(p_severity, p_category, p_title, p_detail jsonb, p_user_id uuid, p_dedupe_key text)` já existe (Vault + URL constante). Severidades: `critical, error, business, info`. Categorias: `signup, billing, edge_error, health, security, admin, bot, cron`.
- Funções novas: `security definer`, `set search_path = public`, `revoke all ... from public, anon, authenticated`. Todo bloco que emite alerta é fail-open (`begin ... exception when others then raise warning ... end`). **Não** altere `ops_healthcheck()` existente: crie funções novas e jobs novos.
- `jsonb_strip_nulls(jsonb_build_object(...))`; **no máximo 18 chaves** por detail (o sanitizador guarda 20).
- Dedupe: use chave por hora/dia (`to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDDHH24')` e `'YYYYMMDD'`) para que a condição persistente lembre 1 vez por período.
- Verificação: `deno check --no-config`, `deno test --no-config --allow-env` (sem `--no-check`), `node scripts/check-ops-alerts.mjs`. Commit `feat(ops): ...` com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` literal. Migrations **não** são aplicadas pelo agente.

## Fatos verificados em produção (2026-10-15)

- `public.history(id, user_id, offer_id, offer_name, marketplace, channels text[], channel_count, clicks, status, error, sent_at, successful_channels text[], failed_channels text[], success_count int, failure_count int, dispatch_results jsonb)`. `status` ∈ `success`, `partial`, `error` (7 dias: partial=1366, success=552, error=40). Falha total = `coalesce(success_count,0) = 0 and failure_count > 0` (só 40 em 7 dias). 70% têm falha parcial, quase tudo de **um** usuário (107/107 em 24h por um canal quebrado): **não** alerte por taxa de falha parcial. `error` traz texto como `Falha no envio da API para: <nomes de canais>`.
- `public.whatsapp_instances(id, user_id, channel_id, name, instance_name, instance_id, status, provider, phone_number, profile_name, qr_code, connected_at, disconnected_at, last_sync_at, error_message, created_at, updated_at)`. `status` ∈ `connected, disconnected, error, qrcode`. Hoje: error=2, connected=4, qrcode=1, disconnected=2. `error_message` frequentemente é HTML bruto de erro da Cloudflare: `Evolution API respondeu com status 530: <!doctype html>...`. Limpe com `regexp_replace(msg, '<[^>]*>', ' ', 'g')`, colapse espaços e `left(..., 160)`.
- Já existe `public.ops_user_snapshot(p_user_id uuid) returns jsonb` (nome, email, telefone, plano, trial_termina, painel).
- `webhook_events(event_type, payload jsonb, processed_at)`: vendas = `purchase_approved` e `subscription_renewed` (valor em `payload->'data'->>'amount'`, numérico seguro com regex `^[0-9]+(\.[0-9]+)?$`); reembolsos `refund`; contestações `chargeback`; recusas `purchase_refused` e `subscription_renewal_refused`.
- `pg_cron`: já existem `ops_healthcheck` (`2-59/5 * * * *`), `ops_trial_expiring_scan` (`5 * * * *`), `ops_prune`. Evite o minuto 0 (contenção de "job startup timeout"): novos jobs em `4-59/5 * * * *` e `0 11 * * *` (08:00 BRT = 11:00 UTC; o Brasil não tem horário de verão).
- `max_connections = 60`; banco Free (limite 500 MB).

## Task única: migration + formatação + docs (um commit)

### 1. `supabase/migrations/20261015000000_ops_resumo_disparos_whatsapp.sql`
Cabeçalho pt-BR: depende de `20261013000000`, `20261014000000`, `20261014010000`; rollback em `supabase/rollbacks/20261015000000_ops_resumo_disparos_whatsapp_rollback.sql`.

**a) WhatsApp caiu (trigger).** Função `ops_on_whatsapp_down()` fail-open + trigger `trg_ops_whatsapp_down` `after update of status on public.whatsapp_instances for each row when (old.status = 'connected' and new.status in ('disconnected','error'))`. Severidade `error`, categoria `bot`, título `WhatsApp desconectado` (new.status='disconnected') ou `WhatsApp com erro` (new.status='error'). Detail = `ops_user_snapshot(new.user_id)` mesclado com `numero_whatsapp` (phone_number), `perfil_whatsapp` (profile_name), `instancia` (instance_name), `erro` (error_message limpo). `p_user_id = new.user_id`; dedupe `'wa_down:' || new.id || ':' || <chave horária SP>`.

**b) Checagens de disparo e Evolution (função nova + cron).** `ops_healthcheck_dispatch() returns jsonb`, cada checagem isolada em seu bloco; cron `ops_healthcheck_dispatch` em `4-59/5 * * * *`.
 1. **Disparos falhando por usuário:** usuários com `>= 3` linhas em `history` nos últimos 60 min e `sum(coalesce(success_count,0)) = 0` e `sum(failure_count) > 0` ⇒ `ops_emit('error','bot','Disparos falhando', snapshot || {disparos, falhas, ultimo_erro (left(erro mais recente, 160))}, user_id, 'disp_falha:' || user_id || ':' || <hora SP>)`.
 2. **Canal com falha persistente:** por usuário, nomes de canal que aparecem em `failed_channels` em `>= 10` linhas de `history` nas últimas 24 h e **nunca** em `successful_channels` no mesmo período ⇒ `ops_emit('error','bot','Canal com falha persistente', snapshot || {canais (texto: até 5 nomes separados por vírgula), quantidade (nº de canais)}, user_id, 'canal_falha:' || user_id || ':' || <dia SP>)`. Use `unnest` de `failed_channels`/`successful_channels` (arrays `text[]`, podem ser nulos).
 3. **Taxa geral:** na última hora, se há `>= 10` disparos e `>= 50%` deles são falha total ⇒ `ops_emit('error','health','Taxa de falha de disparo alta', {total, falhas, percentual}, null, 'disp_taxa:' || <hora SP>)`.
 4. **Evolution instável:** `>= 2` instâncias com `status = 'error'` e `updated_at > now() - interval '30 minutes'` ⇒ `ops_emit('error','health','Evolution API instável', {instancias (nº), exemplo_erro (limpo, 160)}, null, 'evolution:' || <hora SP>)`.
 Retorna `jsonb` com as contagens por checagem.

**c) Resumo diário.** `ops_daily_summary() returns jsonb` + cron `ops_daily_summary` em `0 11 * * *`. Emite `ops_emit('business','admin','Resumo diário', <detail>, null, 'daily:' || <dia SP>)`. Janela: últimas 24 h. Valores **já formatados como texto** em pt-BR dentro do SQL (para caber em ≤ 14 chaves): 
 - `usuarios`: `"33 no total · +2 novos · 2 confirmaram"`
 - `trials`: `"5 ativos · 1 vence em 24h"` (`account_status = 'trialing'`, `trial_ends_at`)
 - `vendas`: `"2 · R$ 97,78 (bruto)"` (de `webhook_events`; use `to_char(valor, 'FM999G999G990D00')` e troque para vírgula/ponto de milhar pt-BR com `translate` ou formate no formatador TypeScript: **prefira** emitir `vendas_qtd` e `vendas_valor` numéricos e deixar o formatador montar), 
 - `reembolsos`: `"1 reembolso · 0 chargebacks · 2 recusas"`
 - `ofertas`: `"131 recebidas"`; `bots`: `"3 ativos"`
 - `disparos`: `"131 (90 ok · 38 parciais · 3 erro)"`
 - `alertas`: `"0 críticos · 5 erros"` (de `ops_events` com `created_at` na janela, **excluindo** `fingerprint like 'k:amostra:%'`)
 - `whatsapp`: `"4 conectadas de 9 (2 com erro)"`
 - `cron`: `"3 falhas nas últimas 24 h"` (de `cron.job_run_details`, `status = 'failed'`)
 - `banco`: `"42 MB de 500 · 13 conexões de 60"`
 - `entrega`: `"2 alertas pendentes de entrega"` (de `ops_events` com `notified_at is null` e severidade `critical/error/business`, últimas 24 h)
 Cada bloco de métrica é protegido (se uma consulta falhar, aquele campo some e o resto segue).

Todos com `revoke all ... from public, anon, authenticated`; `drop trigger if exists` antes do `create trigger`; `cron.schedule` com nome (idempotente).

### 2. Rollback e teste manual
- Rollback: `cron.unschedule` dos 2 jobs (protegido), `drop trigger if exists trg_ops_whatsapp_down on public.whatsapp_instances`, `drop function if exists` das 3 funções, em ordem segura.
- Teste manual (`supabase/tests/manual/20261015000000_ops_resumo_disparos_whatsapp.test.sql`), estilo dos existentes com "espera ...": trigger e 2 crons presentes; privilégios (nenhuma executável por anon/authenticated); `select public.ops_healthcheck_dispatch()` retorna jsonb; `select public.ops_daily_summary()` (avisa que gera 1 alerta real, com dedupe diário); bloco `do $$ ... raise exception ... $$` revertido que muda a instância de teste de `connected` para `error` e confere o evento.

### 3. Formatação (`supabase/functions/_shared/ops/format.ts` + `format_test.ts`)
Acrescente à tabela de campos (rótulos pt-BR): `usuarios` "Usuários", `trials` "Trials", `vendas` "Vendas" (ou monte de `vendas_qtd`/`vendas_valor`), `reembolsos` "Reembolsos e recusas", `ofertas` "Ofertas", `bots` "Bots", `disparos` "Disparos", `alertas` "Alertas (24 h)", `whatsapp` "WhatsApp", `cron` "Cron", `banco` "Banco", `entrega` "Entrega de alertas", `falhas` "Falhas", `ultimo_erro` "Último erro", `canais` "Canais com falha" (texto), `quantidade` (se já existir, mantenha o rótulo atual), `total` "Total", `percentual` (formato `85%`), `instancias` "Instâncias", `exemplo_erro` "Exemplo de erro". Para `title === 'Resumo diário'`: sem linha de resumo (a lista de campos é o corpo), e o valor de `vendas` formatado com BRL quando vier numérico. Testes: um por mensagem nova (Resumo diário completo, Disparos falhando, Canal com falha persistente, Taxa de falha alta, Evolution API instável, WhatsApp desconectado e com erro), com valores reais, omissão de campos vazios e escape de markdown num `ultimo_erro` malicioso (`[x](https://evil)`).

### 4. Docs e contratos
- `docs/OPS_ALERTS.md`: 7 novas linhas na tabela de alertas, uma seção "Resumo diário e vigia do vigia" (se o resumo das 08h não chegar, a central parou), regras de dedupe/horário, e a limitação: falha parcial em um canal NÃO gera alerta (só falha total ou canal que nunca entrega).
- `scripts/check-ops-alerts.mjs`: contratos da nova migration (trigger, 2 crons, revokes, `exception when others`, ausência de `alter database` e `current_setting('app.`).

## Verificação (colar no relatório)
`deno check --no-config` nos arquivos alterados; `deno test --no-config --allow-env supabase/functions/_shared/ops/ supabase/functions/notify/ supabase/functions/cakto-webhook/ops_test.ts` (tudo verde, contagem); `node scripts/check-ops-alerts.mjs`; `git diff origin/main --stat`; grep de travessão nas linhas adicionadas (nenhum).

## Review Focus
1. Nenhuma checagem pode gerar alerta para falha parcial normal nem para o usuário de teste já conhecido sem critério (verifique a lógica de `>= 3` disparos e `success = 0`).
2. Trigger do WhatsApp fail-open; não dispara na carga inicial nem em `qrcode -> error`.
3. Resumo diário: nenhuma consulta pesada (usa índices existentes; `history`, `ops_events` com janelas de 24 h), campos independentes, sem dados pessoais além de contagens.
4. Os crons fora do minuto 0.
