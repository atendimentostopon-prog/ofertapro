# Alertas operacionais (Telegram + Discord)

Spec: `docs/superpowers/specs/2026-10-13-ops-alerts-design.md`.
Estado: Fase 1 (central + negócio) e Fase 2 (saúde e erros) entregues. Fase 3 (segurança, Sentry, resumo diário) ainda não implementada.

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
| Telegram conectado, WhatsApp conectado, Bot ativado, Primeira oferta recebida (exige a migration `20261014010000_ops_user_milestones.sql`) | business | Discord `#negocio` + Telegram |
| Resumo diário (por volta das 08h BRT, 08:03; exige a migration `20261015000000_ops_resumo_disparos_whatsapp.sql`) | business | Discord `#negocio` + Telegram |
| Disparos falhando (3 ou mais disparos na última hora e nenhum entregue) | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |
| Canal com falha persistente (10 ou mais falhas em 24 h e nenhuma entrega) | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |
| Taxa de falha de disparo alta (10 ou mais disparos na hora, 50% ou mais com falha total) | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |
| Evolution API instável (2 ou mais instâncias em erro nos últimos 30 min) | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |
| WhatsApp desconectado | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |
| WhatsApp com erro | error | Discord `#erros` (Telegram a partir de 5 ocorrências) |


### Silêncio noturno do Telegram

Entre 22h e 8h (Brasília, UTC-3 fixo) só alertas `critical` chegam ao Telegram. `business` e `error` seguem normalmente para o Discord, então nada se perde; só o celular deixa de tocar de madrugada. A regra fica em `supabase/functions/_shared/ops/routing.ts` (`isQuietHours`, `QUIET_START_HOUR`, `QUIET_END_HOUR`). Para mudar o horário, altere as constantes e faça o deploy da função `notify`.

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
| `canal_nome`, `identificador`, `membros`, `canais_telegram` | Canal, Identificador, Membros, Canais Telegram | texto e números |
| `numero_whatsapp`, `perfil_whatsapp`, `instancia` | Número, Perfil, Instância | número como `(11) 98765-4321` |
| `grupos_origem`, `canais_destino`, `marketplaces` | Grupos de origem, Canais de destino, Marketplaces | contagens; `Shopee, Mercado Livre` |
| `produto`, `marketplace`, `preco`, `preco_original`, `desconto` | Produto, Marketplace, Preço, Preço original, Desconto | `R$ 89,90`; `35%` |
| `minutos_ate_primeira_oferta` | Desde a ativação do bot | `45 min`, `2 h 15 min`, `1 d 3 h` |
| `ip`, `pais`, `user_agent`, `rota` | IP, País, Navegador / cliente, Rota | texto |
| `usuarios`, `trials`, `reembolsos`, `ofertas`, `bots`, `disparos`, `alertas`, `whatsapp`, `cron`, `banco`, `entrega` | Usuários, Trials, Reembolsos e recusas, Ofertas, Bots, Disparos, Alertas (24 h), WhatsApp, Cron, Banco, Entrega de alertas | texto já formatado pelo banco (Resumo diário) |
| `vendas_qtd` (+ `vendas_valor`) | Vendas | `2 · R$ 97,78 (bruto)`; o valor é numérico e o formatador monta o texto |
| `falhas`, `ultimo_erro`, `canais_com_falha`, `quantidade`, `total`, `percentual`, `instancias`, `exemplo_erro` | Falhas, Último erro, Canais com falha, Quantidade, Total, Percentual, Instâncias, Exemplo de erro | `86%` para percentual; o restante é texto ou número |
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

## Saúde (Fase 2)

Migration `supabase/migrations/20261014000000_ops_phase2_health.sql` (rollback em `supabase/rollbacks/20261014000000_ops_phase2_health_rollback.sql`, teste em `supabase/tests/manual/20261014000000_ops_phase2_health.test.sql`). O job `ops_healthcheck` roda a cada 5 minutos no `pg_cron` (agenda `2-59/5 * * * *`, minutos 2, 7, 12..., para fugir do minuto cheio onde os jobs de produção já estouram "job startup timeout") e cada checagem é isolada: uma falha não impede as outras.

