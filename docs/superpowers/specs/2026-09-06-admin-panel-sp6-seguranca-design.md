# Painel Admin SP6, Seguranca Design

Data: 2026-09-06
Status: aprovado (AskUserQuestion), aguardando revisao do usuario antes do plano

## Objetivo

Area de Seguranca no painel admin: ver contas de risco e a postura de seguranca, banir/desbanir conta no nivel de auth, e manter uma blocklist de e-mail/dominio que recusa cadastro de verdade (trigger). Uma fase, SQL puro, sem Management API.

## Decisoes travadas (AskUserQuestion 2026-09-06)

1. Nucleo: risco (so leitura) + banir/desbanir conta + blocklist de e-mail/dominio com enforcement.
2. Ban = bloqueio total: seta `auth.users.banned_until` (bloqueia login) E faz o efeito do suspend do SP2 (`account_status='suspended'` + pausa o bot). Desbanir so limpa `banned_until` (nao devolve acesso; o admin usa "reativar" do SP2 pra isso, decisao separada).
3. Guard da blocklist: o trigger recusa adicionar entrada de DOMINIO que esteja numa lista fixa de dominios comuns (gmail/hotmail/outlook/live/icloud/yahoo/proton/uol/bol/terra...). A UI mostra o aviso "isto bloqueia TODO cadastro desse dominio". `risk.manage` adiciona/remove.
4. Uma fase so, SQL puro. Sem advisors nem falha de login de admin da Management API (ja no Monitoramento do SP5).

## Fatos verificados no banco de producao (via MCP, 2026-09-06)

- `auth.users`: tem `banned_until timestamptz`, `email`, `email_confirmed_at`, `created_at`, `last_sign_in_at`, `id`. (SP5 ja usa.)
- `auth.mfa_factors`: `id`, `user_id`, `factor_type`, `status` (`verified`|`unverified`), `created_at`. 1 fator `verified` no total.
- `public.admin_accounts`: `id`, `user_id`, `email`, `status`, **`mfa_enrolled_at`**, `created_at`, `created_by`, `suspended_at`, `suspended_reason`. 1 admin (`contatogivaldo@outlook.com`, active). Cobertura de MFA = `count filter (mfa_enrolled_at is not null) / count`.
- `public.profiles`: `id`, `email`, `plan`, `account_status` (`trialing`|`active`|`expired`|`canceled`|`suspended`), `trial_ends_at`.
- `public.history` (SP3/SP5): `user_id`, `status` (`success`|`partial`|`error`), `sent_at`, `failed_channels text[]`.
- `public.bot_configs`: `user_id`, `status`, `paused_reason`.
- `public.admin_audit_log` (SP1): `admin_id`, `admin_email`, `action`, `entity_type`, `entity_id`, `before`, `after`, `reason`, `ip inet`, `user_agent`, `created_at`. `admin_audit_write(p_actor, p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason, p_ctx)` (8 args).
- RBAC (`20260829130000`): `security.read`, `security.block_ip`, `risk.read`, `risk.manage` existem no catalogo (grp `security`) mas **nenhuma role tem** (so `audit.read` esta na matriz). O SP6 adiciona a matriz.
- `admin/src/lib/permission-labels.ts` ja tem os rotulos pt-BR (`Ver seguranca`, `Bloquear IP`, `Ver risco`, `Gerenciar risco`). Nenhum trabalho de rotulo.
- SP2 `admin_user_suspend`: `update profiles set account_status='suspended'` + `update bot_configs set status='paused', paused_reason='admin_suspended' where status='active'` + `admin_audit_write('USER_SUSPENDED', 'profile', ...)`. O ban do SP6 espelha isso + o `banned_until`.

## Migracao (`20260901040000_admin_security.sql`)

Uma migracao. Owner = role da migration (opera `auth.*` como as do SP5).

### Tabela + triggers

- `public.security_email_blocklist`:
  `id uuid pk default gen_random_uuid()`, `kind text not null check (kind in ('email','domain'))`, `value text not null` (normalizado: lowercase, trim, dominio sem `@` inicial), `reason text`, `created_by uuid`, `created_at timestamptz not null default now()`. Unique `(kind, lower(value))`.
  RLS on; `select` policy `to authenticated using (public.admin_has_permission('security.read'))`; `revoke insert/update/delete from authenticated, anon` (so as RPCs via service_role escrevem).
