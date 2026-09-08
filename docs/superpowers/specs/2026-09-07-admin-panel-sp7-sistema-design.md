# Painel Admin SP7, Sistema (Configuracoes) Design

Data: 2026-09-07
Status: aprovado (AskUserQuestion), aguardando revisao do usuario antes do plano

## Objetivo

Area "Configuracoes" no painel admin: editar `plan_limits` (limites e toggles por plano), manter um registro de feature flags, e publicar avisos que aparecem como banner no topo do painel. Uma fase. Nenhuma mudanca em `src/`.

## Decisoes travadas (AskUserQuestion 2026-09-07)

1. Nucleo: editor de `plan_limits` + registro de `system_flags` + `system_announcements`.
2. `plan_limits`: grid livre (edita qualquer campo dos 4 planos, inclusive free), so valida nao-negativo. Ao salvar uma linha, calcula e mostra "N contas do plano passam do novo limite" por campo numerico; NAO bloqueia o save.
3. Aviso ativo: banner no topo de TODA pagina do painel (cor pelo nivel info/warning/danger, X pra dispensar na sessao).
4. Acesso: SUPPORT ganha os `*.read` (ve limites/flags/avisos); SUPER_ADMIN ganha os `*.manage`.

## Fatos verificados no banco de producao (via MCP, 2026-09-07)

- `public.plan_limits` (4 linhas: free/starter/pro/enterprise). Colunas: `plan text` (pk), `max_source_groups int`, `max_whatsapp_instances int`, `max_whatsapp_dest_groups int`, `max_telegram_dest_groups int`, `allow_shortener bool`, `allow_analytics bool`, `allow_scheduling bool`, `remove_branding bool`, `updated_at timestamptz`. O app do cliente ja le essa tabela (fonte unica de limites).
- `public.channels`: `id`, `user_id`, `name`, `type` (`discord`|`telegram`|`whatsapp`), `status`, `external_instance_id`, ... Usado pro calculo de impacto de `max_whatsapp_instances` / `max_whatsapp_dest_groups` / `max_telegram_dest_groups`.
- `public.bot_configs.grupos_origem` (array) e `channel_ids_destino` (array). `grupos_origem` = grupos de origem monitorados; usado pro impacto de `max_source_groups`.
- `public.profiles.plan` = plano do usuario (`free`|`starter`|`pro`|`enterprise`).
- RBAC (`20260829130000`, grp `system`): `feature_flags.read/manage`, `announcements.read/manage`, `system_settings.read/manage` existem no catalogo, **nenhuma role tem**. SP7 adiciona a matriz.
- `admin/src/lib/permission-labels.ts` ja tem os rotulos pt-BR das 6.
- `admin/src/components/AdminLayout.tsx`: `Sidebar` + `Topbar` + `<main class="flex-1 overflow-y-auto p-6"><Outlet/></main>`. O banner entra entre `<Topbar />` e `<main>`.
- `admin_audit_write(p_actor, p_action, p_entity_type, p_entity_id, p_before, p_after, p_reason, p_ctx)` (8 args). `_pg-errors.ts` `BY_HINT` ja tem NOT_FOUND, REASON_REQUIRED, etc. `mapPgError` mapeia `23505` -> conflict.
- Handlers com `permission: null` existem (`session.whoami`) - o banner usa esse padrao.

## Migracao (`20260901050000_admin_system.sql`)

Uma migracao. Nao mexe em `plan_limits` (so cria RPCs que a editam).

### Tabelas

- `public.system_flags`:
  `key text primary key check (key ~ '^[a-z0-9_]{2,40}$')`, `value jsonb not null default 'true'::jsonb`, `description text`, `updated_by uuid`, `updated_at timestamptz not null default now()`.
  RLS on; `select` policy `to authenticated using (public.admin_has_permission('feature_flags.read'))`; `revoke insert/update/delete from authenticated, anon`.
  Seed (`on conflict do nothing`): `('signups_enabled', 'true', 'Permite novos cadastros no app')`, `('checkout_enabled', 'true', 'Checkout Cakto ligado')`, `('maintenance_mode', 'false', 'Modo manutencao (a aplicacao precisa ler)')`.
