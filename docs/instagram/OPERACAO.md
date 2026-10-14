# Automações de Instagram: operação

## Fluxo

Meta -> `ig-webhook` (HMAC, grava `ig_events`) -> `runWorker` (webhook e cron de 1 min)
-> `processComment` -> Graph API. Código de decisão: `supabase/functions/_shared/instagram/`.

## Estados

| Estado | Significado | Ação |
|---|---|---|
| `ig_accounts.status = connected` | conectado e operacional | normal |
| `ig_accounts.status = needs_reconnect` | token expirado/inválido | afiliado reconecta em /instagram |
| `ig_accounts.status = disconnected` | conta desconectada pelo painel (token já apagado, automações pausadas) | o `ig_prune` apaga a conta, automações, contatos, log e eventos 30 dias depois de `updated_at`; reconectar antes disso reaproveita a linha |
| `ig_automations.paused_reason = access_revoked` | sem assinatura ativa | assine um plano e reative manualmente (trigger valida acesso ao ativar) |
| `ig_automations.paused_reason = account_disconnected` | conta foi desconectada | reconecte a conta em /instagram |
| `ig_automations.paused_reason = token_invalid` | token inválido/expirado | reconecte a conta em /instagram |
| `ig_events.status = pending` | na fila, aguardando execução | normal |
| `ig_events.status = processing` | em execução | travado há > 5 min é re-reivindicado (attempts+1) enquanto `attempts < 5`; com 5 ou mais vira `failed` com `reason = 'stale_max_attempts'` |
| `ig_events.status = done` | processado com sucesso | retém 30 dias, depois apaga |
| `ig_events.status = ignored` | ignorado (sem match ou filtrado) | retém 30 dias, depois apaga |
| `ig_events.status = blocked` | sem acesso ou cota esgotada | retém 30 dias, depois apaga |
| `ig_events.status = failed` | erro permanente, 5 tentativas esgotadas ou envio ambíguo | ver `reason`/`last_error`, retém 30 dias, depois apaga |
| `ig_events.reason = ambiguous` / `ig_message_log.meta_error_code = ambiguous` | timeout ou erro de rede no envio da DM (a Meta pode ter entregue) | sem retry e sem estorno de cota, de propósito: preferimos perder uma DM a duplicar. Muitos casos seguidos indicam instabilidade da Graph API (timeout de 15 s por chamada) |

## Consultas úteis

```sql
-- fila pendente e atrasada
select status, count(*), min(run_at) from ig_events group by status;

-- falhas recentes por motivo
select reason, count(*) from ig_events
 where status = 'failed' and received_at > now() - interval '1 day' group by reason order by 2 desc;

-- DMs do mes por usuario
select user_id, dms_sent from ig_usage_monthly where period = date_trunc('month', now())::date order by 2 desc;

-- conexoes pendentes (OAuth em progresso)
select count(*), min(expires_at) from ig_pending_connections;
```

## Fluxo de OAuth (dois passos)

1. Afiliado inicia em `/instagram` -> chama `ig-oauth-start` (com JWT, requer plano ativo com Instagram ativado)
   - Valida acesso ativo (has_active_access) e se plano permite Instagram (allow_instagram)
   - Gera `state`, redireciona para Meta
2. Meta redireciona para `ig-oauth-callback` (publica, sem JWT)
   - Cria linha em `ig_pending_connections` (TTL 10 min, token em Vault sob o ID pendente)
   - Redireciona para `/instagram?ig_pending=<id>`
3. App chama `ig-oauth-complete` (com JWT)
   - Consome a linha pendente, cria conta em `ig_accounts`
   - Token movido de Vault pendente para Vault permanente do usuário

## Desautorização e exclusão de dados

Três caminhos, com efeitos diferentes:

- Desconectar no painel (`ig-account-disconnect`, com JWT)
  - Remove a assinatura do webhook (melhor esforço) e apaga o token no Vault na hora
  - Pausa automações com `paused_reason = 'account_disconnected'`
  - Define `ig_accounts.status = 'disconnected'`
  - Os dados (automações, contatos, log, eventos) são apagados pelo `ig_prune` 30 dias depois

- `ig-deauthorize` (webhook da Meta, sem JWT): a pessoa removeu o Aflyo nas configurações do Instagram
  - Procura a conta por `ig_user_id` OU `ig_app_scoped_id`
  - Apaga tudo na hora, igual à exclusão de dados: token, eventos e a linha `ig_accounts`
    (cascata: automações, contatos, log de mensagens)

- `ig-data-deletion` (webhook da Meta, sem JWT)
  - Procura a conta por `ig_user_id` OU `ig_app_scoped_id`
  - Zera o token no Vault
  - Deleta eventos por `ig_user_id`
  - Deleta a linha `ig_accounts` (cascata: automações, contatos, log de mensagens)
  - Retorna `{url, confirmation_code}` conforme exigido pela Meta

## Retenção e limpeza automática

