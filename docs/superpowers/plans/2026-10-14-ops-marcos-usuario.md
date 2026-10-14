# Alertas de marcos do usuário (Telegram, WhatsApp, bot e primeira oferta)

> Para agentes: este plano é a fonte de verdade. Contexto: central de alertas descrita em `docs/OPS_ALERTS.md` e `docs/superpowers/specs/2026-10-13-ops-alerts-design.md`.

**Objetivo:** avisar o operador (Discord e Telegram, pelo `ops_emit` e `notify`) quando um usuário: (1) conecta um canal Telegram, (2) conecta o WhatsApp, (3) ativa o bot pela primeira vez, (4) recebe a primeira oferta.

## Decisões do operador (2026-10-14)

1. "Conectar o Telegram" = **canal Telegram passando a `connected`** (tabela `channels`, `type = 'telegram'`). Não alertar sobre a conta/sessão Telegram.
2. "Bot começou a rodar" = **`bot_configs.status` passando a `'active'`**, **somente a primeira ativação do usuário** (reativações não avisam).
3. Sem o extra de "ativou e não recebeu oferta em 24h".
4. E-mail e telefone **completos** nas mensagens (decisão anterior, LGPD aceita). Segredos nunca.
5. Sem alerta retroativo: usuários que já têm ofertas, canais ou bot ativo não disparam nada ao aplicar a migration.

## Restrições globais

- pt-BR, **nunca travessão (em dash)** em texto ao operador; segredos só em Vault/secrets; nunca ler `.env`.
- Padrão de banco de produção: `ops_emit` (já existente) lê o Vault e tem a URL do `notify` constante. **Não** usar `alter database ... set`.
- Funções novas: `security definer`, `set search_path = public`, `revoke all ... from public, anon, authenticated`. Triggers **AFTER**, **fail-open** (bloco `begin ... exception when others then raise warning ... end` em volta de toda a lógica; nunca impedem INSERT/UPDATE).
- `ops_emit(p_severity, p_category, p_title, p_detail jsonb, p_user_id uuid, p_dedupe_key text)`; severidade `business`; categorias válidas: `signup, billing, edge_error, health, security, admin, bot, cron`.
- Use `jsonb_strip_nulls(jsonb_build_object(...))` e mantenha **no máximo 14 chaves** por detail (o sanitizador guarda 20).
- Verificação: `deno check` e `deno test --no-config --allow-env` (sem `--no-check`), `node scripts/check-ops-alerts.mjs`.
- Commit: `feat(ops): ...`, terminando com `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` literal. Migrations **não** são aplicadas pelo agente.

## Fatos verificados em produção (2026-10-14)

- `public.channels(id, user_id, name, type, status, members, identifier, last_sync, created_at, metadata, provider, external_instance_name, external_instance_id, external_group_id)`; valores de `type`: `telegram`, `whatsapp`, `discord`; `status` inclui `connected`, `disconnected`.
- `public.whatsapp_instances(id, user_id, channel_id, name, instance_name, instance_id, status, provider, phone_number, profile_name, qr_code, qr_code_updated_at, connected_at, disconnected_at, last_sync_at, error_message, created_at, updated_at)`; `status` inclui `connected`, `disconnected`, `error`; `connected_at` **nunca é preenchido**: use a mudança de `status`.
- `public.bot_configs(user_id, status, ativo, grupos_origem (array), channel_ids_destino (text[]), shopee_app_id, mercadolivre_tag, amazon_tag, shopee_mode, paused_reason, last_started_at, updated_at, ...)`; `status` assume `pending`, `active`, `paused`. Há triggers BEFORE existentes (`bot_configs_block_reactivate`, `bot_configs_seal_secrets`): **não toque neles**. Segredos do Telegram vão para o Vault; as colunas de segredo ficam nulas.
- `public.offers(id, user_id, name, image, original_price, sale_price, discount, coupon, affiliate_link, marketplace, category, status, created_at, ...)`. 4 usuários têm ofertas hoje (1716 linhas). Existe trigger `offers_affiliate_link_protocol_guard` (BEFORE): não toque. A tabela é caminho quente de inserção (o bot insere em lote).
- `public.profiles(id, email, full_name, display_name, phone, plan, account_status, trial_ends_at, ...)`.
- `public.ops_events(id, created_at, last_seen_at, severity, category, title, detail, user_id, fingerprint, occurrences, notified_at, notify_attempts, last_notify_attempt_at)`; com `p_dedupe_key` o fingerprint é `'k:' || chave`.
- Painel admin do usuário: `https://admin.aflyo.com.br/users/<uuid>`.