- `public.system_announcements`:
  `id uuid primary key default gen_random_uuid()`, `message text not null check (length(trim(message)) > 0)`, `level text not null default 'info' check (level in ('info','warning','danger'))`, `active boolean not null default false`, `starts_at timestamptz`, `ends_at timestamptz`, `created_by uuid`, `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`.
  RLS on; `select` policy `to authenticated using (public.admin_has_permission('announcements.read'))`; `revoke insert/update/delete from authenticated, anon`.

### Matriz de permissoes

`insert into public.admin_role_permissions (role_key, permission_key) values ... on conflict do nothing`:
- `SUPER_ADMIN`: as 6 (`feature_flags.read/manage`, `announcements.read/manage`, `system_settings.read/manage`).
- `SUPPORT`: `feature_flags.read`, `announcements.read`, `system_settings.read`.

### Funcoes de leitura (`stable security definer`)

- `admin_plan_limits_list() returns jsonb` -> `{ items: [{ plan, max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups, max_telegram_dest_groups, allow_shortener, allow_analytics, allow_scheduling, remove_branding, updated_at }] }` (ordem free, starter, pro, enterprise).
- `admin_system_flags_list() returns jsonb` -> `{ items: [{ key, value, description, updated_at }] }` (ordem por key).
- `admin_announcements_list() returns jsonb` -> `{ items: [{ id, message, level, active, starts_at, ends_at, created_at, updated_at }] }` (ordem created_at desc).
- `admin_active_announcement() returns jsonb` -> a unica ativa (`active = true and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at >= now())`, `order by created_at desc limit 1`) como `{ id, message, level }`, ou `NULL`.

### Funcoes de escrita (audit atomico; gated no handler)

- `admin_plan_limits_update(p_actor uuid, p_plan text, p_patch jsonb, p_ctx jsonb) returns jsonb`
  - `hint='INVALID_LIMIT'` se `p_plan not in ('free','starter','pro','enterprise')` OU se algum dos 4 campos numericos presentes em `p_patch` for `< 0` ou nao-inteiro.
  - `v_before := to_jsonb(row)`.
  - `update public.plan_limits set` cada chave presente em `p_patch` (os 4 int + os 4 bool), `updated_at = now()` where `plan = p_plan`.
  - impacto (por campo numerico, so pra contas com `profiles.plan = p_plan`):
    - `max_source_groups`: contas com `coalesce(array_length(bc.grupos_origem, 1), 0) > <novo valor>` (join `bot_configs bc`).
    - `max_whatsapp_instances`: contas com `count(distinct c.external_instance_id) filter (where c.type='whatsapp') > <novo>`.
    - `max_whatsapp_dest_groups`: contas com `count(*) filter (where c.type='whatsapp') > <novo>`.
    - `max_telegram_dest_groups`: contas com `count(*) filter (where c.type='telegram') > <novo>`.
    - Se o campo nao veio no `p_patch`, impacto daquele campo = `null`.
  - `admin_audit_write(p_actor, 'PLAN_LIMITS_UPDATED', 'plan_limits', p_plan, v_before, <depois>, null, p_ctx)`.
  - retorna `{ row: <depois>, impact: { max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups, max_telegram_dest_groups } }`.
- `admin_system_flag_set(p_actor uuid, p_key text, p_value jsonb, p_description text, p_ctx jsonb) returns jsonb`
  - `hint='INVALID_KEY'` se `p_key` nao casa `^[a-z0-9_]{2,40}$`.
  - `insert ... on conflict (key) do update set value = excluded.value, description = coalesce(excluded.description, system_flags.description), updated_by = p_actor, updated_at = now()`.
  - `admin_audit_write(p_actor, 'SYSTEM_FLAG_SET', 'system_flag', p_key, <before ou null>, <depois>, null, p_ctx)`.
  - retorna a row.