**Lembrete por hora:** cron falhando, cron parado, bots com erro, conexões e disco usam chave de deduplicação horária (fuso America/Sao_Paulo). Enquanto a condição persiste, há 1 aviso por hora; uma condição nova (outro job, por exemplo) não fica escondida atrás de uma antiga. Os títulos não têm números variáveis (a quantidade vai só no detalhe).

| Alerta | Severidade / categoria | Quando |
|---|---|---|
| Job do cron falhou: `<job>` | error / cron | alguma execução com `status = 'failed'` nos últimos 15 min, exceto "job startup timeout" |
| Cron com falhas de inicialização | error / cron | 5 ou mais falhas "job startup timeout" nas últimas 3 horas (agregado, lista até 8 jobs) |
| Cron parado: `<job>` | error / cron | sem execução bem-sucedida dentro do intervalo máximo: `expire_trials` e `ops_trial_expiring_scan` 3 h. (O job `aflyo_expire_offers`, que também era vigiado, foi removido em 2026-10-14 junto com a expiração de ofertas; o healthcheck só vigia jobs ativos.) Job que nunca rodou ou foi criado há menos que o intervalo não alerta |
| Bots com erro | error / bot | `bot_configs` com `status = 'active'` e `last_error` preenchido (bots `pending` ou `paused` nunca alertam; `last_seen_at` não é usado) |
| Conexões do banco acima de 80% | error / health | conexões de clientes em `pg_stat_activity` (`backend_type = 'client backend'`) acima de 80% de `max_connections` |
| Banco perto do limite de disco | error / health | `pg_database_size` acima de 400 MB (limite Free: 500 MB) |
| Trial expirou / Assinatura expirou / Conta cancelada | business / billing | trigger em `profiles` quando `account_status` passa a `expired` ou `canceled` (nunca de nulo para `trialing`/`active`); um alerta por transição |

**Reenvio:** `ops_retry_undelivered()` roda dentro do healthcheck e reenvia eventos que nenhum canal recebeu: até 4 eventos por execução (`for update skip locked`, então execuções sobrepostas não reenviam o mesmo), `critical`/`error`/`business` com `notified_at` nulo, criados entre 2 minutos e 24 horas atrás, no máximo 3 tentativas com 5 minutos entre elas (`notify_attempts`, `last_notify_attempt_at`). Sem a chave no Vault nada é reenviado e nenhuma tentativa é contada.

**Limitações conhecidas:**

- Um reembolso ou chargeback gera o aviso do webhook e, depois, "Conta cancelada" pelo trigger de conta.
- O healthcheck só enxerga jobs `active` em `cron.job`.
- Ainda não há evento de "voltou ao normal".
- JSON malformado enviado por um cliente em `public-api` e nas functions `api-key-*`, `enrich-product` e `evolution-*` hoje vira 500 e portanto dispara alerta 5xx sem causa no detalhe (o tratamento do handler está fora do escopo; correção futura: devolver 400).
- O detalhe de um alerta repetido mostra a primeira ocorrência.

**Silenciar um job:** a checagem "Cron parado" só considera jobs ativos; para silenciar um job desativado: `update cron.job set active = false where jobname = '<job>';`. Para parar o healthcheck inteiro: `select cron.unschedule('ops_healthcheck');`.

**Uptime Kuma:** crie um monitor HTTP para `https://zuqaccivowbzdfrpgekz.supabase.co/rest/v1/rpc/ops_health?apikey=<publishable>` esperando HTTP 200 e corpo contendo `"ok":true`. `ops_health` não lê nenhuma tabela e é executável por `anon`.

### Erros de Edge Function (`withAlerts`)