## Task: migration + formatação + docs (um commit)

### 1. `supabase/migrations/20261014010000_ops_user_milestones.sql`
Cabeçalho em pt-BR (sem travessão): depende de `20261013000000` e `20261014000000`, rollback em `supabase/rollbacks/20261014010000_ops_user_milestones_rollback.sql`.

Função auxiliar `public.ops_user_snapshot(p_user_id uuid) returns jsonb` (`stable`, `security definer`, `search_path = public`, revoke de `public, anon, authenticated`): devolve `{nome, email, telefone, plano, trial_termina, painel}` a partir de `profiles` (nome = `coalesce(nullif(btrim(full_name),''), nullif(btrim(display_name),''))`; `trial_termina` só quando `account_status = 'trialing'`; `painel` = URL do admin). Nunca lança (retorna `'{}'::jsonb` em qualquer erro).

**Triggers (todas as funções fail-open, `security definer`):**

a) **Telegram conectado.** Função `ops_on_channel_connected()`; trigger `trg_ops_channel_connected` `after insert or update of status on public.channels for each row when (new.type = 'telegram' and new.status = 'connected')`. Dentro da função: em `UPDATE`, retornar sem emitir se `old.status = 'connected'`. Título `Telegram conectado`, categoria `bot`, `p_user_id = new.user_id`, `p_dedupe_key = 'tg_connected:' || new.id`. Detail = snapshot do usuário + `canal_nome` (new.name), `identificador` (new.identifier), `membros` (new.members), `canais_telegram` (quantidade de `channels` do usuário com `type='telegram'` e `status='connected'`, incluindo este).

b) **WhatsApp conectado.** Função `ops_on_whatsapp_connected()`; trigger `trg_ops_whatsapp_connected` `after insert or update of status on public.whatsapp_instances for each row when (new.status = 'connected')`; em `UPDATE`, sair se `old.status = 'connected'`. Título `WhatsApp conectado`, categoria `bot`, dedupe `'wa_connected:' || new.id`. Detail = snapshot + `numero_whatsapp` (phone_number), `perfil_whatsapp` (profile_name), `instancia` (instance_name).

c) **Bot ativado (1ª ativação).** Função `ops_on_bot_started()`; trigger `trg_ops_bot_started` `after update of status on public.bot_configs for each row when (new.status = 'active' and old.status is distinct from new.status)`. Título `Bot ativado`, categoria `bot`, dedupe `'bot_started:' || new.user_id` (assim só a 1ª ativação do usuário gera aviso; as seguintes só incrementam `occurrences`). Detail = snapshot + `grupos_origem` (`coalesce(array_length(new.grupos_origem, 1), 0)`; confirme o tipo da coluna lendo as migrations e adapte com `jsonb_array_length(to_jsonb(...))` se não for array nativo), `canais_destino` (`coalesce(cardinality(new.channel_ids_destino), 0)`), `marketplaces` (texto separado por vírgula: `Shopee` se `shopee_app_id` não vazio, `Mercado Livre` se `mercadolivre_tag` não vazio, `Amazon` se `amazon_tag` não vazio; omitir se vazio).

d) **Primeira oferta.** Função `ops_on_first_offer()`; trigger `trg_ops_first_offer` `after insert on public.offers for each row`. Lógica, nesta ordem, saindo cedo: (1) se existe `ops_events` com `fingerprint = 'k:first_offer:' || new.user_id` → `return new`; (2) se existe outra oferta do usuário (`id <> new.id`) → `return new`; (3) emitir. Título `Primeira oferta recebida`, categoria `bot`, dedupe `'first_offer:' || new.user_id`. Detail = snapshot + `produto` (new.name), `marketplace` (new.marketplace), `preco` (new.sale_price), `preco_original` (new.original_price), `desconto` (new.discount) e `minutos_ate_primeira_oferta` = minutos entre `created_at` do evento `k:bot_started:<user_id>` em `ops_events` e `now()` (omitir se não existir o evento).
**Backfill sem alerta** (no fim da migration, antes de criar o trigger): `insert into public.ops_events (severity, category, title, detail, user_id, fingerprint, occurrences, notified_at) select 'business','bot','Primeira oferta recebida','{}'::jsonb, o.user_id, 'k:first_offer:' || o.user_id, 1, now() from (select distinct user_id from public.offers) o on conflict do nothing;` (não há unique em `fingerprint`: proteja com `where not exists (select 1 from public.ops_events e where e.fingerprint = 'k:first_offer:' || o.user_id)`). Explique em comentário que isso evita alerta espúrio para usuários com TTL que já tiveram ofertas.

