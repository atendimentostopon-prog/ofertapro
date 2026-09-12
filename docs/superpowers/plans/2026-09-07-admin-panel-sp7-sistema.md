# Painel Admin SP7, Sistema (Configuracoes) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Area "Configuracoes" no painel admin: editar `plan_limits`, manter um registro de feature flags, e publicar avisos que aparecem como banner no topo do painel.

**Architecture:** Igual SP1-SP6. `admin-api` (Deno) autoriza (JWT + AAL2 + conta admin ativa + permissao) e chama RPCs `security definer` com audit atomico. Front (`admin/`) so consome `admin-api`. Uma fase, SQL puro, nenhuma mudanca em `src/`.

**Tech Stack:** Deno + `https://deno.land/std@0.168.0/http/server.ts`. Postgres 17 (1 migration). React 19.2 + Vite 8 + TS ~6.0 + Tailwind 3.4 + react-router-dom 7.18 + Vitest 2.1.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-09-07-admin-panel-sp7-sistema-design.md`. Em conflito, o spec vence.
- **Branch:** `feat/admin-sp7-sistema` (ja criada, de `feat/admin-sp6-seguranca`). Carrega a pilha SP1-polish + SP2 + SP3 + SP4 + SP5 + SP6.
- **Uma fase.** Sem Management API.
- **Toda acao da `admin-api` exige AAL2** (o `authorize` ja faz). O banner (`system/active-announcement`) e `permission: null` (passa so pelo `authorize`).
- **Copy de UI em pt-BR com acento. Sem travessao (em dash `-`) em lugar nenhum** (codigo, comentario, spec, plano, commit). Antes de cada commit: `python -c "print(open(F,encoding='utf-8').read().count(chr(8212)))"`.
- **`admin/` nao importa de `../shared`** (build standalone). Constantes locais.
- **Numero da migration:** `20260901050000_admin_system.sql` (depois da do SP6 `20260901040000`).
- **Permissoes (ja no catalogo `20260829130000`, grp `system`, nenhuma nova):** `feature_flags.read/manage`, `announcements.read/manage`, `system_settings.read/manage`. Nenhuma role tem ainda; o SP7 adiciona a matriz. Rotulos pt-BR ja existem em `admin/src/lib/permission-labels.ts`.
- **Schema verificado no banco de prod (MCP, 2026-09-07):**
  - `public.plan_limits`: `plan text` (pk: `free`|`starter`|`pro`|`enterprise`), `max_source_groups int`, `max_whatsapp_instances int`, `max_whatsapp_dest_groups int`, `max_telegram_dest_groups int`, `allow_shortener bool`, `allow_analytics bool`, `allow_scheduling bool`, `remove_branding bool`, `updated_at timestamptz`. 4 linhas. O app do cliente le essa tabela.
  - `public.channels`: `id`, `user_id`, `name`, `type` (`discord`|`telegram`|`whatsapp`), `external_instance_id`, ...
  - `public.bot_configs.grupos_origem` (array; `jsonb_array_length(to_jsonb(grupos_origem))` funciona) e `channel_ids_destino` (array).
  - `public.profiles.plan`.
  - `public.admin_role_permissions`: colunas `role_key`, `permission_key`.
  - `public.admin_has_permission(text)` existe (SP1).
  - `admin_audit_write(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb)` (8 args).
  - `_pg-errors.ts` `BY_HINT` atual termina em `INVALID_KIND`. `mapPgError` mapeia `P0002` -> not_found e `23505` -> conflict, e faz match por substring do hint na mensagem.
  - `admin/src/components/AdminLayout.tsx`: `<Sidebar/>` + `<Topbar/>` + `<main class="flex-1 overflow-y-auto p-6"><Outlet/></main>`.
  - Handlers com `permission: null` existem no `HANDLERS` (`session.whoami`).
- **Comandos** da raiz do worktree `D:/ofertapro-admin-sp1`. Testes admin: `npm --prefix admin test` (ou `npx --prefix admin vitest run <path>`). Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`. Deno: `deno test --allow-env supabase/functions/admin-api/` e `deno check supabase/functions/admin-api/index.ts`.
- **Docker indisponivel:** `.test.sql` verificado por inspecao (padrao SP1-SP6). As queries de leitura e o calculo de impacto JA foram rodados contra prod via MCP.
- **Commits:** um por task, pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260901050000_admin_system.sql` | 2 tabelas (`system_flags`, `system_announcements`) + seed + matriz + 4 read RPCs + 5 write RPCs. |
| `supabase/tests/manual/20260901050000_admin_system.test.sql` | Asserts de shape das RPCs de leitura + hints das de escrita. |
| `supabase/functions/admin-api/handlers/system.ts` | `reqStr` + 9 handlers. |
| `supabase/functions/admin-api/handlers/system_test.ts` | Testa `reqStr` + `parseFlagValue`. |
| `admin/src/pages/system/SystemArea.tsx` | Shell com 3 abas via `?tab=`. |
| `admin/src/pages/system/PlanLimitsTab.tsx` + `.test.tsx` | Grid de `plan_limits` + salvar + impacto. |
| `admin/src/pages/system/FlagsTab.tsx` + `.test.tsx` | CRUD do registro de flags. |
| `admin/src/pages/system/AnnouncementsTab.tsx` + `.test.tsx` | CRUD de avisos. |
| `admin/src/components/AnnouncementBanner.tsx` + `.test.tsx` | Banner do aviso ativo no topo do painel. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/admin-api/index.ts` | `import * as system` + bloco `system:` no `HANDLERS` (9 actions). |
| `supabase/functions/admin-api/handlers/_pg-errors.ts` | `INVALID_LIMIT`, `INVALID_KEY`, `INVALID_LEVEL`, `MESSAGE_EMPTY` no `BY_HINT`. |
| `admin/src/nav.ts` | Secao "Sistema": `{ label: 'Configuracoes', to: '/system', permission: 'system_settings.read', icon: Settings }` (tira `comingSoon`). |
| `admin/src/App.tsx` | +import; rota `/system` sob `RequirePermission permission="system_settings.read"`. |
| `admin/src/components/AdminLayout.tsx` | `<AnnouncementBanner />` entre `<Topbar />` e `<main>`. |

---

## Task 1: Migracao `20260901050000_admin_system.sql`

**Files:**
- Create: `supabase/migrations/20260901050000_admin_system.sql`
- Create: `supabase/tests/manual/20260901050000_admin_system.test.sql`

**Interfaces:**
- Produces:
  - Tabelas `public.system_flags`, `public.system_announcements`.
  - `admin_plan_limits_list() returns jsonb` -> `{ items: [{ plan, max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups, max_telegram_dest_groups, allow_shortener, allow_analytics, allow_scheduling, remove_branding, updated_at }] }` (ordem free/starter/pro/enterprise)
  - `admin_system_flags_list() returns jsonb` -> `{ items: [{ key, value, description, updated_at }] }`
  - `admin_announcements_list() returns jsonb` -> `{ items: [{ id, message, level, active, starts_at, ends_at, created_at, updated_at }] }`
  - `admin_active_announcement() returns jsonb` -> `{ id, message, level }` ou `NULL`
  - `admin_plan_limits_update(p_actor uuid, p_plan text, p_patch jsonb, p_ctx jsonb) returns jsonb` -> `{ row, impact: { max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups, max_telegram_dest_groups } }` (impacto `null` por campo ausente do patch). hint `INVALID_LIMIT`.
  - `admin_system_flag_set(p_actor uuid, p_key text, p_value jsonb, p_description text, p_ctx jsonb) returns jsonb` -> a row. hint `INVALID_KEY`.
  - `admin_system_flag_delete(p_actor uuid, p_key text, p_ctx jsonb) returns jsonb` -> `{ deleted: true }`. hint `NOT_FOUND`.
  - `admin_announcement_upsert(p_actor uuid, p_id uuid, p_message text, p_level text, p_active boolean, p_starts_at text, p_ends_at text, p_ctx jsonb) returns jsonb` -> a row. hints `MESSAGE_EMPTY` / `INVALID_LEVEL` / `NOT_FOUND`.
  - `admin_announcement_delete(p_actor uuid, p_id uuid, p_ctx jsonb) returns jsonb` -> `{ deleted: true }`. hint `NOT_FOUND`.

