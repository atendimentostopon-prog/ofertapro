# Alertas operacionais (Telegram + Discord)

Spec: `docs/superpowers/specs/2026-10-13-ops-alerts-design.md`.
Estado: Fase 1 (central + negócio). Fases 2 e 3 (saúde, erros em todas as functions, uptime, segurança, Sentry, resumo diário) ainda não implementadas.

## Como funciona

```
trigger/cron (banco) ─┐
Edge Functions ───────┴─> ops_emit() ─> ops_events ─(pg_net)─> notify ─> Discord / Telegram
```

- `ops_emit` deduplica: mesmo evento em 10 min vira 1 linha com contagem. Só notifica na 1ª ocorrência e nas de número 5, 25 e 100.
- Com `dedupe_key` o evento é único para sempre (cadastro, trial).
- Alertas são fail-open: se algo falhar, o cadastro ou o pagamento continuam normalmente.

## O que alerta hoje

| Evento | Severidade | Destino |
|---|---|---|
| Novo cadastro | business | Discord `#negocio` + Telegram |
| Venda aprovada, renovação, assinatura criada/cancelada, reembolso, chargeback, compra/renovação recusada | business | Discord `#negocio` + Telegram |
| Trial termina em menos de 24h | business | Discord `#negocio` + Telegram |
| Webhook da Cakto falhou ao processar | critical | Discord `#criticos` + Telegram |
| Webhook da Cakto com secret inválido | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |

## Configuração (uma vez)

1. **Telegram:** no @BotFather envie `/newbot`, guarde o token. Abra o bot e envie `/start`. Obtenha o `chat_id` com `https://api.telegram.org/bot<TOKEN>/getUpdates` (rode no seu navegador local; não cole o token em chats).
2. **Discord:** crie os canais `#criticos`, `#erros`, `#negocio`, `#info`. Em cada um: Editar canal, Integrações, Webhooks, Novo webhook, Copiar URL.
3. **Secrets do Supabase** (CLI logada no projeto `zuqaccivowbzdfrpgekz`):

```bash
supabase secrets set TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=...
supabase secrets set DISCORD_WEBHOOK_CRITICAL=... DISCORD_WEBHOOK_ERRORS=... DISCORD_WEBHOOK_BUSINESS=... DISCORD_WEBHOOK_INFO=...
```

4. O segredo `app_service_role_key` já existe no Vault (recurso de e-mails). `ops_emit` lê a chave de lá e tem a URL do `notify` como constante na própria função. Se a chave for rotacionada, atualize com `select public.set_app_service_role_key('<nova chave>');` (função que já existe em produção).

## Rollout (nesta ordem)

1. Setar os secrets (acima).
2. `supabase functions deploy notify`
3. Aplicar `supabase/migrations/20261013000000_ops_events_and_emit.sql` no SQL Editor e rodar `supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql`.
4. `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/ops-test-alert.mjs` e conferir os 4 canais. Atenção: OK só prova que `ops_emit` devolveu um id; a entrega real é confirmada nos canais e com um cadastro real.
5. Aplicar `supabase/migrations/20261013000100_ops_business_sources.sql` e rodar o teste manual correspondente.
6. `supabase functions deploy cakto-webhook --no-verify-jwt`
7. Fazer um cadastro de teste e conferir o aviso no `#negocio` e no Telegram.

Sobre o flag de JWT:

- `cakto-webhook` DEVE ser implantada com `--no-verify-jwt`: a Cakto não envia JWT e, sem o flag, o gateway do Supabase responde 401 a todo webhook de pagamento e clientes que pagaram ficam sem acesso. A autenticidade é checada pelo `secret` dentro da function.
- `notify` é implantada SEM o flag (`supabase functions deploy notify`): ela é chamada pelo `pg_net` com a service role key, como o `send-email`.

Verificação pós-deploy do `cakto-webhook`:

```bash
curl -i -X POST <url>/cakto-webhook -H "Content-Type: application/json" -d '{"secret":"x","event":"ping","data":{}}'
```

Esperado: status 401 com o corpo de texto simples `Unauthorized` da própria function. Se vier um JSON de erro do gateway (por exemplo `Invalid JWT`), o flag foi esquecido: reimplante com `--no-verify-jwt`.

## Pontos de atenção na primeira aplicação