- `admin_system_flag_delete(p_actor uuid, p_key text, p_ctx jsonb) returns jsonb`
  - `hint='NOT_FOUND'` se nao existe. `delete`. audit `SYSTEM_FLAG_DELETED`. retorna `{ deleted: true }`.
- `admin_announcement_upsert(p_actor uuid, p_id uuid, p_message text, p_level text, p_active boolean, p_starts_at text, p_ends_at text, p_ctx jsonb) returns jsonb`
  - `hint='MESSAGE_EMPTY'` se `trim(p_message)` vazio; `hint='INVALID_LEVEL'` se `p_level not in ('info','warning','danger')`.
  - `p_starts_at`/`p_ends_at`: `nullif(trim(...),'')::timestamptz` com fallback null (bloco `begin ... exception`).
  - se `p_id is null` -> insert; senao update where `id = p_id` (se nao achou -> `hint='NOT_FOUND'`).
  - audit `ANNOUNCEMENT_UPSERTED`. retorna a row.
- `admin_announcement_delete(p_actor uuid, p_id uuid, p_ctx jsonb) returns jsonb`
  - `hint='NOT_FOUND'` se nao existe. `delete`. audit `ANNOUNCEMENT_DELETED`. retorna `{ deleted: true }`.

Grants: `revoke ... from authenticated, anon` + `grant ... to service_role` em todas.

## `admin-api`

### `handlers/system.ts` + registro no `index.ts`

Perms:
- `system/plan-limits` -> `system_settings.read`
- `system/flags` -> `feature_flags.read`
- `system/announcements` -> `announcements.read`
- `system/active-announcement` -> **`permission: null`** (todo admin ve o banner)
- `system/plan-limits-update` -> `system_settings.manage`
- `system/flag-set` + `system/flag-delete` -> `feature_flags.manage`
- `system/announcement-upsert` + `system/announcement-delete` -> `announcements.manage`

Helpers puros: `reqStr(params, key)`. Handlers passam os params pras RPCs (`p_plan`/`p_patch` do `plan-limits-update` vem de `params.plan` + `params.patch`; o handler valida que `patch` e objeto).

### `_pg-errors.ts` (BY_HINT novos)

- `INVALID_LIMIT`: `{ code: 'validation', message: 'Limite invalido (use inteiro >= 0).' }`
- `INVALID_KEY`: `{ code: 'validation', message: 'Chave invalida (minusculas, numeros, underscore; 2 a 40 chars).' }`
- `INVALID_LEVEL`: `{ code: 'validation', message: 'Nivel invalido (info, warning ou danger).' }`
- `MESSAGE_EMPTY`: `{ code: 'validation', message: 'A mensagem nao pode ficar vazia.' }`

## Front (`admin/`)

- `admin/src/pages/system/SystemArea.tsx`: shell com 3 abas via `?tab=limites|flags|avisos` (default `limites`). Cada aba checa a permissao de leitura (`system_settings.read` / `feature_flags.read` / `announcements.read`); "sem permissao" se faltar.
- `PlanLimitsTab.tsx`: `admin_plan_limits_list`. Uma "linha-card" por plano com 4 inputs number + 4 toggles. Estado local por linha; botao "Salvar" (so com `system_settings.manage`) manda so os campos alterados via `system/plan-limits-update`. Ao voltar, mostra o `impact` como aviso por campo ("max_source_groups: 3 conta(s) do plano pro passam do novo limite"). Sem `system_settings.manage` -> read-only.
- `FlagsTab.tsx`: `admin_system_flags_list`. Tabela key / valor / descricao. Valor: se `value` for `true`/`false` mostra um toggle; senao um input de texto (edita como JSON string). Form de adicionar (key + valor + descricao). Botao remover. Tudo gated `feature_flags.manage`. Aviso no topo: "Cada flag so tem efeito quando a aplicacao ou uma Edge Function ler ela. O painel so registra."
- `AnnouncementsTab.tsx`: `admin_announcements_list`. Lista (mensagem, nivel com badge, ativo, janela). Form de criar/editar (mensagem textarea, nivel select, ativo toggle, starts_at/ends_at date-time opcionais). Botao remover. Gated `announcements.manage`.
- `admin/src/components/AnnouncementBanner.tsx`: chama `callAdminApi('system','active-announcement',{})` no mount. Se ha aviso e o id nao esta em `sessionStorage['aflyo_admin_dismissed_announcement']`, renderiza uma faixa full-width (`bg` pelo nivel: info=info-bg, warning=warning-bg, danger=danger-bg) com a mensagem e um botao X que grava o id no sessionStorage e esconde. Falha silenciosa (sem aviso -> nao renderiza nada).
- `admin/src/components/AdminLayout.tsx`: `<AnnouncementBanner />` entre `<Topbar />` e `<main>`.
- `admin/src/nav.ts`: secao "Sistema" -> `{ label: 'Configuracoes', to: '/system', permission: 'system_settings.read', icon: Settings }` (tira `comingSoon`).
- `admin/src/App.tsx`: rota `/system` sob `RequirePermission permission="system_settings.read"`.