- [ ] **Step 1: Escrever `supabase/tests/manual/20260901050000_admin_system.test.sql`**

```sql
do $$
declare v jsonb; v_id uuid;
begin
  v := public.admin_plan_limits_list();
  assert v ? 'items' and jsonb_array_length(v->'items') = 4, 'plan_limits_list: esperado 4 planos';
  assert (v->'items'->0->>'plan') = 'free', 'ordem: free primeiro';

  v := public.admin_system_flags_list();
  assert v ? 'items' and jsonb_array_length(v->'items') >= 3, 'flags_list: seed com >= 3';

  v := public.admin_announcements_list();
  assert v ? 'items', 'announcements_list precisa de items';

  assert public.admin_active_announcement() is null, 'sem aviso ativo no seed';

  -- plan_limits_update: plano invalido
  begin
    perform public.admin_plan_limits_update('00000000-0000-0000-0000-000000000000', 'nope', '{}'::jsonb, '{}'::jsonb);
    assert false, 'deveria falhar (INVALID_LIMIT)';
  exception when others then
    assert sqlerrm ilike '%invalido%' or sqlerrm ilike '%INVALID_LIMIT%', 'hint errado: ' || sqlerrm;
  end;

  -- plan_limits_update: numero negativo
  begin
    perform public.admin_plan_limits_update('00000000-0000-0000-0000-000000000000', 'free', '{"max_source_groups":"-1"}'::jsonb, '{}'::jsonb);
    assert false, 'deveria falhar (INVALID_LIMIT negativo)';
  exception when others then
    assert sqlerrm ilike '%invalido%' or sqlerrm ilike '%INVALID_LIMIT%', 'hint errado: ' || sqlerrm;
  end;

  -- plan_limits_update ok (no-op patch): retorna row + impact
  v := public.admin_plan_limits_update('00000000-0000-0000-0000-000000000000', 'free', '{"max_source_groups":"0"}'::jsonb, '{}'::jsonb);
  assert v ? 'row' and v ? 'impact', 'update deveria retornar row + impact';
  assert (v->'impact'->>'max_whatsapp_instances') is null, 'campo ausente do patch -> impact null';

  -- flag set/delete
  v := public.admin_system_flag_set('00000000-0000-0000-0000-000000000000', 'sp7_test_flag', 'true'::jsonb, 'teste', '{}'::jsonb);
  assert (v->>'key') = 'sp7_test_flag', 'flag_set nao retornou a row';
  v := public.admin_system_flag_delete('00000000-0000-0000-0000-000000000000', 'sp7_test_flag', '{}'::jsonb);
  assert (v->>'deleted')::boolean = true, 'flag_delete falhou';

  -- flag key invalida
  begin
    perform public.admin_system_flag_set('00000000-0000-0000-0000-000000000000', 'AB C', 'true'::jsonb, null, '{}'::jsonb);
    assert false, 'deveria falhar (INVALID_KEY)';
  exception when others then
    assert sqlerrm ilike '%invalida%' or sqlerrm ilike '%INVALID_KEY%', 'hint errado: ' || sqlerrm;
  end;

  -- announcement upsert/delete
  v := public.admin_announcement_upsert('00000000-0000-0000-0000-000000000000', null, 'teste sp7', 'info', false, null, null, '{}'::jsonb);
  v_id := (v->>'id')::uuid;
  assert v_id is not null, 'announcement_upsert nao retornou id';
  v := public.admin_announcement_delete('00000000-0000-0000-0000-000000000000', v_id, '{}'::jsonb);
  assert (v->>'deleted')::boolean = true, 'announcement_delete falhou';

  -- announcement mensagem vazia
  begin
    perform public.admin_announcement_upsert('00000000-0000-0000-0000-000000000000', null, '   ', 'info', false, null, null, '{}'::jsonb);
    assert false, 'deveria falhar (MESSAGE_EMPTY)';
  exception when others then
    assert sqlerrm ilike '%vazia%' or sqlerrm ilike '%MESSAGE_EMPTY%', 'hint errado: ' || sqlerrm;
  end;

  raise notice 'PASS admin_system';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha** (Docker indisponivel: pular, verificar por inspecao)

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901050000_admin_system.test.sql`
Expected: `function public.admin_plan_limits_list() does not exist`.

- [ ] **Step 3: Escrever `supabase/migrations/20260901050000_admin_system.sql`**