- `security_blocklist_normalize_guard()` trigger `before insert or update` em `security_email_blocklist`:
  - `new.value := lower(trim(new.value))`; se `new.kind='domain'` e comeca com `@`, tira o `@`.
  - se `new.kind='domain'` e `new.value` in (lista fixa de dominios comuns) -> `raise exception 'dominio comum' using errcode='P0001', hint='COMMON_DOMAIN'`.
  - Lista fixa: `gmail.com`, `googlemail.com`, `hotmail.com`, `hotmail.com.br`, `outlook.com`, `outlook.com.br`, `live.com`, `msn.com`, `icloud.com`, `me.com`, `yahoo.com`, `yahoo.com.br`, `ymail.com`, `proton.me`, `protonmail.com`, `uol.com.br`, `bol.com.br`, `terra.com.br`, `ig.com.br`, `globo.com`.
- `auth_users_blocklist_check()` trigger `before insert` em `auth.users`:
  - **fail-open por design**: se `new.email is null` -> `return new`. Faz o lookup dentro de `begin ... exception when others then return new; end` (qualquer erro do proprio guard nunca trava cadastro).
  - so `raise exception` quando ha hit EXPLICITO: `security_email_blocklist` com `(kind='email' and lower(value)=lower(new.email))` ou `(kind='domain' and lower(value)=lower(split_part(new.email,'@',2)))`. Mensagem `'Cadastro bloqueado para este e-mail.'` (`errcode='23514'`).

### Matriz de permissoes

`insert into public.admin_role_permissions (role_key, permission_key) values ... on conflict do nothing`:
- `SUPER_ADMIN`: `security.read`, `security.block_ip`, `risk.read`, `risk.manage`
- `SUPPORT`: `security.read`, `risk.read`

### Funcoes de leitura (`stable security definer`)

- `admin_security_posture() returns jsonb`
  -> `{ admins: { total, mfa_enrolled }, users: { total, banned, suspended, unconfirmed }, blocklist: { emails, domains } }`
  - `admins`: de `admin_accounts` (`mfa_enrolled` = filter `mfa_enrolled_at is not null`).
  - `users`: de `auth.users` join `profiles` (`banned` = `banned_until > now()`; `suspended` = `profiles.account_status='suspended'`; `unconfirmed` = `email_confirmed_at is null`).
  - `blocklist`: contagem por `kind`.
- `admin_risk_accounts() returns jsonb`
  -> `{ items: [{ user_id, email, created_at, account_status, plan, banned, flags: [text...] }] }` (limite 200, ordenado por created_at desc)
  - flags computadas por conta:
    - `'banido'` se `auth.users.banned_until > now()`
    - `'suspenso'` se `profiles.account_status = 'suspended'`
    - `'nao_confirmado_7d'` se `email_confirmed_at is null and created_at < now() - interval '7 days'`
    - `'dominio_suspeito'` se o dominio do e-mail esta numa lista fixa de descartaveis (`mailinator.com`, `guerrillamail.com`, `10minutemail.com`, `tempmail.com`, `trashmail.com`, `yopmail.com`, `sharklasers.com`, `getnada.com`, `dispostable.com`, `maildrop.cc`) OU esta na `security_email_blocklist` como `domain`
    - `'muita_falha_disparo'` se `sends_30d > 10` e `(partial + error) / sends_30d > 0.5` (de `history`, ultimos 30 dias)
  - So retorna contas com `array_length(flags, 1) >= 1`.
- `admin_blocklist_list(p_search text) returns jsonb`
  -> `{ items: [{ id, kind, value, reason, created_at }] }` (filtro `value ilike '%p_search%'`, ordena `created_at desc`, limite 500).

### Funcoes de escrita (audit atomico; gated no handler)