- O segredo `app_service_role_key` precisa existir no Vault (confira com `select exists (select 1 from vault.secrets where name = 'app_service_role_key');`). Sem ele os eventos são gravados em `ops_events` mas não notificados.
- Aplique as duas migrations com o mesmo papel no SQL Editor, para que `ops_emit` e `ops_on_signup` tenham o mesmo dono. Se os donos forem diferentes, a chamada do trigger a `ops_emit` falha com "permission denied" e vira apenas um warning (alerta de cadastro some em silêncio).
- Na primeira aplicação, todo usuário em trial que termina em menos de 24h gera um aviso de uma vez (rajada única). O Discord limita webhooks (HTTP 429), então numa rajada alguns alertas podem não ser entregues; esses eventos ficam deduplicados para sempre e não são reenviados até a Fase 2. Depois disso é no máximo um aviso por usuário.

## Desligar / reverter

- Parar só os avisos de cadastro: `drop trigger if exists trg_ops_signup on auth.users;`
- Não há interruptor no nível do banco na Fase 1 (veja `ops_settings.enabled` em Próximas fases).
- Interruptor imediato (qualquer um dos dois):
  - `supabase secrets unset TELEGRAM_BOT_TOKEN TELEGRAM_CHAT_ID DISCORD_WEBHOOK_CRITICAL DISCORD_WEBHOOK_ERRORS DISCORD_WEBHOOK_BUSINESS DISCORD_WEBHOOK_INFO` (o `notify` passa a reportar tudo como ignorado);
  - `supabase functions delete notify`.
- Reverter tudo:
  1. Rodar o rollback SQL `supabase/rollbacks/20261013000000_ops_alerts_rollback.sql`.
  2. Reimplantar a versão anterior do `cakto-webhook` (`git checkout` da main anterior ao merge e `supabase functions deploy cakto-webhook --no-verify-jwt`).
  3. Apagar a function `notify` (`supabase functions delete notify`).
  4. Remover os secrets (`supabase secrets unset ...` acima).

## Diagnóstico

| Sintoma | Onde olhar |
|---|---|
| Evento gravado mas sem mensagem | `select * from net._http_response order by created desc limit 5;` (resposta do `notify`); logs da function `notify` |
| `notify` responde 401 | Segredo `app_service_role_key` do Vault diferente da service role atual; atualize com `select public.set_app_service_role_key('<nova chave>');` |
| `notify` responde 502 | Webhook do Discord revogado ou token do Telegram errado; rodar o smoke e ver qual canal falha |
| Nenhum evento novo | `select * from public.ops_events order by created_at desc limit 5;` e `raise warning` de `ops_emit` nos logs do Postgres |
| Notice `[ops_emit] app_service_role_key nao configurado no Vault` | Causa: segredo ausente no Vault. Ação: criar com `select public.set_app_service_role_key('<chave>');` |
| Alerta de cadastro não chega, mas há linhas novas em ops_events | warnings do Postgres ('[ops_on_signup]', '[ops_emit]'), dono das funções, e a seção Pontos de atenção |

## Segurança

- Tokens e webhooks existem apenas como secrets das Edge Functions. Webhook do Discord é credencial: se vazar, apague e recrie.
- `ops_events` nunca recebe headers, corpo bruto, chaves ou cartão. Tudo passa por `sanitizeDetail` (e-mail mascarado, chaves sensíveis redigidas, tamanho limitado).
- `ops_events` tem RLS ligada e nenhuma policy; `ops_emit` só executa para `service_role`.
- Check automático: `npm run check:ops-alerts`.

## Próximas fases (pendências conhecidas)

- Alertas de expiração de assinatura/trial feitos por cron (hoje só chegam via webhook da Cakto).
- Timeout nos envios (`fetch`) do `notify` e do `cakto-webhook`.
- Interruptor imediato por tabela (`ops_settings.enabled` lido pelo `ops_emit`).
- Reenvio de eventos com `notified_at is null`.
- Limitação (throttle) do alerta de secret inválido do `cakto-webhook`.
- Nomes de chaves sensíveis em pt-BR no sanitize (senha, pwd, credential) antes do `withAlerts`.
- Alerta quando a gravação em `webhook_events` falha no `cakto-webhook`.
- Hook de "evento recebido".
