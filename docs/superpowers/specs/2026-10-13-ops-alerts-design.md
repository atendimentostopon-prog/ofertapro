# Central de alertas operacionais (Telegram + Discord)

Data: 2026-10-13
Status: aguardando revisão
Escopo: subsistema novo, entregue em 3 fases

## 1. Objetivo

O operador do Aflyo recebe, em tempo real, no Telegram e no Discord, um aviso de tudo que importa
no produto: negócio (cadastro, venda, cancelamento, reembolso), saúde (Supabase, API, Edge
Functions, cron, bot), erros (back e front) e segurança (abuso, ataque). O operador não precisa
abrir painel para saber que algo aconteceu.

Critérios de sucesso:

- Um cadastro novo aparece no Discord em até 1 minuto.
- Uma Edge Function que lança exceção gera alerta sem que o código da função precise de lógica
  extra além do wrapper.
- Se o Supabase cair, o operador é avisado por um monitor externo (nada interno consegue avisar
  quando o banco está fora).
- O mesmo erro repetido 200 vezes gera 1 mensagem com contagem, não 200.
- Nenhum token de Telegram ou Discord existe no cliente ou no repositório.

Fora de escopo (YAGNI): stack de observabilidade completa (Grafana/Datadog), alertas para os
usuários finais do Aflyo (isso é o produto de disparos, não esta central), roteamento por turno
de plantão.

## 2. Contexto do repositório (verificado)

- Já existe padrão de disparo banco para Edge Function: `public.enqueue_transactional_email`
  (`supabase/migrations/20260901120000_email_log_and_triggers.sql`) usa `net.http_post` com
  `app.service_role_key` e URL em `alter database ... set app.*`, e é `security definer` com
  `revoke ... from public, anon, authenticated`. A central reaproveita esse padrão.
- Cron do banco via `cron.schedule` já é usado (`expire_trials`, `aflyo_expire_offers`, etc.).
- Edge Functions existentes: `cakto-webhook`, `cakto-create-payment`, `cakto-cancel-subscription`,
  `evolution-*`, `public-api`, `admin-api`, `send-email`, `email-hook`, `enrich-product`,
  `api-key-*`, `cleanup-storage`. Código compartilhado fica em `supabase/functions/_shared`.
- Admin já tem área `/monitoring` (Jobs, Erros, Saúde do banco, Logs, Auth) e
  `admin_audit_log` imutável. A central alimenta essa área, não a duplica.
- `SUPABASE_MGMT_TOKEN` (secret) já é usado pela admin-api para logs e advisors.
- Inserção anônima de cliques é deliberada e permite inflação (CLAUDE.md); a detecção de abuso
  precisa tratá-la como sinal, não como bug.

## 3. Arquitetura

```
  triggers/pg_cron (banco) ──┐
  Edge Functions (withAlerts)┼──> ops_emit() ──> ops_events (tabela, dedup)
  front (Sentry) ────────────┤                        │
  UptimeRobot (externo) ─────┘                        ▼
                                          Edge Function `notify`
                                       ┌──────────────┴──────────────┐
                                       ▼                              ▼
                                  Discord (webhooks)           Telegram (bot)
                                  por canal/severidade         chat do operador
```

Uptime e Sentry falam direto com Telegram/Discord (integração nativa deles) e, opcionalmente,
com `notify` via webhook, para ficarem no histórico.

### 3.1 Componentes

**`ops_events` (tabela)**

| coluna | tipo | nota |
|---|---|---|
| id | uuid pk | |
| created_at | timestamptz | default now() |
| severity | text | `critical`, `error`, `business`, `info` (check constraint) |
| category | text | `signup`, `billing`, `edge_error`, `health`, `security`, `admin`, `bot`, `cron` |
| title | text | curto, sem dado sensível |
| detail | jsonb | contexto estruturado, sanitizado |
| user_id | uuid null | opcional, para correlacionar |
| fingerprint | text | hash de severity+category+title normalizado |
| occurrences | int | default 1, incrementa na dedup |
| last_seen_at | timestamptz | atualiza na dedup |
| notified_at | timestamptz null | quando foi entregue |

RLS ligada. Nenhuma policy para `anon`/`authenticated`. Escrita só por `service_role` e pelas
funções `security definer`. Leitura pelo admin via RPC gated por permissão existente de
monitoramento (sem permissão nova). Índices: `(fingerprint, last_seen_at desc)` e
`(created_at desc)`. Retenção: job de limpeza de 30 dias para `info` e 180 dias para o resto,
no mesmo estilo de `prune_old_rows`.