- `admin_user_ban(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb) returns jsonb`
  - `hint='REASON_REQUIRED'` se `p_reason` vazio; `hint='NOT_FOUND'` se `profiles` nao tem `p_target`.
  - `update auth.users set banned_until = 'infinity'::timestamptz where id = p_target;`
  - `update public.profiles set account_status = 'suspended' where id = p_target;`
  - `update public.bot_configs set status = 'paused', paused_reason = 'admin_banned' where user_id = p_target and status = 'active';`
  - `admin_audit_write(p_actor, 'USER_BANNED', 'profile', p_target::text, v_before, <depois>, p_reason, p_ctx)`.
  - retorna `{ user_id, banned: true, account_status: 'suspended' }`.
- `admin_user_unban(p_actor uuid, p_target uuid, p_ctx jsonb) returns jsonb`
  - `hint='NOT_FOUND'` se `profiles` nao tem `p_target`.
  - `update auth.users set banned_until = null where id = p_target;` (NAO toca em account_status nem bot).
  - `admin_audit_write(p_actor, 'USER_UNBANNED', 'profile', p_target::text, ...)`.
  - retorna `{ user_id, banned: false }`.
- `admin_blocklist_add(p_actor uuid, p_kind text, p_value text, p_reason text, p_ctx jsonb) returns jsonb`
  - `hint='INVALID_KIND'` se `p_kind not in ('email','domain')`.
  - `insert into security_email_blocklist (kind, value, reason, created_by) values (p_kind, p_value, nullif(trim(p_reason),''), p_actor)` (o trigger normaliza e barra dominio comum -> `COMMON_DOMAIN`; unique violation -> `23505`).
  - `admin_audit_write(p_actor, 'BLOCKLIST_ADDED', 'blocklist', <id>::text, null, jsonb_build_object('kind', p_kind, 'value', <normalizado>), p_reason, p_ctx)`.
  - retorna a row criada.
- `admin_blocklist_remove(p_actor uuid, p_id uuid, p_ctx jsonb) returns jsonb`
  - `hint='NOT_FOUND'` se nao existe.
  - `delete ...` + `admin_audit_write(p_actor, 'BLOCKLIST_REMOVED', 'blocklist', p_id::text, <before>, null, null, p_ctx)`.
  - retorna `{ removed: true }`.

Grants: `revoke ... from authenticated, anon` + `grant ... to service_role` em todas.

## `admin-api`

### `handlers/security.ts` + registro no `index.ts`

Perms:
- `security/posture` -> `security.read`
- `security/risk-accounts` -> `risk.read`
- `security/blocklist` -> `security.read`
- `security/ban` + `security/unban` -> `risk.manage`
- `security/blocklist-add` + `security/blocklist-remove` -> `risk.manage`

Cada handler segue o padrao dos SPs: `serviceClient().rpc(...)`, `if (error) throw error` (deixa o `mapPgError` traduzir o hint), `null` -> `RbacError('not_found')` quando fizer sentido. `reqUserId`/`reqId` helpers como nos outros handlers.

### `_pg-errors.ts` (BY_HINT novos)

- `COMMON_DOMAIN`: `{ code: 'validation', message: 'Esse dominio e comum demais; nao da pra bloquear todo cadastro dele.' }`
- `INVALID_KIND`: `{ code: 'validation', message: 'Tipo invalido (use email ou domain).' }`

(`REASON_REQUIRED` e `NOT_FOUND` ja existem do SP2.)

## Front (`admin/`)

- `admin/src/pages/security/SecurityArea.tsx`: shell com 2 abas via `?tab=risco|bloqueios` (default `risco`). Cada aba checa a permissao (`risk.read` / `security.read`) e mostra "sem permissao" se faltar.
- `RiscoTab.tsx`:
  - Cards de postura (`security/posture`): "Admins com MFA" (`mfa_enrolled/total`), "Contas banidas", "Contas suspensas", "Nao confirmadas", "Blocklist (e-mails/dominios)".
  - Tabela de `security/risk-accounts`: e-mail (link pra `/users/:id`), criada em, status da conta, chips de `flags`. Botao "Banir" / "Desbanir" por linha, so com `risk.manage`, com modal de motivo no banir. Toast + reload.
- `BloqueiosTab.tsx`:
  - Form de adicionar: seletor `kind` (E-mail / Dominio), campo `value`, `reason` opcional. Quando `kind='dominio'`, mostra o aviso amarelo "isto bloqueia TODO cadastro desse dominio". Submit -> `security/blocklist-add`; erro `COMMON_DOMAIN`/`23505` vira toast.
  - Tabela (`security/blocklist`): kind, value, reason, criada em, botao remover (`risk.manage`) -> `security/blocklist-remove`.