Todos os `revoke all on function ... from public, anon, authenticated`. Todos os `drop trigger if exists ...` antes dos `create trigger`.

### 2. Rollback e teste manual
- Rollback: `drop trigger if exists` das 4 triggers, `drop function if exists` das 5 funções (4 + snapshot), e `delete from public.ops_events where fingerprint like 'k:first_offer:%' and notified_at is not null and title = 'Primeira oferta recebida' and detail = '{}'::jsonb and occurrences = 1` (o backfill), em ordem segura.
- Teste manual SQL (`supabase/tests/manual/20261014010000_ops_user_milestones.test.sql`), estilo dos existentes com "espera ...": triggers presentes; privilégios (nenhuma função executável por anon/authenticated); bloco `do $$ ... raise exception ... $$` que dentro de uma transação revertida insere um canal telegram `connected` para um usuário de teste e confere o evento; contagem do backfill (`select count(*) ... fingerprint like 'k:first_offer:%'` deve igual ao número de usuários com ofertas); aviso de que os http enfileirados são descartados pelo rollback.

### 3. Formatação (`supabase/functions/_shared/ops/format.ts` + `format_test.ts`)
Acrescente à tabela de campos, com rótulos pt-BR (a ordem relativa: depois dos dados do usuário e antes de `acesso`): `canal_nome` "Canal"; `identificador` "Identificador"; `membros` "Membros"; `canais_telegram` "Canais Telegram"; `numero_whatsapp` "Número" (formatar como telefone BR); `perfil_whatsapp` "Perfil"; `instancia` "Instância"; `grupos_origem` "Grupos de origem"; `canais_destino` "Canais de destino"; `marketplaces` "Marketplaces"; `produto` "Produto"; `marketplace` "Marketplace"; `preco` "Preço" (BRL); `preco_original` "Preço original" (BRL); `desconto` "Desconto" (`35%`); `minutos_ate_primeira_oferta` "Desde a ativação do bot" (formato de minutos/horas/dias já existente). Para `title === 'Primeira oferta recebida'` o resumo (description/linha de resumo) é `{produto} · {marketplace} · R$ {preco} (-{desconto}%)`, e as chaves usadas no resumo não repetem na lista de campos. Escape de markdown do Discord e HTML do Telegram seguem o padrão existente. Testes: um por mensagem nova, com valores reais, omissão de campos vazios, escape de markdown num `produto` malicioso (`[x](https://evil)`).

### 4. Docs e contratos
- `docs/OPS_ALERTS.md`: acrescente as 4 mensagens à tabela de "O que alerta hoje", uma seção "Marcos do usuário" com as regras (1 aviso por canal/instância; 1ª ativação do bot; 1ª oferta para sempre; sem retroativo), o que cada sinal significa e a limitação (o bot externo não grava `last_started_at`, então "bot ativado" é a mudança de status, não prova que o processo subiu), e a lista de kill switches (`drop trigger if exists ... `).
- `scripts/check-ops-alerts.mjs`: contratos para a nova migration: as 4 triggers, `revoke all` das funções, `'k:first_offer:'`/`'first_offer:'`, `exception when others` e o backfill; **sem** `alter database` nem `current_setting('app.`.

## Verificação (colar no relatório)
`deno check --no-config` nos arquivos alterados; `deno test --no-config --allow-env supabase/functions/_shared/ops/ supabase/functions/notify/ supabase/functions/cakto-webhook/ops_test.ts` (tudo verde, informe a contagem); `node scripts/check-ops-alerts.mjs`; `git diff origin/main --stat`; grep de travessão nas linhas adicionadas (nenhum); grep de `alter database`/`current_setting('app.` na migration (nenhum).

## Review Focus
1. Nenhum trigger pode bloquear nem atrasar INSERT/UPDATE em `offers`, `channels`, `whatsapp_instances` ou `bot_configs` (fail-open, custo O(1) indexado, `offers` é caminho quente com inserção em lote).
2. Sem alerta espúrio ao aplicar (backfill) e sem duplicidade (dedupe keys).
3. Dados de usuário nas mensagens: e-mail/telefone completos, nenhum segredo (nem sessão do Telegram, nem token).
4. `WHEN` dos triggers não referencia `OLD` em INSERT.