**`ops_emit(severity, category, title, detail, user_id)` (função SQL)**

`security definer`, `revoke` de `public, anon, authenticated`. Faz upsert por `fingerprint`
dentro de uma janela (default 10 min): se existe linha recente, incrementa `occurrences` e
atualiza `last_seen_at`; senão insere. Em seguida chama `net.http_post` para `notify` com o id do
evento, seguindo o padrão de `enqueue_transactional_email`. Regra de falha: **fail-open**. Se o
envio falhar, a operação de negócio que disparou o trigger não pode ser bloqueada (`exception
when others then null` com `raise notice`).

**Edge Function `notify`**

Recebe `{event_id}` (do banco) ou o payload completo (de funções e webhooks externos). Valida
`Authorization` (service role para chamadas internas, segredo compartilhado `NOTIFY_SECRET` para
externos, comparação em tempo constante como no webhook Cakto). Lê as regras de roteamento,
formata a mensagem e entrega. Falha de um canal não impede o outro. Marca `notified_at`.

**Roteamento** (configuração em código, em `_shared/ops/routing.ts`, não em tabela, para ser
versionado e revisável)

| severity | Discord | Telegram |
|---|---|---|
| critical | `#criticos` | sim, sempre |
| error | `#erros` | só se `occurrences >= 5` na janela |
| business | `#negocio` | sim |
| info | `#info` | não |

Regra de dedup na entrega: o primeiro evento da janela é enviado na hora; repetições só geram
nova mensagem quando `occurrences` cruza 5, 25, 100 (mensagem "×N nos últimos 10 min").

**`withAlerts(handler, {name})` (helper em `_shared/ops/`)**

Envolve o handler de cada Edge Function: captura exceção, chama `notify` com severity `error`
(`critical` para `cakto-webhook` e `public-api`), e relança/retorna 500 como hoje. Não altera o
contrato de resposta. Sanitiza: nunca inclui headers, corpo bruto, tokens, e-mail completo
(mascara `a***@dominio.com`) nem chaves.

**`ops-healthcheck` (cron a cada 5 min, via pg_cron chamando função SQL + `notify`)**

Checa, no banco: jobs do `cron.job_run_details` falhando ou sem rodar há mais que 2x o
intervalo; webhooks Cakto em `webhook_events` sem processar; fila/bots com `bot_configs.status`
em erro; conexões e tamanho do banco acima de limite. O que for anormal vira `ops_emit`.
Recuperação também é evento (`info`: "voltou ao normal") para o operador saber que acabou.

**Monitor externo (UptimeRobot ou Better Stack, plano gratuito)**

Pings de 1 min a: app (`app.aflyo.com.br`), landing, `public-api`, `/auth/v1/health` do
Supabase, e a própria função `notify` (heartbeat). Integração nativa Telegram + Discord.
Existe porque uma central interna não avisa quando o interno cai.

**Sentry (front React + admin)**

SDK no `src/` e em `admin/`, `tracesSampleRate` baixo, `beforeSend` removendo PII (e-mail,
tokens, query strings). Integração Discord/Telegram nativa. Atenção: a CSP em enforce
(SEC-6) precisa liberar o domínio de ingestão do Sentry em `connect-src`.

### 3.2 Fontes de evento por fase

**Fase 1: central + negócio**

- Migration: `ops_events`, `ops_emit`, RLS, retenção, `app.notify_url` (config não secreta).
- Edge Function `notify`, `_shared/ops/{routing,format,sanitize}.ts`, testes Deno.
- Triggers: novo `profiles`/`auth.users` (cadastro), mudança em `subscriptions` (ativação,
  cancelamento, reembolso, expiração), trial expirando.
- Hooks no `cakto-webhook` para evento recebido, processado e falhado.
- `scripts/ops-test-alert.mjs` dispara um evento de cada severidade para validar os dois canais.

**Fase 2: saúde e erros**

- `withAlerts` aplicado em todas as Edge Functions.
- `ops-healthcheck` + job pg_cron.
- UptimeRobot configurado (passo manual guiado).
- Alerta de bot desconectado/pausado e disparo com taxa de falha alta (reaproveita
  `useBotStatus`/`bot_configs.status`, lado servidor).

**Fase 3: segurança, front e resumo**

- Sentry no app e no admin.
- Regras de abuso no banco: picos de login falho (`auth` logs via Management API ou
  `auth.audit_log_entries`, que está vazia neste projeto, então a fonte real é o log de Auth da
  Management API), cadastros em rajada por IP/domínio, cliques anômalos por oferta/IP,
  tentativas contra a blocklist (`security_email_blocklist`).