- `admin/src/nav.ts`: secao "Seguranca" -> `{ label: 'Risco e bloqueios', to: '/security', permission: 'security.read', icon: ShieldAlert }` (tira `comingSoon`).
- `admin/src/App.tsx`: rota `/security` sob `RequirePermission permission="security.read"`.

## Permissoes

Nenhuma nova. `security.read` / `security.block_ip` / `risk.read` / `risk.manage` ja no catalogo; o SP6 so os adiciona a matriz de roles (SUPER_ADMIN + SUPPORT no read, SUPER_ADMIN no manage). `security.block_ip` fica atribuida a SUPER_ADMIN mas dormente (sem IP no SP6).

## Ordem de implementacao (resumo pro plano)

1. Migracao `20260901040000` (tabela + 2 triggers + matriz + 3 read RPCs + 4 write RPCs) + `.test.sql`.
2. `admin-api` `handlers/security.ts` + `index.ts` + `security_test.ts` (helpers puros) + hints no `_pg-errors`.
3. `nav.ts` + `App.tsx` + `SecurityArea` (shell) + 2 stubs.
4. `RiscoTab` (postura + contas de risco, so leitura) + teste.
5. `BloqueiosTab` (lista + add/remove) + teste.
6. Botoes Banir/Desbanir no `RiscoTab` (gated) + teste.
7. Verificacao (vitest + deno + build + lint) + deploy (1 migration via SQL Editor/MCP, `supabase functions deploy admin-api`, `vercel deploy --prod`) + smoke test + memoria.

## Fora de escopo

- Bloqueio por IP (sem fonte de IP em trigger de `auth.users`; `security.block_ip` fica dormente).
- Score de risco / ML / reputacao externa.
- Auth hook `before-user-created` (usamos trigger de banco, mais contido).
- Alertas, e-mail de incidente, quarentena automatica.
- Mudancas em `src/` (o enforcement da blocklist e 100% no banco).
- Rate limiting, captcha, device fingerprint.
- Revisao dos SEC-1..10 (trabalho separado, ver memoria).
- Mexer no fluxo de MFA dos admins (isso e SP1/SP8).

## Riscos e notas

- **Trigger `before insert` em `auth.users`**: e o ponto mais sensivel. Mitigacao: fail-open (so `raise` em hit explicito; qualquer erro interno do guard -> `return new`), e a blocklist comeca vazia. Padrao conhecido (todo mundo poe `handle_new_user` AFTER INSERT ai; um BEFORE que so as vezes levanta e aceitavel). Se algo der errado no deploy, `drop trigger` resolve na hora sem perder dado.
- **`auth.users` UPDATE sob `security definer`**: `admin_user_ban`/`unban` fazem `update auth.users set banned_until`. O owner da funcao (role da migration) precisa de `UPDATE` em `auth.users`. As migrations do SP5 ja leem `auth.users`; o `postgres` no Supabase tem `UPDATE` no schema `auth`. Fallback no plano: `grant update (banned_until) on auth.users to <owner>` se der permission denied.
- **Ban x suspend do SP2**: sao acoes distintas mas o ban FAZ o efeito do suspend tambem (account_status + bot). Se a conta ja estava suspensa, o ban so acrescenta o `banned_until`. Desbanir NAO reverte o suspend de proposito (evita reativar por engano quem foi suspenso por outro motivo).
- **`admin_risk_accounts` sem indice dedicado**: varre `auth.users` + `profiles` + agrega `history` por user. Com < 100 usuarios e ~400 rows de history hoje, e barato. Se crescer, vira materializado (fora do escopo agora).
- **Dominio comum barrado**: a lista fixa e conservadora; se o operador precisar de um dominio fora dela, `risk.manage` adiciona. Nao da pra remover da lista fixa pelo painel (e codigo).
- **Base da branch**: `feat/admin-sp6-seguranca` sai de `feat/admin-sp5-observabilidade`. PR empilha sobre #44/#47/#48/#49/#51/#52, base `main`.