```sql
-- SP7: area Sistema (Configuracoes). 2 tabelas + matriz + 9 RPCs. Nao altera plan_limits (so cria RPCs que a editam).

-- ==== tabelas ====

create table if not exists public.system_flags (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  value jsonb not null default 'true'::jsonb,
  description text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
alter table public.system_flags enable row level security;
drop policy if exists system_flags_read on public.system_flags;
create policy system_flags_read on public.system_flags
  for select to authenticated using (public.admin_has_permission('feature_flags.read'));
revoke insert, update, delete on public.system_flags from authenticated, anon;

insert into public.system_flags (key, value, description) values
  ('signups_enabled', 'true'::jsonb, 'Permite novos cadastros no app (a aplicacao precisa ler)'),
  ('checkout_enabled', 'true'::jsonb, 'Checkout Cakto ligado (a aplicacao precisa ler)'),
  ('maintenance_mode', 'false'::jsonb, 'Modo manutencao (a aplicacao precisa ler)')
on conflict (key) do nothing;

create table if not exists public.system_announcements (
  id uuid primary key default gen_random_uuid(),
  message text not null check (length(trim(message)) > 0),
  level text not null default 'info' check (level in ('info','warning','danger')),
  active boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists system_announcements_active_idx on public.system_announcements (active, created_at desc);
alter table public.system_announcements enable row level security;
drop policy if exists system_announcements_read on public.system_announcements;
create policy system_announcements_read on public.system_announcements
  for select to authenticated using (public.admin_has_permission('announcements.read'));
revoke insert, update, delete on public.system_announcements from authenticated, anon;

-- ==== matriz de permissoes ====

insert into public.admin_role_permissions (role_key, permission_key) values
  ('SUPER_ADMIN','feature_flags.read'), ('SUPER_ADMIN','feature_flags.manage'),
  ('SUPER_ADMIN','announcements.read'), ('SUPER_ADMIN','announcements.manage'),
  ('SUPER_ADMIN','system_settings.read'), ('SUPER_ADMIN','system_settings.manage'),
  ('SUPPORT','feature_flags.read'), ('SUPPORT','announcements.read'), ('SUPPORT','system_settings.read')
on conflict do nothing;

-- ==== leitura ====

create or replace function public.admin_plan_limits_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'plan', plan, 'max_source_groups', max_source_groups,
      'max_whatsapp_instances', max_whatsapp_instances,
      'max_whatsapp_dest_groups', max_whatsapp_dest_groups,
      'max_telegram_dest_groups', max_telegram_dest_groups,
      'allow_shortener', allow_shortener, 'allow_analytics', allow_analytics,
      'allow_scheduling', allow_scheduling, 'remove_branding', remove_branding,
      'updated_at', updated_at
    ) order by array_position(array['free','starter','pro','enterprise'], plan))
    from public.plan_limits
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_system_flags_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object('key', key, 'value', value, 'description', description, 'updated_at', updated_at) order by key)
    from public.system_flags
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_announcements_list()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id::text, 'message', message, 'level', level, 'active', active,
      'starts_at', starts_at, 'ends_at', ends_at, 'created_at', created_at, 'updated_at', updated_at
    ) order by created_at desc)
    from public.system_announcements
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_active_announcement()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object('id', id::text, 'message', message, 'level', level) into v
  from public.system_announcements
  where active = true
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at >= now())
  order by created_at desc limit 1;
  return v;
end; $$;

-- ==== escrita (audit atomico) ====

create or replace function public.admin_plan_limits_update(
  p_actor uuid, p_plan text, p_patch jsonb, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_before jsonb; v_after jsonb;
  v_imp_src int := null; v_imp_wi int := null; v_imp_wd int := null; v_imp_td int := null;
begin
  if p_plan not in ('free','starter','pro','enterprise') then
    raise exception 'limite invalido (plano)' using errcode='P0001', hint='INVALID_LIMIT';
  end if;
  -- valida numericos: presentes e nao inteiros >= 0
  if exists (
    select 1 from jsonb_each_text(coalesce(p_patch, '{}'::jsonb)) e
    where e.key in ('max_source_groups','max_whatsapp_instances','max_whatsapp_dest_groups','max_telegram_dest_groups')
      and e.value !~ '^\d+$'
  ) then
    raise exception 'limite invalido (numero)' using errcode='P0001', hint='INVALID_LIMIT';
  end if;

  select to_jsonb(pl) into v_before from public.plan_limits pl where pl.plan = p_plan;
  if v_before is null then
    raise exception 'plano nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;

  update public.plan_limits set
    max_source_groups = coalesce((p_patch->>'max_source_groups')::int, max_source_groups),
    max_whatsapp_instances = coalesce((p_patch->>'max_whatsapp_instances')::int, max_whatsapp_instances),
    max_whatsapp_dest_groups = coalesce((p_patch->>'max_whatsapp_dest_groups')::int, max_whatsapp_dest_groups),
    max_telegram_dest_groups = coalesce((p_patch->>'max_telegram_dest_groups')::int, max_telegram_dest_groups),
    allow_shortener = coalesce((p_patch->>'allow_shortener')::boolean, allow_shortener),
    allow_analytics = coalesce((p_patch->>'allow_analytics')::boolean, allow_analytics),
    allow_scheduling = coalesce((p_patch->>'allow_scheduling')::boolean, allow_scheduling),
    remove_branding = coalesce((p_patch->>'remove_branding')::boolean, remove_branding),
    updated_at = now()
  where plan = p_plan;

  select to_jsonb(pl) into v_after from public.plan_limits pl where pl.plan = p_plan;

  -- impacto (aproximado), so pros campos numericos presentes no patch
  if p_patch ? 'max_source_groups' then
    select count(*) into v_imp_src
    from public.profiles p join public.bot_configs bc on bc.user_id = p.id
    where p.plan = p_plan
      and coalesce(jsonb_array_length(to_jsonb(bc.grupos_origem)), 0) > (v_after->>'max_source_groups')::int;
  end if;
  if p_patch ? 'max_whatsapp_instances' or p_patch ? 'max_whatsapp_dest_groups' or p_patch ? 'max_telegram_dest_groups' then
    with per_user as (
      select p.id,
        count(*) filter (where c.type = 'whatsapp') as wc,
        count(*) filter (where c.type = 'telegram') as tc,
        count(distinct c.external_instance_id) filter (where c.type = 'whatsapp') as wi
      from public.profiles p left join public.channels c on c.user_id = p.id
      where p.plan = p_plan group by p.id
    )
    select
      count(*) filter (where wi > (v_after->>'max_whatsapp_instances')::int),
      count(*) filter (where wc > (v_after->>'max_whatsapp_dest_groups')::int),
      count(*) filter (where tc > (v_after->>'max_telegram_dest_groups')::int)
    into v_imp_wi, v_imp_wd, v_imp_td
    from per_user;
    if not (p_patch ? 'max_whatsapp_instances') then v_imp_wi := null; end if;
    if not (p_patch ? 'max_whatsapp_dest_groups') then v_imp_wd := null; end if;
    if not (p_patch ? 'max_telegram_dest_groups') then v_imp_td := null; end if;
  end if;

  perform public.admin_audit_write(p_actor, 'PLAN_LIMITS_UPDATED', 'plan_limits', p_plan, v_before, v_after, null, p_ctx);

  return jsonb_build_object('row', v_after, 'impact', jsonb_build_object(
    'max_source_groups', v_imp_src, 'max_whatsapp_instances', v_imp_wi,
    'max_whatsapp_dest_groups', v_imp_wd, 'max_telegram_dest_groups', v_imp_td));
end; $$;

create or replace function public.admin_system_flag_set(
  p_actor uuid, p_key text, p_value jsonb, p_description text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb;
begin
  if p_key is null or p_key !~ '^[a-z0-9_]{2,40}$' then
    raise exception 'chave invalida' using errcode='P0001', hint='INVALID_KEY';
  end if;
  select to_jsonb(f) into v_before from public.system_flags f where f.key = p_key;
  insert into public.system_flags (key, value, description, updated_by, updated_at)
    values (p_key, coalesce(p_value, 'null'::jsonb), nullif(trim(coalesce(p_description, '')), ''), p_actor, now())
  on conflict (key) do update set
    value = excluded.value,
    description = coalesce(excluded.description, public.system_flags.description),
    updated_by = p_actor, updated_at = now();
  select to_jsonb(f) into v_after from public.system_flags f where f.key = p_key;
  perform public.admin_audit_write(p_actor, 'SYSTEM_FLAG_SET', 'system_flag', p_key, v_before, v_after, null, p_ctx);
  return v_after;
end; $$;

create or replace function public.admin_system_flag_delete(
  p_actor uuid, p_key text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(f) into v_before from public.system_flags f where f.key = p_key;
  if v_before is null then
    raise exception 'flag nao encontrada' using errcode='P0002', hint='NOT_FOUND';
  end if;
  delete from public.system_flags where key = p_key;
  perform public.admin_audit_write(p_actor, 'SYSTEM_FLAG_DELETED', 'system_flag', p_key, v_before, null, null, p_ctx);
  return jsonb_build_object('deleted', true);
end; $$;

create or replace function public.admin_announcement_upsert(
  p_actor uuid, p_id uuid, p_message text, p_level text, p_active boolean,
  p_starts_at text, p_ends_at text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb; v_after jsonb; v_id uuid; v_starts timestamptz; v_ends timestamptz;
begin
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'mensagem vazia' using errcode='P0001', hint='MESSAGE_EMPTY';
  end if;
  if coalesce(p_level, 'info') not in ('info','warning','danger') then
    raise exception 'nivel invalido' using errcode='P0001', hint='INVALID_LEVEL';
  end if;
  begin v_starts := nullif(trim(coalesce(p_starts_at, '')), '')::timestamptz; exception when others then v_starts := null; end;
  begin v_ends := nullif(trim(coalesce(p_ends_at, '')), '')::timestamptz; exception when others then v_ends := null; end;

  if p_id is null then
    insert into public.system_announcements (message, level, active, starts_at, ends_at, created_by)
      values (trim(p_message), coalesce(p_level, 'info'), coalesce(p_active, false), v_starts, v_ends, p_actor)
      returning id into v_id;
  else
    select to_jsonb(a) into v_before from public.system_announcements a where a.id = p_id;
    if v_before is null then
      raise exception 'aviso nao encontrado' using errcode='P0002', hint='NOT_FOUND';
    end if;
    update public.system_announcements set
      message = trim(p_message), level = coalesce(p_level, 'info'), active = coalesce(p_active, false),
      starts_at = v_starts, ends_at = v_ends, updated_at = now()
    where id = p_id;
    v_id := p_id;
  end if;

  select to_jsonb(a) into v_after from public.system_announcements a where a.id = v_id;
  perform public.admin_audit_write(p_actor, 'ANNOUNCEMENT_UPSERTED', 'announcement', v_id::text, v_before, v_after, null, p_ctx);
  return v_after;
end; $$;

create or replace function public.admin_announcement_delete(
  p_actor uuid, p_id uuid, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(a) into v_before from public.system_announcements a where a.id = p_id;
  if v_before is null then
    raise exception 'aviso nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  delete from public.system_announcements where id = p_id;
  perform public.admin_audit_write(p_actor, 'ANNOUNCEMENT_DELETED', 'announcement', p_id::text, v_before, null, null, p_ctx);
  return jsonb_build_object('deleted', true);
end; $$;

-- ==== grants ====

revoke execute on function public.admin_plan_limits_list() from authenticated, anon;
revoke execute on function public.admin_system_flags_list() from authenticated, anon;
revoke execute on function public.admin_announcements_list() from authenticated, anon;
revoke execute on function public.admin_active_announcement() from authenticated, anon;
revoke execute on function public.admin_plan_limits_update(uuid, text, jsonb, jsonb) from authenticated, anon;
revoke execute on function public.admin_system_flag_set(uuid, text, jsonb, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_system_flag_delete(uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_announcement_upsert(uuid, uuid, text, text, boolean, text, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_announcement_delete(uuid, uuid, jsonb) from authenticated, anon;
grant execute on function public.admin_plan_limits_list() to service_role;
grant execute on function public.admin_system_flags_list() to service_role;
grant execute on function public.admin_announcements_list() to service_role;
grant execute on function public.admin_active_announcement() to service_role;
grant execute on function public.admin_plan_limits_update(uuid, text, jsonb, jsonb) to service_role;
grant execute on function public.admin_system_flag_set(uuid, text, jsonb, text, jsonb) to service_role;
grant execute on function public.admin_system_flag_delete(uuid, text, jsonb) to service_role;
grant execute on function public.admin_announcement_upsert(uuid, uuid, text, text, boolean, text, text, jsonb) to service_role;
grant execute on function public.admin_announcement_delete(uuid, uuid, jsonb) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa** (ou por inspecao: `plan_limits`/`channels`/`bot_configs`/`profiles` colunas conferidas nas Global Constraints; a query de leitura e o calculo de impacto ja rodaram contra prod via MCP; `20260901050000` roda depois de `20260901040000`).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901050000_admin_system.sql supabase/tests/manual/20260901050000_admin_system.test.sql
git commit -m "feat(admin): migration do SP7 (system_flags, system_announcements, 9 RPCs)

Docker indisponivel: test.sql por inspecao; leitura + calculo de impacto
rodados contra prod via MCP.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `admin-api` `handlers/system.ts`

**Files:**
- Create: `supabase/functions/admin-api/handlers/system.ts`
- Create: `supabase/functions/admin-api/handlers/system_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`
- Modify: `supabase/functions/admin-api/handlers/_pg-errors.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`, `RbacError` de `rbac.ts`.
- Produces:
  - `reqStr(params, key): string` -> `RbacError('validation', ...)` se ausente.
  - `parseFlagValue(raw): unknown` -> se `raw` e `'true'`/`'false'` devolve bool; senao tenta `JSON.parse`; se falhar, devolve a string crua. (helper puro, testavel.)
  - Handlers: `planLimits`, `flags`, `announcements`, `activeAnnouncement`, `planLimitsUpdate`, `flagSet`, `flagDelete`, `announcementUpsert`, `announcementDelete`.

- [ ] **Step 1: Escrever `handlers/system_test.ts`**

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { parseFlagValue, reqStr } from './system.ts';

Deno.test('reqStr devolve o valor', () => {
  assertEquals(reqStr({ key: ' signups_enabled ' }, 'key'), 'signups_enabled');
});
Deno.test('reqStr ausente lanca', () => {
  assertThrows(() => reqStr({}, 'key'));
  assertThrows(() => reqStr({ key: '' }, 'key'));
});
Deno.test('parseFlagValue: bool, json, string crua', () => {
  assertEquals(parseFlagValue('true'), true);
  assertEquals(parseFlagValue('false'), false);
  assertEquals(parseFlagValue('42'), 42);
  assertEquals(parseFlagValue('{"a":1}'), { a: 1 });
  assertEquals(parseFlagValue('nao e json'), 'nao e json');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/system_test.ts`
