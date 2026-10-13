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
| E-mail confirmado (exige a migration `20261013000200_ops_rich_messages.sql`) | business | Discord `#negocio` + Telegram |
| Venda aprovada, renovação, assinatura criada/cancelada, reembolso, chargeback, compra/renovação recusada | business | Discord `#negocio` + Telegram |
| Trial termina em menos de 24h | business | Discord `#negocio` + Telegram |
| Webhook da Cakto falhou ao processar | critical | Discord `#criticos` + Telegram |
| Webhook da Cakto com secret inválido | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |

## Mensagens

Cada alerta é montado por `supabase/functions/_shared/ops/format.ts` a partir das chaves do `detail`. Rótulos em pt-BR, valores formatados (R$, telefone, data em America/Sao_Paulo), e-mail e telefone completos. Chaves vazias são omitidas e chaves desconhecidas aparecem depois das conhecidas, com o nome humanizado.

| Chave | Rótulo | Formato |
|---|---|---|
| `nome`, `email`, `telefone` | Nome, E-mail, Telefone | telefone BR como `(11) 98765-4321` |
| `origem` | Origem | `email` = E-mail e senha, `google` = Google |
| `email_confirmado` | Confirmação | Confirmado / Aguardando confirmação |
| `trial_termina` | Trial termina | `20/10 às 12:00` |
| `confirmou_em_min` | Confirmou em | `4 min`, `1 h 20 min`, `< 1 min` |
| `onboarding_passo` | Onboarding | `passo 1 de 4` |
| `horas_restantes` | Restam | `18 h` ou `45 min` |
| `dias_de_uso`, `bot_status`, `canais` | Dias de uso, Bot, Canais | texto |
| `plano`, `ciclo` | Plano, Ciclo | Pro, Starter, Business (enterprise), Free; Mensal, Anual |
| `valor`, `faturamento_hoje` | Valor, Faturamento hoje | `R$ 48,89` |
| `forma_pagamento`, `parcelas` | Pagamento, Parcelas | Cartão, Pix, Boleto; `3x` |
| `pedido`, `oferta`, `evento` | Pedido, Oferta, Evento | texto |
| `cliente_nome`, `cliente_email`, `cliente_telefone` | Cliente, E-mail do cliente, Telefone do cliente | texto |
| `acesso`, `motivo`, `erro`, `acao` | Acesso, Motivo, Erro, O que fazer | texto |
| `vendas_hoje` | Vendas hoje | número |
| `ip`, `pais`, `user_agent`, `rota` | IP, País, Navegador / cliente, Rota | texto |
| `painel` | (link) | só `https://admin.aflyo.com.br/...` vira link: título do embed no Discord e "Abrir no painel" no Telegram; qualquer outro valor aparece como texto simples |

`cadastro_numero`, `cadastros_hoje`, `confirmaram_hoje` e `taxa_confirmacao_7d` não são campos: entram na linha-resumo logo abaixo do título. Limites: Telegram até 4000 caracteres (corta por linha), Discord até 15 campos e embed abaixo de 5500 caracteres.

Exemplos (Telegram):

```
🟢 Novo cadastro
Cadastro nº 128 · 7 hoje
Nome: Ana Silva
E-mail: ana@exemplo.com
Telefone: (11) 98765-4321
Origem: Google
Confirmação: Aguardando confirmação
Trial termina: 20/10 às 12:00
signup · 13/10/2026 12:00
Abrir no painel
```

```
🟢 E-mail confirmado
5 confirmaram hoje · confirmação em 7 dias: 62,5%
Nome: Ana Silva
E-mail: ana@exemplo.com
Confirmou em: 4 min
Onboarding: passo 1 de 4
```

```
🟢 Trial termina em menos de 24h
Nome: Ana Silva
Telefone: (11) 98765-4321
Trial termina: 14/10 às 06:30
Restam: 18 h
Dias de uso: 6
Bot: ativo
Canais: 2
```

```
🟢 Venda aprovada
Pro mensal · R$ 48,89 · hoje: 4 vendas · R$ 1.234,50
Plano: Pro
Valor: R$ 48,89
Pagamento: Cartão
Parcelas: 3x
Cliente: Ana Silva
Acesso: liberado, bot retomado
```

```
🟢 Reembolso
Starter mensal · R$ 19,90
Motivo: solicitado pelo cliente
Acesso: revogado e bot pausado
```

```
🔴 Webhook Cakto falhou: refund
Evento: refund
Pedido: ord_9
Erro: profiles by id: timeout
O que fazer: Verifique o webhook e reprocesse o evento em Cakto > Webhooks no painel admin
```

```
🟠 Webhook Cakto com secret inválido
IP: 203.0.113.9
País: BR
Navegador / cliente: curl/8.0
Rota: /cakto-webhook
```

Requisitos: o alerta "E-mail confirmado" e os campos ricos de cadastro e trial dependem da migration `supabase/migrations/20261013000200_ops_rich_messages.sql`. Sem ela as mensagens continuam funcionando, só com menos campos. Os campos de cobrança vêm do próprio `cakto-webhook` (deploy da function).

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
8. Migration 3 (mensagens ricas): aplicar `supabase/migrations/20261013000200_ops_rich_messages.sql` no SQL Editor, com o mesmo papel das anteriores, e rodar `supabase/tests/manual/20261013000200_ops_rich_messages.test.sql`. Verificações:

   ```sql
   -- 1) trigger existe (espera 1 linha)
   select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'trg_ops_email_confirmed';
   -- 2) privilégios (espera false, false, true)
   select has_function_privilege('anon', 'public.ops_sales_today()', 'execute'),
          has_function_privilege('authenticated', 'public.ops_on_email_confirmed()', 'execute'),
          has_function_privilege('service_role', 'public.ops_sales_today()', 'execute');
   -- 3) vendas do dia (espera jsonb com "vendas" e "faturamento")
   select public.ops_sales_today();
   ```

   Rollback: `supabase/rollbacks/20261013000200_ops_rich_messages_rollback.sql`. O `cakto-webhook` precisa ser reimplantado (`--no-verify-jwt`) para incluir "vendas hoje" nas vendas.

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
- Parar só os avisos de e-mail confirmado: `drop trigger if exists trg_ops_email_confirmed on auth.users;`
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
- `ops_events` nunca recebe headers, corpo bruto, chaves ou cartão. Tudo passa por `sanitizeDetail` com `keepEmails`: chaves sensíveis, JWT, Bearer, tokens do Telegram e webhooks do Discord são sempre redigidos e o tamanho é limitado. O e-mail NÃO é mascarado no detalhe (decisão do operador em 2026-10-13); só o título do alerta continua com e-mail mascarado.
- Dados pessoais (LGPD): e-mail e telefone completos de usuários e clientes vão para o Discord, o Telegram e `ops_events.detail` por decisão do operador, porque os canais são privados. Mantenha os canais restritos à equipe e não os compartilhe.
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