O helper `supabase/functions/_shared/ops/with-alerts.ts` envolve o `serve(...)` e avisa quando a function responde 5xx ou lança exceção (categoria `edge_error`; a resposta e a exceção seguem idênticas, o alerta é fail-open). A emissão é assíncrona (`EdgeRuntime.waitUntil`), com fallback de espera limitada a 1,5 s quando `waitUntil` não existe. Há throttle de 1 aviso por 10 s por function e tipo (exceção ou 5xx) em cada instância. `critical` vale para exceções e também para respostas 5xx. O detalhe leva só função, método, rota (sem query string), mensagem e tipo do erro, nunca cabeçalhos nem corpo. Erros repetidos agrupam por título e avisam nas ocorrências 1, 5, 25 e 100.

- Cobertas (severidade `critical` para exceções em `public-api`, `cakto-create-payment`, `cakto-cancel-subscription` e `evolution-webhook`): `public-api`, `enrich-product`, `evolution-webhook`, `evolution-groups-select`, `evolution-groups-sync`, `evolution-instance-create`, `evolution-instance-delete`, `evolution-instance-status`, `api-key-generate`, `api-key-reveal`, `api-key-revoke`, `cakto-create-payment`, `cakto-cancel-subscription`, `cleanup-storage`.
- `cakto-webhook` tem alertas próprios: falha ao gravar `webhook_events` (critical / billing, "Webhook Cakto não gravou o evento") e secret inválido com no máximo 1 alerta por 60 s por instância.
- Excluídas de propósito: `admin-api` (tem tratamento próprio de erros), `send-email` e `email-hook` (caminho de e-mail do Auth, não pode ganhar dependência nova) e `notify` (não alerta sobre si mesmo).

## Resumo diário e vigia do vigia

Migration `supabase/migrations/20261015000000_ops_resumo_disparos_whatsapp.sql` (rollback em `supabase/rollbacks/20261015000000_ops_resumo_disparos_whatsapp_rollback.sql`, teste em `supabase/tests/manual/20261015000000_ops_resumo_disparos_whatsapp.test.sql`). Ela não altera `ops_healthcheck()`: cria funções e jobs novos.

**Resumo diário.** O job `ops_daily_summary` roda às `3 11 * * *` (11:03 UTC = 08:03 BRT, fora do minuto cheio; o Brasil não tem horário de verão) e emite 1 alerta `Resumo diário` (business / admin) com as últimas 24 h: usuários, trials, vendas, reembolsos e recusas, ofertas, bots, disparos, alertas, WhatsApp, falhas do cron, banco e alertas pendentes de entrega. Cada métrica é calculada num bloco isolado: se uma consulta falhar, aquela linha some e o resumo sai mesmo assim. Só contagens, sem dados pessoais. Dedupe diário (`daily:YYYYMMDD`).

**Vigia do vigia.** Se o resumo das 08:03 não chegar, a própria central parou (cron, `ops_emit`, Vault, `notify` ou os webhooks). Confira nesta ordem: `select * from cron.job where jobname = 'ops_daily_summary';`, `select * from cron.job_run_details order by start_time desc limit 5;`, `select * from public.ops_events order by created_at desc limit 5;` e `net._http_response`.

**Checagens de disparo e Evolution.** O job `ops_healthcheck_dispatch` roda em `4-59/5 * * * *` (fora do minuto 0), cada checagem isolada:

| Alerta | Regra | Dedupe |
|---|---|---|
| Disparos falhando | por usuário, 3 ou mais linhas em `history` na última hora, soma de `success_count` igual a 0 e soma de `failure_count` maior que 0 | por usuário e hora |
| Canal com falha persistente | por usuário, canal em `failed_channels` em 10 ou mais disparos nas últimas 24 h e nunca em `successful_channels` no período | por usuário e dia |
| Taxa de falha de disparo alta | 10 ou mais disparos na última hora e 50% ou mais com falha total | por hora |
| Evolution API instável | 2 ou mais `whatsapp_instances` com `status = 'error'` atualizadas nos últimos 30 min | por hora |

**WhatsApp caído.** O trigger `trg_ops_whatsapp_down` avisa só quando a instância passa de `connected` para `disconnected` ou `error` (UPDATE de `status`), com 1 aviso por instância e hora (`wa_down:<id>:<hora>`). `qrcode` para `error`, `disconnected` para `error` e a carga inicial não avisam. O texto de erro tem o HTML removido (as respostas de erro da Cloudflare vêm como página) e é cortado em 160 caracteres. O status só é corrigido de forma confiável porque a função `evolution-status-sync` (seção abaixo) reconcilia as instâncias com a Evolution a cada 15 min; antes dela o status podia ficar desatualizado por dias e o aviso não disparava.