- `ig_prune` (cron diário 03:30 UTC)
  - Deleta `ig_events` em terminal (done, ignored, blocked, failed) com > 30 dias
  - Deleta `ig_message_log` com > 180 dias
  - Deleta contas com `status = 'disconnected'` e `updated_at` com > 30 dias, e os
    `ig_events` delas (por `ig_user_id`); a cascata apaga automações, contatos e log
  - Deleta `ig_pending_connections` expiradas (TTL 10 min)
  - Em qualquer DELETE de `ig_accounts` ou `ig_pending_connections` (direto ou em cascata),
    o trigger `ig_blank_token_on_delete` zera o segredo `ig_access_token:<id>` no Vault

- `ig_pause_no_access` (cron a cada 15 min)
  - Pausa automações ativas de usuários sem acesso ativo (assinatura/trial expirada)
  - Define `paused_reason = 'access_revoked'`
  - Não reativa automaticamente após novo plano (usuário deve reativar manualmente)

## Reconexao de conta desconectada

- Reconectar conta desconectada do mesmo usuário conta contra `max_ig_accounts`
- Limite é validado em `ig-oauth-complete`, não em `ig-oauth-start`

## Incidentes

- **Webhook sem eventos:** conferir assinatura do app na Meta, `IG_WEBHOOK_VERIFY_TOKEN`, e
  `ig_accounts.last_webhook_at`.
- **Tudo falhando com código 190:** App Secret trocado ou app em modo de desenvolvimento sem papel.
- **Desligar o envio de emergência:**
  1. `update ig_automations set status='paused', paused_reason='emergency' where status='active';` (mata todos os envios)
  2. (Opcional) `select cron.unschedule('ig_process_events');` (para o cron worker de 1 min)
  3. (Opcional) Despublicar `ig-webhook` no Supabase Console (para e webhooks inline)
  - Crons de background: `ig_token_refresh` (06:00 diário), `ig_pause_no_access` (a cada 15 min), `ig_prune` (03:30 diário)
  - Os eventos ficam `pending` se o worker parar.
- **Reverter o módulo para um usuário:** `update ig_automations set status='paused' where user_id = '...';`

## Checklist antes de aplicar em produção

O SQL deste módulo nunca foi executado em nenhum banco. Antes de produção (passos humanos,
cada um com autorização do dono):

1. Aplicar `20261013120000_instagram_core.sql` num branch do Supabase ou banco de dev
   (nunca direto em produção).
2. Rodar o teste manual nesse banco:
   `psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20261013120000_instagram_core.test.sql`
   (roda em `BEGIN ... ROLLBACK`, não deixa dados). Conferir que nenhum assert falhou e
   ler os NOTICEs de blocos pulados (precisa de 2 linhas em `profiles`).
3. Reaplicar a migration core no mesmo banco para confirmar que é idempotente.
4. Conferir que o segredo `app_service_role_key` existe no Vault do banco de destino
   (`select count(*) from vault.decrypted_secrets where name = 'app_service_role_key';`
   deve dar 1; é o mesmo usado pela central de alertas). Sem ele o cron só emite NOTICE
   e não chama as funções. A migration do cron não usa `ALTER DATABASE SET`.
5. Ordem em produção: migration core -> secrets (`docs/instagram/META_SETUP.md`) -> Edge
   Functions (lista abaixo) -> migration `20261013120100_instagram_cron.sql`.
6. Depois da migration de cron: `select jobname, schedule, active from cron.job where jobname like 'ig_%';`
   deve listar `ig_process_events`, `ig_token_refresh`, `ig_pause_no_access` e `ig_prune`.
7. Só depois do App Review aprovado: `VITE_FEATURE_INSTAGRAM=true` na Vercel e redeploy do front.

## Deploy (precisa de autorização)

Ordem: migration `..._instagram_core` -> secrets -> funções -> migration `..._instagram_cron`
-> App Review aprovado -> `VITE_FEATURE_INSTAGRAM=true` na Vercel (produção) e redeploy do front.

**Flag do front:** sem `VITE_FEATURE_INSTAGRAM=true` o item Instagram some da sidebar e as
rotas `/instagram*` redirecionam para `/dashboard`. Ligar só depois de migration, funções e
aprovação da Meta. Para o vídeo do App Review, ligar só no ambiente Preview da Vercel.
Desligar a flag é o jeito mais rápido de esconder o módulo (não para os envios: para isso
veja "Desligar o envio de emergência").

**Funções sem verificação JWT:**
```bash
supabase functions deploy ig-webhook --no-verify-jwt
supabase functions deploy ig-oauth-callback --no-verify-jwt
supabase functions deploy ig-deauthorize --no-verify-jwt
supabase functions deploy ig-data-deletion --no-verify-jwt
```

**Funções com verificação JWT:**
```bash
supabase functions deploy ig-oauth-start
supabase functions deploy ig-oauth-complete
supabase functions deploy ig-account-disconnect
supabase functions deploy ig-media-list
```

**Worker e refresh (service_role only, chamados via cron com Bearer):**
```bash
supabase functions deploy ig-worker --no-verify-jwt
supabase functions deploy ig-token-refresh --no-verify-jwt
```

*Nota: ig-worker e ig-token-refresh usam --no-verify-jwt porque são invocados pelo cron via Bearer Token (service_role), não por JWT de usuário.*