## Permissoes

Nenhuma nova. As 6 do grp `system` ja no catalogo; o SP7 so adiciona a matriz (SUPER_ADMIN as 6, SUPPORT os 3 `*.read`).

## Ordem de implementacao (resumo pro plano)

1. Migracao `20260901050000` (2 tabelas + seed + matriz + 4 read RPCs + 5 write RPCs) + `.test.sql`.
2. `admin-api` `handlers/system.ts` + `index.ts` + `system_test.ts` + hints no `_pg-errors`.
3. `nav.ts` + `App.tsx` + `SystemArea` (shell) + 3 stubs + `AnnouncementBanner` + wire no `AdminLayout`.
4. `PlanLimitsTab` (grid + salvar + impacto) + teste.
5. `FlagsTab` (CRUD do registro) + teste.
6. `AnnouncementsTab` (CRUD) + teste do `AnnouncementBanner`.
7. Verificacao (vitest + deno + build + lint) + deploy (1 migration via SQL Editor/MCP, `supabase functions deploy admin-api`, `vercel deploy --prod`) + smoke test + memoria.

## Fora de escopo

- Fazer as `system_flags` terem efeito no app (wire de consumidores no `src/` ou Edge Functions).
- Mostrar `system_announcements` pro usuario final (precisa de `src/`).
- Editar o CATALOGO de permissoes ou os cargos (isso e SP1/SP8).
- Historico/versionamento de `plan_limits` alem do `admin_audit_log`.
- Agendar mudanca de `plan_limits` (aplicar so numa data).
- `maintenance_mode` de verdade (barrar acesso) - a flag e so registro.
- Rollback automatico ou "aplicar em lote" de flags.

## Riscos e notas

- **`plan_limits` e sensivel**: mudar um limite muda o que TODO usuario daquele plano pode fazer, na hora (o app le a tabela). O `system_settings.manage` fica so com SUPER_ADMIN. O aviso de impacto ajuda mas nao trava - decisao do usuario.
- **Calculo de impacto e best-effort**: o mapeamento limite -> contagem real e aproximado (`grupos_origem` pra source, contagem de `channels` por tipo pros dest). Serve de sinal, nao de numero exato. O rotulo deixa isso claro ("aproximado").
- **Banner pra todo admin**: `system/active-announcement` e `permission: null` (passa so pelo `authorize`, sem `requirePermission`). Um admin sem `announcements.read` ve o banner mas nao a aba Avisos. Intencional.
- **`system_flags.value` e jsonb**: o front trata `true`/`false` como toggle e o resto como texto/JSON. Um valor malformado no input vira erro amigavel (o handler faz `JSON.parse` defensivo).
- **Base da branch**: `feat/admin-sp7-sistema` sai de `feat/admin-sp6-seguranca`. PR empilha sobre #44/#47/#48/#49/#51/#52/#54, base `main`.