**Limitação.** Falha parcial em um canal NÃO gera alerta (70% dos disparos têm alguma falha parcial, quase tudo de um único canal quebrado): só falha total do usuário na hora ou um canal que nunca entrega em 24 h.

## Marcos do usuário

Migration `supabase/migrations/20261014010000_ops_user_milestones.sql` (rollback em `supabase/rollbacks/20261014010000_ops_user_milestones_rollback.sql`, teste em `supabase/tests/manual/20261014010000_ops_user_milestones.test.sql`). Todos são `business` / `bot`, vão para o `#negocio` e o Telegram, e levam nome, e-mail, telefone, plano, fim do trial e link do painel do usuário (`ops_user_snapshot`). Nenhum segredo entra no detalhe.

| Alerta | Sinal | Regra |
|---|---|---|
| Telegram conectado | `channels` com `type = 'telegram'` entra em `status = 'connected'` (INSERT já conectado ou UPDATE vindo de outro status) | 1 aviso por canal (`tg_connected:<id>`); `connected` para `connected` não avisa; reconectar o mesmo canal depois não repete |
| WhatsApp conectado | `whatsapp_instances.status` passa a `connected` (INSERT ou UPDATE) | 1 aviso por instância (`wa_connected:<id>`); `connected_at` nunca é preenchido, por isso o sinal é o status |
| Bot ativado | `bot_configs.status` passa a `active` | só a 1ª ativação do usuário avisa (`bot_started:<user_id>`); reativações apenas somam `occurrences` |
| Primeira oferta recebida | 1º INSERT em `offers` do usuário | 1 aviso por usuário, para sempre (`first_offer:<user_id>`); traz o tempo desde o `Bot ativado` quando esse evento existe |

**Sem retroativo:** ao aplicar a migration, cada usuário que já tem ofertas ganha um evento `k:first_offer:<user_id>` já marcado como notificado (nenhum aviso sai). Isso evita que o TTL das ofertas faça um usuário antigo parecer "sem ofertas" e gere uma "Primeira oferta recebida" falsa. Canais, instâncias e bots que já estão conectados ou ativos também não avisam, porque só a mudança de estado dispara. Um usuário antigo cujo `bot_configs` nunca teve avisos e passa a `active` depois da migration gera 1 "Bot ativado".

**Segurança de operação:** todos os triggers são `AFTER`, `security definer` e fail-open (erro vira `warning` e o INSERT/UPDATE segue). O de `offers` é caminho quente: faz primeiro uma consulta indexada em `ops_events` (usuários que já tiveram oferta saem aqui) e só depois procura outra oferta do usuário por `user_id` (índice `offers_user_created_idx`).

**Limitações conhecidas:**

- "Bot ativado" é a mudança de status em `bot_configs`, não prova que o processo do bot subiu: o bot externo não grava `last_started_at`.
- `bot_configs` criado já com `status = 'active'` por INSERT não dispara (o trigger é só de UPDATE). O fluxo normal cria como `pending` e ativa depois.
- Um canal ou instância que cai e reconecta com outro `id` avisa de novo; o mesmo `id` nunca repete.

**Desligar:**

```sql
drop trigger if exists trg_ops_channel_connected on public.channels;
drop trigger if exists trg_ops_whatsapp_connected on public.whatsapp_instances;
drop trigger if exists trg_ops_bot_started on public.bot_configs;
drop trigger if exists trg_ops_first_offer on public.offers;
```

## Sincronização do status do WhatsApp

**Por quê.** `whatsapp_instances.status` só mudava quando o cliente abria o painel (`evolution-instance-status`) ou quando a Evolution mandava `connection.update` ao `evolution-webhook`. Uma instância podia ficar `connected` por dias com os disparos falhando, e o aviso "WhatsApp desconectado" nunca saía.