- Alertas do Vercel (deploy falho, Firewall/ataque) via webhook para `notify`.
- Eventos de `admin_audit_log` com ação sensível viram `info`/`business`.
- Resumo diário às 08:00 (America/Sao_Paulo): cadastros, vendas, erros, uptime, top categorias.
- Silenciar categoria: tabela pequena `ops_mutes` (categoria, até quando), consultada pelo
  `notify` antes de entregar (o evento continua gravado em `ops_events`), e comando pelo bot do
  Telegram (`/silenciar billing 2h`).

## 4. Segurança

- Tokens do Telegram, webhooks do Discord e `NOTIFY_SECRET` ficam somente em secrets das Edge
  Functions (e em `app.*` quando o banco precisa só da URL, nunca de segredo). O padrão de
  `app.service_role_key` aplicado à mão no SQL Editor é mantido; nada disso é versionado.
- Webhooks do Discord são credenciais: quem os tem posta no canal. Rotacionar se vazarem.
- `ops_events` nunca recebe corpo bruto de request, headers, tokens, chaves de bot/Evolution, nem
  dados de cartão. `sanitize.ts` é a única porta de entrada e tem teste.
- Mensagens para o operador mascaram e-mail por padrão; `user_id` é suficiente para investigar.
- `ops_emit` e `notify` não são expostos como RPC público (`revoke`, sem policy).
- Nenhum uso de `service_role` para contornar RLS: a leitura do admin passa por RPC gated.
- Cliente (`VITE_*`) não recebe nada desta central, exceto o DSN público do Sentry (público por
  natureza).
- Fail-open nos triggers: alerta nunca pode derrubar cadastro ou pagamento.

## 5. Tratamento de erros

- Canal de entrega fora do ar: tenta o outro canal; evento permanece com `notified_at` nulo e o
  `ops-healthcheck` reenvia pendências antigas (até 3 tentativas), registrando falha de entrega
  como `error`.
- `notify` fora do ar: banco continua gravando `ops_events`; reenvio pelo healthcheck.
- Tempestade de eventos: teto global (ex.: 30 mensagens/min); acima disso, uma única mensagem
  "N eventos suprimidos, ver admin".

## 6. Testes

- Deno: `sanitize` (PII/segredos removidos), `routing` (matriz de severidade), `format`, dedup
  por fingerprint, validação de segredo.
- SQL manual em `supabase/tests/manual/`: `ops_emit` dedup e janela, RLS (anon/authenticated sem
  acesso), fail-open do trigger com `notify_url` ausente.
- `scripts/ops-test-alert.mjs`: smoke ponta a ponta de cada severidade para os dois canais.
- Checklist manual por fase em produção: provocar cada fonte uma vez (cadastro de teste, erro
  forçado em função de teste, derrubar o ping) e conferir os dois canais.

## 7. Entrega e rollout

- Migrations novas passam por revisão e aplicação manual pelo operador (regra do projeto: nunca
  direto em produção). O deploy das Edge Functions segue o fluxo já usado (`supabase login`).
- Cada fase é independente e reversível: remover o trigger (`drop trigger ...`) desliga a fonte;
  esvaziar `app.notify_url` desliga toda a entrega sem tocar no negócio.
- Documentação: `docs/OPS_ALERTS.md` (arquitetura, secrets, como silenciar, runbook de
  "recebi X, e agora?") e atualização do guia de monitoramento do admin.

## 8. Pré-requisitos do operador

1. Bot no Telegram (@BotFather), obter `TELEGRAM_BOT_TOKEN` e o `chat_id` do operador.
2. Servidor Discord com canais `#criticos`, `#erros`, `#negocio`, `#info` e um webhook por canal.
3. Conta gratuita no UptimeRobot (ou Better Stack) e projeto no Sentry (fase 3).
4. Secrets no Supabase: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_CRITICAL`,
   `DISCORD_WEBHOOK_ERRORS`, `DISCORD_WEBHOOK_BUSINESS`, `DISCORD_WEBHOOK_INFO`, `NOTIFY_SECRET`.

## 9. Decisões em aberto (a confirmar na revisão)

- Monitor externo: UptimeRobot (mais simples) ou Better Stack (alertas mais ricos). Default:
  UptimeRobot.
- Resumo diário às 08:00 de Brasília. Default adotado.
- Limite para repetição virar Telegram (`error`): 5 ocorrências em 10 min. Default adotado.