Expected: FAIL, `./system.ts` nao encontrado.

- [ ] **Step 3: Escrever `handlers/system.ts`**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqStr(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

// Converte o valor do input do front pra jsonb: 'true'/'false' -> bool,
// senao tenta JSON.parse, senao string crua.
export function parseFlagValue(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  const t = raw.trim();
  if (t === 'true') return true;
  if (t === 'false') return false;
  try { return JSON.parse(t); } catch { return raw; }
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const planLimits: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_plan_limits_list', {});
  if (error) throw new Error(error.message);
  return data;
};

export const flags: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_system_flags_list', {});
  if (error) throw new Error(error.message);
  return data;
};

export const announcements: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_announcements_list', {});
  if (error) throw new Error(error.message);
  return data;
};

export const activeAnnouncement: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_active_announcement', {});
  if (error) throw new Error(error.message);
  return data ?? null;
};

export const planLimitsUpdate: Handler = async (params, identity, ctx) => {
  const plan = reqStr(params, 'plan');
  const patch = params.patch;
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new RbacError('validation', 'patch deve ser um objeto.');
  }
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_plan_limits_update', {
    p_actor: identity.adminId, p_plan: plan, p_patch: patch, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const flagSet: Handler = async (params, identity, ctx) => {
  const key = reqStr(params, 'key');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_system_flag_set', {
    p_actor: identity.adminId, p_key: key,
    p_value: parseFlagValue(params.value),
    p_description: typeof params.description === 'string' ? params.description : null,
    p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const flagDelete: Handler = async (params, identity, ctx) => {
  const key = reqStr(params, 'key');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_system_flag_delete', {
    p_actor: identity.adminId, p_key: key, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const announcementUpsert: Handler = async (params, identity, ctx) => {
  const message = reqStr(params, 'message');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_announcement_upsert', {
    p_actor: identity.adminId,
    p_id: typeof params.id === 'string' && params.id ? params.id : null,
    p_message: message,
    p_level: typeof params.level === 'string' ? params.level : 'info',
    p_active: params.active === true,
    p_starts_at: str(params.startsAt),
    p_ends_at: str(params.endsAt),
    p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const announcementDelete: Handler = async (params, identity, ctx) => {
  const id = reqStr(params, 'id');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_announcement_delete', {
    p_actor: identity.adminId, p_id: id, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
```

- [ ] **Step 4: `_pg-errors.ts`** - acrescentar ao `BY_HINT` (depois de `INVALID_KIND`):

```ts
  INVALID_LIMIT: { code: 'validation', message: 'Limite invalido (use inteiro maior ou igual a zero).' },
  INVALID_KEY: { code: 'validation', message: 'Chave invalida (minusculas, numeros, underscore; 2 a 40 chars).' },
  INVALID_LEVEL: { code: 'validation', message: 'Nivel invalido (info, warning ou danger).' },
  MESSAGE_EMPTY: { code: 'validation', message: 'A mensagem nao pode ficar vazia.' },
```

- [ ] **Step 5: Registrar no `index.ts`**

`import * as system from './handlers/system.ts';` junto aos outros. No `HANDLERS`, depois de `security` (SP6):

```ts
  system: {
    'plan-limits':          { permission: 'system_settings.read',   handler: system.planLimits },
    flags:                  { permission: 'feature_flags.read',     handler: system.flags },
    announcements:          { permission: 'announcements.read',     handler: system.announcements },
    'active-announcement':  { permission: null,                     handler: system.activeAnnouncement },
    'plan-limits-update':   { permission: 'system_settings.manage', handler: system.planLimitsUpdate },
    'flag-set':             { permission: 'feature_flags.manage',   handler: system.flagSet },
    'flag-delete':          { permission: 'feature_flags.manage',   handler: system.flagDelete },
    'announcement-upsert':  { permission: 'announcements.manage',   handler: system.announcementUpsert },
    'announcement-delete':  { permission: 'announcements.manage',   handler: system.announcementDelete },
  },
```

- [ ] **Step 6: Rodar testes + tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (38 do SP6 + 3 de `system_test` = 41), sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-api/handlers/system.ts supabase/functions/admin-api/handlers/system_test.ts supabase/functions/admin-api/index.ts supabase/functions/admin-api/handlers/_pg-errors.ts
git commit -m "feat(admin-api): handlers de Sistema (plan-limits, flags, announcements) + hints

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Rotas + nav + shell + stubs + AnnouncementBanner

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/components/AdminLayout.tsx`
- Create: `admin/src/components/AnnouncementBanner.tsx`
- Create: `admin/src/pages/system/SystemArea.tsx`
- Create: `admin/src/pages/system/{PlanLimitsTab,FlagsTab,AnnouncementsTab}.tsx` (stubs)

**Interfaces:**
- Produces: rota `/system` (SystemArea, 3 abas via `?tab=`) sob `RequirePermission permission="system_settings.read"`. Menu "Sistema" -> "Configuracoes". `AnnouncementBanner` no layout.

- [ ] **Step 1: `admin/src/nav.ts`** - na secao `title: 'Sistema'`:

```ts
    items: [
      { label: 'Configurações', to: '/system', permission: 'system_settings.read', icon: Settings },
    ],
```
(`Settings` ja importado.)

- [ ] **Step 2: `AnnouncementBanner.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { callAdminApi } from '../lib/admin-api';

type Active = { id: string; message: string; level: 'info' | 'warning' | 'danger' } | null;

const TONE: Record<string, string> = {
  info: 'bg-info-bg text-info-ink border-info/25',
  warning: 'bg-warning-bg text-warning-ink border-warning/25',
  danger: 'bg-danger-bg text-danger-ink border-danger/25',
};
const DISMISS_KEY = 'aflyo_admin_dismissed_announcement';

export default function AnnouncementBanner() {
  const [ann, setAnn] = useState<Active>(null);
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return sessionStorage.getItem(DISMISS_KEY); } catch { return null; }
  });

  useEffect(() => {
    let alive = true;
    callAdminApi<Active>('system', 'active-announcement', {})
      .then((a) => { if (alive) setAnn(a); })
      .catch(() => { /* silencioso */ });
    return () => { alive = false; };
  }, []);

  if (!ann || ann.id === dismissed) return null;
  return (
    <div className={`flex items-center justify-between gap-3 border-b px-6 py-2 text-sm ${TONE[ann.level] ?? TONE.info}`}>
      <span>{ann.message}</span>
      <button
        type="button"
        onClick={() => {
          try { sessionStorage.setItem(DISMISS_KEY, ann.id); } catch { /* ignore */ }
          setDismissed(ann.id);
        }}
        className="shrink-0 text-xs font-semibold underline"
      >
        dispensar
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `AdminLayout.tsx`** - inserir o banner:

```tsx
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import AnnouncementBanner from './AnnouncementBanner';

export default function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-surface-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <AnnouncementBanner />
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `SystemArea.tsx`**

```tsx
import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import PlanLimitsTab from './PlanLimitsTab';
import FlagsTab from './FlagsTab';
import AnnouncementsTab from './AnnouncementsTab';

const TABS = [
  { key: 'limites', label: 'Limites de plano' },
  { key: 'flags', label: 'Flags' },
  { key: 'avisos', label: 'Avisos' },
] as const;

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}

export default function SystemArea() {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'limites';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  const can = (p: string) => hasPermission(perms, p);
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Configurações</h1>
        <p className="mt-1 text-sm text-ink-secondary">Limites de plano, feature flags e avisos.</p>
      </header>
      <div className="flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-sm font-semibold transition-colors ${
              active === t.key ? 'border-b-2 border-ink text-ink' : 'text-ink-secondary hover:text-ink'
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {active === 'limites' && (can('system_settings.read') ? <PlanLimitsTab /> : <NoPerm />)}
      {active === 'flags' && (can('feature_flags.read') ? <FlagsTab /> : <NoPerm />)}
      {active === 'avisos' && (can('announcements.read') ? <AnnouncementsTab /> : <NoPerm />)}
    </section>
  );
}
```

- [ ] **Step 5: Stubs** (`PlanLimitsTab.tsx` / `FlagsTab.tsx` / `AnnouncementsTab.tsx`):

```tsx
// Placeholder da Task 3. Tela real na Task 4/5/6.
export default function PlanLimitsTab() {
  return <p className="text-sm text-ink-secondary">Limites de plano</p>;
}
```
(trocar nome/texto por arquivo)

- [ ] **Step 6: `App.tsx`** - import `import SystemArea from './pages/system/SystemArea';`; rota antes de `path="*"`:

```tsx
          <Route path="/system" element={<RequirePermission permission="system_settings.read"><SystemArea /></RequirePermission>} />
```

- [ ] **Step 7: Rodar testes + build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: 78 testes passam (nada novo quebra). O `App.test.tsx` monta o `AdminLayout`; se ele chamar `callAdminApi` de verdade, o `AnnouncementBanner` faz um fetch -> conferir que `App.test` ja mocka `admin-api` OU que o catch silencioso segura. Se `App.test` quebrar por causa do banner, mockar `../components/AnnouncementBanner` como `() => null` no teste do App.

- [ ] **Step 8: Commit**

```bash
git add admin/src/nav.ts admin/src/App.tsx admin/src/components/AdminLayout.tsx admin/src/components/AnnouncementBanner.tsx admin/src/pages/system/
git commit -m "feat(admin): rota /system com 3 abas + AnnouncementBanner no layout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `PlanLimitsTab`

**Files:**
- Modify: `admin/src/pages/system/PlanLimitsTab.tsx`
- Create: `admin/src/pages/system/PlanLimitsTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `useAdminAuth`, `useToast`, `hasPermission`, `Skeleton`, `ErrorState`.

**Shapes:**
- `system/plan-limits` -> `{ items: Array<{ plan, max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups, max_telegram_dest_groups, allow_shortener, allow_analytics, allow_scheduling, remove_branding, updated_at }> }`
- `system/plan-limits-update` -> `{ row: {...}, impact: { max_source_groups: number|null, max_whatsapp_instances: number|null, max_whatsapp_dest_groups: number|null, max_telegram_dest_groups: number|null } }`

- [ ] **Step 1: `PlanLimitsTab.test.tsx`**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], perms: { value: ['system_settings.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'plan-limits') return Promise.resolve({ items: [
      { plan: 'free', max_source_groups: 0, max_whatsapp_instances: 0, max_whatsapp_dest_groups: 0, max_telegram_dest_groups: 0, allow_shortener: false, allow_analytics: false, allow_scheduling: false, remove_branding: false, updated_at: '2026-08-30T00:00:00Z' },
      { plan: 'pro', max_source_groups: 6, max_whatsapp_instances: 2, max_whatsapp_dest_groups: 12, max_telegram_dest_groups: 12, allow_shortener: true, allow_analytics: true, allow_scheduling: true, remove_branding: false, updated_at: '2026-08-30T00:00:00Z' },
    ] });
    if (action === 'plan-limits-update') return Promise.resolve({ row: {}, impact: { max_source_groups: 2, max_whatsapp_instances: null, max_whatsapp_dest_groups: null, max_telegram_dest_groups: null } });
    return Promise.resolve({});
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import PlanLimitsTab from './PlanLimitsTab';

beforeEach(() => { h.perms.value = ['system_settings.read']; h.calls.length = 0; });

it('lista os planos; sem manage nao mostra Salvar', async () => {
  render(<MemoryRouter><PlanLimitsTab /></MemoryRouter>);
  await screen.findByText('pro');
  expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
});

it('com manage, editar e salvar chama plan-limits-update e mostra o impacto', async () => {
  h.perms.value = ['system_settings.read', 'system_settings.manage'];
  render(<MemoryRouter><PlanLimitsTab /></MemoryRouter>);
  await screen.findByText('pro');
  const input = screen.getAllByLabelText(/grupos de origem/i)[1]; // linha do pro
  await userEvent.clear(input);
  await userEvent.type(input, '2');
  await userEvent.click(screen.getAllByRole('button', { name: /salvar/i })[1]);
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[1]).toBe('plan-limits-update');
    expect((last[2] as { plan?: string }).plan).toBe('pro');
    expect((last[2] as { patch?: Record<string, unknown> }).patch).toMatchObject({ max_source_groups: '2' });
  });
  expect(await screen.findByText(/2 conta/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/system/PlanLimitsTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `PlanLimitsTab.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Row = {
  plan: string;
  max_source_groups: number; max_whatsapp_instances: number;
  max_whatsapp_dest_groups: number; max_telegram_dest_groups: number;
  allow_shortener: boolean; allow_analytics: boolean;
  allow_scheduling: boolean; remove_branding: boolean;
  updated_at: string;
};
type Impact = Record<'max_source_groups' | 'max_whatsapp_instances' | 'max_whatsapp_dest_groups' | 'max_telegram_dest_groups', number | null>;

const NUM_FIELDS: Array<{ key: keyof Row; label: string }> = [
  { key: 'max_source_groups', label: 'Grupos de origem' },
  { key: 'max_whatsapp_instances', label: 'Instancias WhatsApp' },
  { key: 'max_whatsapp_dest_groups', label: 'Grupos destino WhatsApp' },
  { key: 'max_telegram_dest_groups', label: 'Grupos destino Telegram' },
];
const BOOL_FIELDS: Array<{ key: keyof Row; label: string }> = [
  { key: 'allow_shortener', label: 'Encurtador' },
  { key: 'allow_analytics', label: 'Analytics' },
  { key: 'allow_scheduling', label: 'Agendamento' },
  { key: 'remove_branding', label: 'Sem marca' },
];

function PlanCard({ row, canManage }: { row: Row; canManage: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);

  const dirtyKeys = Object.keys(draft);
  const val = (k: keyof Row): string | boolean => (k in draft ? draft[k] : (row[k] as string | boolean));

  const save = async () => {
    if (dirtyKeys.length === 0) return;
    setBusy(true);
    setImpact(null);
    try {
      const res = await callAdminApi<{ impact: Impact }>('system', 'plan-limits-update', {
        plan: row.plan,
        patch: Object.fromEntries(dirtyKeys.map((k) => [k, typeof draft[k] === 'boolean' ? draft[k] : String(draft[k])])),
      });
      setImpact(res.impact);
      setDraft({});
      toast('Limites salvos.');
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold text-ink capitalize">{row.plan}</h3>
        {canManage && (
          <button type="button" onClick={save} disabled={busy || dirtyKeys.length === 0}
            className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50">
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUM_FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-ink-secondary">
            {f.label}
            <input
              type="number" min={0} aria-label={`${f.label} ${row.plan}`}
              value={String(val(f.key))}
              disabled={!canManage}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {BOOL_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-xs text-ink">
            <input
              type="checkbox" checked={Boolean(val(f.key))} disabled={!canManage}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
            />
            {f.label}
          </label>
        ))}
      </div>
      {impact && (
        <ul className="mt-3 space-y-0.5 text-[11px] text-warning-ink">
          {NUM_FIELDS.map((f) => {
            const n = impact[f.key as keyof Impact];
            if (n == null || n === 0) return null;
            return <li key={f.key}>{f.label}: {n} conta(s) do plano {row.plan} passam do novo limite (aproximado).</li>;
          })}
        </ul>
      )}
    </div>
  );
}

export default function PlanLimitsTab() {
  const { identity } = useAdminAuth();
  const canManage = hasPermission(identity?.permissions ?? [], 'system_settings.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Row[] }>('system', 'plan-limits', {}),
    [],
  );
  const rows = useMemo(() => data?.items ?? [], [data]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-3">
      {!canManage && <p className="text-xs text-ink-secondary">Somente leitura (falta system_settings.manage).</p>}
      {rows.map((r) => <PlanCard key={r.plan} row={r} canManage={canManage} />)}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/system/PlanLimitsTab.test.tsx`
Expected: PASS (2 testes).

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK. (Se o lint reclamar de `Date`/purity, mover qualquer `new Date()` pra dentro de callback; aqui nao ha.)

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/system/PlanLimitsTab.tsx admin/src/pages/system/PlanLimitsTab.test.tsx
git commit -m "feat(admin): aba Limites de plano (grid editavel + impacto ao salvar)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `FlagsTab`

**Files:**
- Modify: `admin/src/pages/system/FlagsTab.tsx`
- Create: `admin/src/pages/system/FlagsTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `useAdminAuth`, `useToast`, `hasPermission`, `Skeleton`, `ErrorState`.

**Shapes:**
- `system/flags` -> `{ items: Array<{ key: string, value: unknown, description: string | null, updated_at: string }> }`
- `system/flag-set` -> a row. `system/flag-delete` -> `{ deleted: true }`.

- [ ] **Step 1: `FlagsTab.test.tsx`**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], perms: { value: ['feature_flags.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'flags') return Promise.resolve({ items: [
      { key: 'signups_enabled', value: true, description: 'Permite cadastros', updated_at: '2026-09-01T00:00:00Z' },
      { key: 'welcome_text', value: 'ola', description: null, updated_at: '2026-09-01T00:00:00Z' },
    ] });
    return Promise.resolve({ key: 'signups_enabled', value: false });
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import FlagsTab from './FlagsTab';

beforeEach(() => { h.perms.value = ['feature_flags.read']; h.calls.length = 0; });

it('lista as flags; sem manage nao mostra controles de edicao', async () => {
  render(<MemoryRouter><FlagsTab /></MemoryRouter>);
  await screen.findByText('signups_enabled');
  expect(screen.getByText('welcome_text')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /adicionar/i })).not.toBeInTheDocument();
});

it('com manage, alternar um toggle bool chama flag-set', async () => {
  h.perms.value = ['feature_flags.read', 'feature_flags.manage'];
  render(<MemoryRouter><FlagsTab /></MemoryRouter>);
  await screen.findByText('signups_enabled');
  await userEvent.click(screen.getByLabelText(/signups_enabled/i));
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[1]).toBe('flag-set');
    expect((last[2] as { key?: string; value?: unknown }).key).toBe('signups_enabled');
    expect((last[2] as { value?: unknown }).value).toBe('false');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/system/FlagsTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `FlagsTab.tsx`**

```tsx
import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Flag = { key: string; value: unknown; description: string | null; updated_at: string };

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function display(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export default function FlagsTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'feature_flags.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Flag[] }>('system', 'flags', {}),
    [],
  );
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('true');
  const [newDesc, setNewDesc] = useState('');

  const setFlag = async (key: string, value: string, description?: string) => {
    try {
      await callAdminApi('system', 'flag-set', { key, value, description });
      toast('Flag salva.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao salvar a flag.');
    }
  };
  const delFlag = async (key: string) => {
    try {
      await callAdminApi('system', 'flag-delete', { key });
      toast('Flag removida.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao remover.');
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-xs text-ink-secondary">
        Cada flag so tem efeito quando a aplicacao ou uma Edge Function ler ela. O painel so registra.
      </p>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-1">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Chave</th>
              <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Valor</th>
              <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Descricao</th>
              {canManage && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {data.items.map((f) => (
              <tr key={f.key} className="border-b border-line-subtle last:border-0">
                <td className="px-3 py-2 font-mono text-ink">{f.key}</td>
                <td className="px-3 py-2">
                  {isBool(f.value) ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox" aria-label={`${f.key} valor`} checked={f.value} disabled={!canManage}
                        onChange={(e) => setFlag(f.key, e.target.checked ? 'true' : 'false')}
                      />
                      <span className="text-xs text-ink-secondary">{String(f.value)}</span>
                    </label>
                  ) : canManage ? (
                    <input
                      type="text" defaultValue={display(f.value)} aria-label={`${f.key} valor`}
                      onBlur={(e) => { if (e.target.value !== display(f.value)) setFlag(f.key, e.target.value); }}
                      className="w-40 rounded-lg border border-line bg-surface-0 px-2 py-1 text-xs text-ink"
                    />
                  ) : (
                    <span className="font-mono text-xs text-ink">{display(f.value)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-secondary">{f.description ?? '-'}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => delFlag(f.key)} className="text-xs font-semibold text-danger-ink">
                      remover
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-0 p-4 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newKey.trim()) return;
            setFlag(newKey.trim(), newVal, newDesc.trim() || undefined);
            setNewKey(''); setNewVal('true'); setNewDesc('');
          }}
        >
          <label className="text-xs text-ink-secondary">
            Chave
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="minha_flag"
              className="mt-1 block w-40 rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-secondary">
            Valor
            <input value={newVal} onChange={(e) => setNewVal(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-secondary">
            Descricao
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              className="mt-1 block w-56 rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <button type="submit" className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0">
            Adicionar
          </button>
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/system/FlagsTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/system/FlagsTab.tsx admin/src/pages/system/FlagsTab.test.tsx
git commit -m "feat(admin): aba Flags (registro de feature flags, CRUD gated)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `AnnouncementsTab` + teste do `AnnouncementBanner`

**Files:**
- Modify: `admin/src/pages/system/AnnouncementsTab.tsx`
- Create: `admin/src/pages/system/AnnouncementsTab.test.tsx`
- Create: `admin/src/components/AnnouncementBanner.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `useAdminAuth`, `useToast`, `hasPermission`, `Badge`, `Skeleton`, `ErrorState`.

**Shapes:**
- `system/announcements` -> `{ items: Array<{ id, message, level, active, starts_at, ends_at, created_at, updated_at }> }`
- `system/announcement-upsert` -> a row. `system/announcement-delete` -> `{ deleted: true }`.
- `system/active-announcement` -> `{ id, message, level } | null`

- [ ] **Step 1: `AnnouncementsTab.test.tsx`**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], perms: { value: ['announcements.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'announcements') return Promise.resolve({ items: [
      { id: 'a1', message: 'Manutencao domingo', level: 'warning', active: true, starts_at: null, ends_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
    ] });
    return Promise.resolve({ id: 'a2', message: 'novo', level: 'info', active: false });
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import AnnouncementsTab from './AnnouncementsTab';

beforeEach(() => { h.perms.value = ['announcements.read']; h.calls.length = 0; });

it('lista os avisos; sem manage nao mostra o form', async () => {
  render(<MemoryRouter><AnnouncementsTab /></MemoryRouter>);
  await screen.findByText('Manutencao domingo');
  expect(screen.queryByRole('button', { name: /publicar|criar/i })).not.toBeInTheDocument();
});

it('com manage, criar um aviso chama announcement-upsert', async () => {
  h.perms.value = ['announcements.read', 'announcements.manage'];
  render(<MemoryRouter><AnnouncementsTab /></MemoryRouter>);
  await screen.findByText('Manutencao domingo');
  await userEvent.type(screen.getByLabelText(/mensagem/i), 'Aviso novo');
  await userEvent.click(screen.getByRole('button', { name: /criar/i }));
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[1]).toBe('announcement-upsert');
    expect((last[2] as { message?: string }).message).toBe('Aviso novo');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/system/AnnouncementsTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `AnnouncementsTab.tsx`**

```tsx
import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Ann = {
  id: string; message: string; level: 'info' | 'warning' | 'danger'; active: boolean;
  starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string;
};
const TONE: Record<string, 'info' | 'warning' | 'danger'> = { info: 'info', warning: 'warning', danger: 'danger' };

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function AnnouncementsTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'announcements.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Ann[] }>('system', 'announcements', {}),
    [],
  );
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<'info' | 'warning' | 'danger'>('info');
  const [active, setActive] = useState(false);

  const create = async () => {
    if (!message.trim()) return;
    try {
      await callAdminApi('system', 'announcement-upsert', { message: message.trim(), level, active });
      toast('Aviso publicado.');
      setMessage(''); setLevel('info'); setActive(false);
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao publicar.');
    }
  };
  const toggleActive = async (a: Ann) => {
    try {
      await callAdminApi('system', 'announcement-upsert', {
        id: a.id, message: a.message, level: a.level, active: !a.active,
        startsAt: a.starts_at ?? '', endsAt: a.ends_at ?? '',
      });
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao atualizar.');
    }
  };
  const remove = async (id: string) => {
    try {
      await callAdminApi('system', 'announcement-delete', { id });
      toast('Aviso removido.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao remover.');
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {canManage && (
        <form
          className="space-y-2 rounded-xl border border-line bg-surface-0 p-4 shadow-card"
          onSubmit={(e) => { e.preventDefault(); create(); }}
        >
          <label className="block text-xs text-ink-secondary">
            Mensagem
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
              className="mt-1 block w-full rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-ink-secondary">
              Nivel
              <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}
                className="ml-2 rounded-lg border border-line bg-surface-0 px-2 py-1 text-sm text-ink">
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="danger">danger</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> ativo
            </label>
            <button type="submit" className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0">
              Criar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {data.items.length === 0 && <p className="text-xs text-ink-secondary">Nenhum aviso.</p>}
        {data.items.map((a) => (
          <div key={a.id} className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[a.level]}>{a.level}</Badge>
              {a.active ? <Badge tone="success">ativo</Badge> : <Badge>inativo</Badge>}
              <span className="text-sm text-ink">{a.message}</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-tertiary">
              janela: {fmt(a.starts_at)} a {fmt(a.ends_at)} | criado {fmt(a.created_at)}
            </p>
            {canManage && (
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => toggleActive(a)} className="text-xs font-semibold text-ink-secondary">
                  {a.active ? 'desativar' : 'ativar'}
                </button>
                <button type="button" onClick={() => remove(a.id)} className="text-xs font-semibold text-danger-ink">
                  remover
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/system/AnnouncementsTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: `AnnouncementBanner.test.tsx`**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ resp: null as unknown }));
vi.mock('../lib/admin-api', () => ({
  callAdminApi: () => Promise.resolve(h.resp),
  AdminApiError: class extends Error {},
}));

import AnnouncementBanner from './AnnouncementBanner';

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  h.resp = null;
});

it('sem aviso ativo, nao renderiza nada', async () => {
  const { container } = render(<AnnouncementBanner />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('com aviso ativo, mostra a mensagem e dispensa na sessao', async () => {
  h.resp = { id: 'a1', message: 'Manutencao', level: 'warning' };
  render(<AnnouncementBanner />);
  expect(await screen.findByText('Manutencao')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /dispensar/i }));
  await waitFor(() => expect(screen.queryByText('Manutencao')).not.toBeInTheDocument());
  expect(sessionStorage.getItem('aflyo_admin_dismissed_announcement')).toBe('a1');
});
```

- [ ] **Step 6: Rodar os testes de system + banner + build + lint**

Run:
```bash
npx --prefix admin vitest run src/pages/system/ src/components/AnnouncementBanner.test.tsx
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: PASS, build + lint OK.

- [ ] **Step 7: Commit**

```bash
git add admin/src/pages/system/AnnouncementsTab.tsx admin/src/pages/system/AnnouncementsTab.test.tsx admin/src/components/AnnouncementBanner.test.tsx
git commit -m "feat(admin): aba Avisos (CRUD) + teste do AnnouncementBanner

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: Verificacao final + deploy

**Files:** nenhum (verificacao; correcoes pontuais se algo falhar).

- [ ] **Step 1: Suite completa**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
npm --prefix admin run lint
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: tudo verde.

- [ ] **Step 2: Migration por inspecao**

`20260901050000`: so `create table if not exists` + `create policy` + `insert ... on conflict` + `create or replace function` + `revoke`/`grant`; roda depois de `20260901040000`; colunas de `plan_limits`/`channels`/`bot_configs`/`profiles` conferidas (Global Constraints).

- [ ] **Step 3: Em-dash sweep**

Run: `python -c "import glob; [print(f, open(f,encoding='utf-8').read().count(chr(8212))) for f in glob.glob('admin/src/pages/system/*.tsx') + ['admin/src/components/AnnouncementBanner.tsx','supabase/migrations/20260901050000_admin_system.sql','supabase/functions/admin-api/handlers/system.ts','docs/superpowers/plans/2026-09-07-admin-panel-sp7-sistema.md','docs/superpowers/specs/2026-09-07-admin-panel-sp7-sistema-design.md']]"`
Expected: 0 em cada.

- [ ] **Step 4: PR**

```bash
git push -u origin feat/admin-sp7-sistema
gh pr create --base main --head feat/admin-sp7-sistema \
  --title "Painel admin SP7: Sistema (Configuracoes: plan_limits, flags, avisos)" \
  --body "$(cat <<'EOF'
Ver docs/superpowers/specs/2026-09-07-admin-panel-sp7-sistema-design.md. Uma fase, SQL puro. Editor de plan_limits com calculo de impacto, registro de feature flags, avisos com banner no topo do painel. Empilha sobre #44, #47, #48, #49, #51, #52, #54.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Handoff de deploy pro usuario**

1. Aplicar `20260901050000_admin_system.sql` no SQL Editor (ou via MCP `apply_migration`). Conferir: `select proname from pg_proc where proname like 'admin_plan_limits%' or proname like 'admin_system_flag%' or proname like 'admin_announcement%' or proname = 'admin_active_announcement';` -> 9 linhas. E `select count(*) from public.system_flags;` -> 3.
2. `supabase functions deploy admin-api --project-ref zuqaccivowbzdfrpgekz`.
3. `cd admin` ; `vercel deploy --prod --yes` ; `cd ..`.

Smoke test pos-deploy (login SUPER_ADMIN):
- `/system` -> aba **Limites de plano**: 4 planos, editar `max_source_groups` do pro pra 1 e Salvar -> deve mostrar "2 conta(s) do plano pro passam do novo limite" (valor real de hoje). Reverter pra 6.
- Aba **Flags**: as 3 seed (signups_enabled, checkout_enabled, maintenance_mode). Alternar uma, ver no `/audit` o `SYSTEM_FLAG_SET`.
- Aba **Avisos**: criar um aviso `info` ativo -> o banner aparece no topo de toda pagina; "dispensar" some ate recarregar a aba (sessionStorage). Desativar -> banner some.
- Com um admin SUPPORT: ve as 3 abas em leitura, sem botoes de salvar/adicionar.

- [ ] **Step 6: Atualizar a memoria**

`project_admin_panel.md` + `MEMORY.md`: SP7 implementado, PR, estado do deploy. Proximo: SP8 (Equipe).

---

## Self-Review

**1. Spec coverage:**

| Spec | Task |
|---|---|
| Migration: `system_flags` + `system_announcements` + seed + RLS | Task 1 |
| Matriz de roles (SUPER_ADMIN 6, SUPPORT 3 read) | Task 1 |
| 4 read RPCs (`plan_limits_list`, `system_flags_list`, `announcements_list`, `active_announcement`) | Task 1 |
| 5 write RPCs (`plan_limits_update` com impacto, `flag_set`, `flag_delete`, `announcement_upsert`, `announcement_delete`) | Task 1 |
| Impacto: `max_source_groups` via `grupos_origem`; `max_whatsapp_instances` via `distinct external_instance_id`; wa/tg dest via count por tipo; `null` por campo ausente | Task 1 |
| admin-api handlers (9) + `parseFlagValue` | Task 2 |
| `_pg-errors` hints `INVALID_LIMIT`/`INVALID_KEY`/`INVALID_LEVEL`/`MESSAGE_EMPTY` | Task 2 |
| `system/active-announcement` `permission: null` | Task 2 |
| nav "Sistema" -> "Configuracoes" `/system`, tira comingSoon | Task 3 |
| Rota `/system` sob `RequirePermission permission="system_settings.read"` | Task 3 |
| SystemArea 3 abas, cada uma checa a permissao de leitura | Task 3 |
| `AnnouncementBanner` entre Topbar e main, cor por nivel, dispensa por sessionStorage | Task 3 + Task 6 |
| PlanLimitsTab: grid 4 planos, 4 num + 4 bool, salvar so os alterados, mostra impacto, read-only sem `system_settings.manage` | Task 4 |
| FlagsTab: tabela + toggle bool / input texto + add + remover, gated `feature_flags.manage`, aviso "so registra" | Task 5 |
| AnnouncementsTab: lista + form (msg/nivel/ativo) + ativar/desativar + remover, gated `announcements.manage` | Task 6 |
| Verificacao + deploy + memoria | Task 7 |
| Fora de escopo (sem wire de consumidores, sem src/, sem editar catalogo de perms) | nenhuma task viola; Global Constraints |

Sem lacuna.

**2. Placeholder scan:** todos os steps de codigo tem codigo real. Task 3 Step 7 nota condicional ("se App.test quebrar, mockar o banner") - e uma contingencia com a acao dada, nao um placeholder. "conferir a contagem de testes" nos steps de verificacao e verificacao.

**3. Type consistency:**
- `reqStr(params, key)` (Task 2) reusado nos handlers da Task 2.
- `parseFlagValue` (Task 2) -> usado no `flagSet`; o teste (Task 2 Step 1) cobre bool/json/string.
- Actions no `HANDLERS`: `system/{plan-limits,flags,announcements,active-announcement,plan-limits-update,flag-set,flag-delete,announcement-upsert,announcement-delete}` (Task 2) == strings usadas no front (Tasks 3-6).
- Shapes RPC (Task 1) == consumo handler (Task 2) == consumo front:
  - `admin_plan_limits_list` -> `{ items: Row[] }` (Task 4).
  - `admin_plan_limits_update` -> `{ row, impact }` com `impact` chaveado pelos 4 campos numericos, `null` por ausente (Task 1) == `PlanCard` le `res.impact` e itera `NUM_FIELDS` (Task 4).
  - `admin_system_flags_list` -> `{ items: [{ key, value, description, updated_at }] }` (Task 1) == `Flag` type (Task 5). `value` e `unknown` (jsonb); `isBool`/`display` no front.
  - `admin_announcements_list` -> `{ items: [{ id, message, level, active, starts_at, ends_at, created_at, updated_at }] }` (Task 1) == `Ann` type (Task 6).
  - `admin_active_announcement` -> `{ id, message, level } | null` (Task 1) == `Active` type no banner (Task 3).
- `announcement-upsert` params: front manda `message`, `level`, `active`, e opcional `id`/`startsAt`/`endsAt` (Task 6) == handler le `params.id/message/level/active/startsAt/endsAt` (Task 2) == RPC `p_id/p_message/p_level/p_active/p_starts_at/p_ends_at` (Task 1). Consistente.
- `plan-limits-update` params: front manda `{ plan, patch }` com `patch` = objeto de strings (num) e bools (Task 4) == handler valida `patch` e repassa como `p_patch` jsonb (Task 2) == RPC le `p_patch->>'campo'` e `p_patch ? 'campo'` (Task 1). Consistente.
- Permissoes: `system_settings.read/manage`, `feature_flags.read/manage`, `announcements.read/manage` - todas ja no catalogo; a matriz e adicionada na Task 1; o front checa via `hasPermission`.

**4. Ordem:** 1 (migration) -> 2 (handlers) -> 3 (rotas+shell+banner) -> 4/5/6 (abas + teste do banner) -> 7 (verificacao+deploy). Rodar em ordem.