**O que roda.** O job `ops_wa_status_sync` (`7-59/15 * * * *`) chama `ops_invoke_wa_status_sync()`, que faz um POST (service role, lida do Vault) na Edge Function `evolution-status-sync`. A cada execução ela confere até 100 instâncias (as menos recentes primeiro, por `last_sync_at`) com `GET /instance/connectionState/<instancia>`; instâncias em `qrcode` (configuração em andamento) são ignoradas.

| Resposta da Evolution | Resultado |
| --- | --- |
| `open` | `connected` (limpa `error_message` e `qr_code`) |
| `close` | consulta de novo após 3 s; só vira `disconnected` se a segunda resposta também for `close` |
| 404 (instância não existe) | `disconnected` |
| `connecting` ou outro estado | sem mudança |
| 401, 403, 5xx, rede ou timeout (8 s) | inconclusivo: não altera nada |

**Regra do inconclusivo.** Uma queda da Evolution nunca marca ninguém como desconectado: sem resposta confiável o status fica como está. Quando o status muda, o espelho em `channels` segue a mesma regra do webhook, e uma falha nele não interrompe a execução. Linhas sem mudança só têm `last_sync_at` atualizado.

**Limite de plano.** O trigger `whatsapp_instances_limit` recusa a volta de `disconnected` para conectado quando passaria do limite de instâncias do plano. Nesse caso a linha conta em `erros` (motivo `limite_de_plano`) e as demais seguem.

**Simulação (dry run).** No SQL Editor: `select public.ops_invoke_wa_status_sync(true);` e leia `net._http_response` pelo id retornado. A simulação consulta a Evolution e lista as mudanças que seriam aplicadas, sem gravar nada. A resposta traz `verificadas`, `sem_mudanca`, `inconclusivas`, `erros` e `mudancas` (8 primeiros caracteres do id, sem dados pessoais).

**Ordem de rollout.** Deploy da function com verificação de JWT (`supabase functions deploy evolution-status-sync`), depois a migration `20261015010000_ops_wa_status_sync_cron.sql`. Se a function ainda não estiver no ar, o cron só falha sem efeito. Na primeira execução real, instâncias que estavam desatualizadas passam a disparar os avisos de queda de uma vez.

**Desligar.** `select cron.unschedule('ops_wa_status_sync');`. Reverter por completo: `supabase/rollbacks/20261015010000_ops_wa_status_sync_cron_rollback.sql`. Teste manual: `supabase/tests/manual/20261015010000_ops_wa_status_sync_cron.test.sql`.

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
- Na primeira aplicação, todo usuário em trial que termina em menos de 24h gera um aviso de uma vez (rajada única). O Discord limita webhooks (HTTP 429), então numa rajada alguns alertas podem não ser entregues; esses eventos são reenviados pelo healthcheck da Fase 2 (até 3 tentativas). Depois disso é no máximo um aviso por usuário.

## Desligar / reverter

- Parar só os avisos de cadastro: `drop trigger if exists trg_ops_signup on auth.users;`
- Parar só os avisos de e-mail confirmado: `drop trigger if exists trg_ops_email_confirmed on auth.users;`
- Parar os avisos de marcos do usuário: veja os 4 `drop trigger` na seção Marcos do usuário.
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

- Timeout nos envios (`fetch`) do `notify` (o `cakto-webhook` não faz `fetch` próprio; a emissão dos alertas das Edge Functions já tem teto de 1,5 s no `withAlerts`).
- Interruptor imediato por tabela (`ops_settings.enabled` lido pelo `ops_emit`).
- Nomes de chaves sensíveis em pt-BR no sanitize (senha, pwd, credential) antes do `withAlerts`.
- Hook de "evento recebido".
- Os contadores `count(*)` em `auth.users` dentro dos triggers de cadastro e de confirmação devem ser trocados por contador ou consulta indexada antes de ~100 mil usuários (e `query_canceled` não é capturado por `exception when others`).
- "Faturamento hoje" soma o valor bruto pago pelo cliente (inclui a taxa de R$ 0,99 e é antes do corte da Cakto) e conta eventos de teste.
