# Automações de Instagram: operação

## Fluxo

Meta -> `ig-webhook` (HMAC, grava `ig_events`) -> `runWorker` (webhook e cron de 1 min)
-> `processComment` -> Graph API. Código de decisão: `supabase/functions/_shared/instagram/`.

## Estados

| Estado | Significado | Ação |
|---|---|---|
| `ig_accounts.status = connected` | conectado e operacional | normal |
| `ig_accounts.status = needs_reconnect` | token expirado/inválido | afiliado reconecta em /instagram |
| `ig_accounts.status = disconnected` | conta desconectada | ver paused_reason das automações |
| `ig_automations.paused_reason = access_revoked` | sem assinatura ativa | assine um plano e reative manualmente (trigger valida acesso ao ativar) |
| `ig_automations.paused_reason = account_disconnected` | conta foi desconectada | reconecte a conta em /instagram |
| `ig_automations.paused_reason = token_invalid` | token inválido/expirado | reconecte a conta em /instagram |
| `ig_events.status = pending` | na fila, aguardando execução | normal |
| `ig_events.status = processing` | em execução | travado se > 5 min é re-reivindicado (attempts+1); falha só após 5 tentativas |
| `ig_events.status = done` | processado com sucesso | retém 30 dias, depois apaga |
| `ig_events.status = ignored` | ignorado (sem match ou filtrado) | retém 30 dias, depois apaga |
| `ig_events.status = blocked` | sem acesso ou cota esgotada | retém 30 dias, depois apaga |
| `ig_events.status = failed` | erro permanente após 5 tentativas | ver `reason`/`last_error`, retém 30 dias, depois apaga |

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

- `ig-deauthorize` (webhook da Meta, sem JWT)
  - Procura a conta por `ig_user_id` OU `ig_app_scoped_id`
  - Blanqueia token no Vault
  - Pausa automações com `paused_reason = 'account_disconnected'`
  - Define `ig_accounts.status = 'disconnected'`

- `ig-data-deletion` (webhook da Meta, sem JWT)
  - Procura a conta por `ig_user_id` OU `ig_app_scoped_id`
  - Blanqueia token no Vault
  - Deleta eventos por `ig_user_id`
  - Deleta a linha `ig_accounts` (cascata: automações, contatos, log de mensagens)
  - Retorna `{url, confirmation_code}` conforme exigido pela Meta

## Retenção e limpeza automática

- `ig_prune` (cron diário 03:30 UTC)
  - Deleta `ig_events` em terminal (done, ignored, blocked, failed) com > 30 dias
  - Deleta `ig_message_log` com > 180 dias
  - Blanqueia segredos Vault das `ig_pending_connections` expiradas (TTL 10 min)
  - Deleta `ig_pending_connections` expiradas

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

## Deploy (precisa de autorização)

Ordem: migration `..._instagram_core` -> secrets -> funções -> migration `..._instagram_cron`.

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
