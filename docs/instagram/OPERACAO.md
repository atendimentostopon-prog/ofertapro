# Automações de Instagram: operação

## Fluxo

Meta -> `ig-webhook` (HMAC, grava `ig_events`) -> `runWorker` (webhook e cron de 1 min)
-> `processComment` -> Graph API. Código de decisão: `supabase/functions/_shared/instagram/`.

## Estados

| Estado | Significado | Ação |
|---|---|---|
| `ig_accounts.status = needs_reconnect` | token inválido/revogado | afiliado reconecta em /instagram |
| `ig_automations.paused_reason = access_revoked` | sem assinatura ativa | volta ao assinar (reativar manualmente) |
| `ig_events.status = failed` | 5 tentativas esgotadas ou erro permanente | ver `reason`/`last_error` |
| `ig_events.status = blocked` | sem acesso ou cota esgotada | esperado |

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

1. Afiliado inicia em `/instagram` -> chama `ig-oauth-start` (publica, sem JWT)
   - Gera `state`, redireciona para Meta
2. Meta redireciona para `ig-oauth-callback` (publica, sem JWT)
   - Cria linha em `ig_pending_connections` (TTL 10 min, token em Vault sob o ID pendente)
   - Redireciona para `/instagram?ig_pending=<id>`
3. App chama `ig-oauth-complete` (com JWT)
   - Consome a linha pendente, cria conta em `ig_accounts`
   - Token movido de Vault pendente para Vault permanente do usuário

## Desautorização e exclusão de dados

- `ig-deauthorize` e `ig-data-deletion` procuram a conta por `ig_user_id` OU `ig_app_scoped_id`
- Chamadas via webhook da Meta (sem JWT)
- Marcam `ig_accounts.status = deauthorized` e deletam dados

## Limpeza de conexoes pendentes expiradas

- Cron `ig_prune` (a cada 30 min)
  - Deleta linhas `ig_pending_connections` expiradas
  - Limpa segredos correspondentes no Vault
  - Pausa automações órfãs

## Reconexao de conta desconectada

- Reconectar conta desconectada do mesmo usuário conta contra `max_ig_accounts`
- Validar limite antes de chamar `ig-oauth-start`

## Incidentes

- **Webhook sem eventos:** conferir assinatura do app na Meta, `IG_WEBHOOK_VERIFY_TOKEN`, e
  `ig_accounts.last_webhook_at`.
- **Tudo falhando com código 190:** App Secret trocado ou app em modo de desenvolvimento sem papel.
- **Desligar o envio de emergência:** `select cron.unschedule('ig_process_events');` e remover o
  `waitUntil` do `ig-webhook` (ou despublicar a função). Os eventos ficam `pending`.
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

**Worker e refresh (sem JWT):**
```bash
supabase functions deploy ig-worker --no-verify-jwt
supabase functions deploy ig-token-refresh --no-verify-jwt
```
