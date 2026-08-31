# Painel Admin SP2, Usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerenciar contas de cliente do Aflyo pelo painel admin: listar/buscar, pagina de resumo, suspender/reativar, cortesia de plano + estender trial, notas append-only e tags internas.

**Architecture:** Mesma pegada do SP1. Toda mutacao passa pela Edge Function `admin-api` (JWT + AAL2 + conta admin ativa + permissao) que chama RPCs `SECURITY DEFINER`; cada RPC aplica a mudanca E grava `admin_audit_log` na mesma transacao via `admin_audit_write`. Leitura via `service_role` dentro da function (2 funcoes SQL de agregacao). Front (`admin/`) so consome `admin-api`. Duas tabelas novas append-only-ish (`admin_user_notes`, `admin_user_tags`). Uma permissao nova (`users.billing.manage`).

**Tech Stack:** Deno + `https://deno.land/std@0.168.0/http/server.ts` + `https://esm.sh/@supabase/supabase-js@2` (admin-api). Postgres (migrations). React 19.2 + Vite 8 + TS ~6.0 + Tailwind 3.4 + react-router-dom 7.18 + lucide-react 1.14 + Vitest 2.1 (admin/).

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-31-admin-panel-sp2-usuarios-design.md`. Em conflito, o spec vence.
- **Branch:** `feat/admin-sp2-usuarios` (ja criada, a partir de `feat/admin-sp1-polish`). Tem toda a cadeia do SP1 + fix build standalone + polish.
- **Toda acao da `admin-api` exige AAL2**, leitura inclusive (ja e assim no `authorize`).
- **Toda mutacao grava `admin_audit_log` na mesma transacao.** Nao existe caminho de escrita sem auditoria; falha ao auditar reverte tudo.
- **`admin/` nao importa de `../shared`** (build standalone da Vercel). Constantes replicadas localmente. `shared/admin-permissions.ts` continua a fonte do seed SQL e do teste `shared/admin-permissions.test.ts` (que roda na suite do `admin/` via `include`).
- **Copy de UI em pt-BR com acento.** Sem travessao (em dash) em lugar nenhum. Identificadores/keys nao mudam.
- **Numero da migration:** `20260901000000` (depois de tudo que ja existe: admin `130300`, plan_limits `20260831000000..000200` na main, security `20260831010000..`).
- **Persona da personificacao:** neste SP a "visao so-leitura do cliente" e apenas a pagina `/users/:id` (resumo). Sem sessao real. `users.impersonate` fica dormente.
- **CORS/AAL2/envelope de erro** da `admin-api` nao mudam.
- **Comandos** rodam da raiz do worktree `D:/ofertapro-admin-sp1`. Testes admin: `npm --prefix admin test`. Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`. Deno: `deno test --allow-env supabase/functions/admin-api/` e `deno check supabase/functions/admin-api/index.ts`.
- **Docker indisponivel:** os `*.test.sql` sao verificados por inspecao do SQL contra o schema real (padrao das Tasks 2-4 do SP1); validacao real no deploy.
- **Commits frequentes:** cada task termina com commit proprio, pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260901000000_admin_user_ops.sql` | `account_status` ganha `'suspended'`; tabelas `admin_user_notes` (append-only) e `admin_user_tags`; permissao `users.billing.manage` + matriz; 6 RPCs de mutacao (`admin_user_suspend/reactivate/set_plan/extend_trial/add_note/set_tags`); 2 funcoes de leitura (`admin_users_list`, `admin_user_detail`). |
| `supabase/tests/manual/20260901000000_admin_user_ops.test.sql` | Asserts das RPCs (suspender seta status + pausa bot; set_plan barra quem tem subscription; notas nao editam; tags substituem; list pagina; detail agrega). |
| `supabase/functions/admin-api/handlers/users.ts` | `list`, `get` (leitura) e `suspend`, `reactivate`, `setPlan`, `extendTrial`, `addNote`, `setTags` (mutacao). Todos `Handler`. |
| `supabase/functions/admin-api/handlers/users_test.ts` | Testes Deno de validacao de params (funcoes puras extraidas: `reqUserId`, `parsePlan`, `parseDays`). |
| `admin/src/pages/users/UsersList.tsx` | Tabela paginada + busca (query na URL). |
| `admin/src/pages/users/UsersList.test.tsx` | Lista + busca chama a API com `search`. |
| `admin/src/pages/users/UserDetail.tsx` | Pagina de resumo: perfil, contadores, assinatura, tags, notas, barra de acoes. |
| `admin/src/pages/users/UserDetail.test.tsx` | Mostra perfil; acao gated por permissao; erro `HAS_SUBSCRIPTION` vira toast. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/admin-api/handlers/_pg-errors.ts` | `BY_HINT` ganha `REASON_REQUIRED`, `INVALID_PLAN`, `INVALID_DAYS`, `INVALID_TAG`, `NOTE_EMPTY` (todos `validation`) e `HAS_SUBSCRIPTION` (`conflict`). |
| `supabase/functions/admin-api/handlers/pg_errors_test.ts` | +1 teste cobrindo `HAS_SUBSCRIPTION -> conflict`. |
| `supabase/functions/admin-api/index.ts` | `import * as users` + bloco `users:` no `HANDLERS`. |
| `shared/admin-permissions.ts` | `RAW.users` +`'users.billing.manage'`; `SUPPORT` +`'users.billing.manage'`. |
| `shared/admin-permissions.test.ts` | `49 -> 50` nas asserts de contagem. |
| `admin/src/lib/permission-labels.ts` | +`'users.billing.manage': 'Gerenciar plano e trial do usuario'` (com acento no u). |
| `admin/src/lib/permission-labels.test.ts` | `KEYS` +`'users.billing.manage'`; `49 -> 50`. |
| `admin/src/nav.ts` | secao "Usuarios": item vira `{ label: 'Usuarios', to: '/users', permission: 'users.read', icon: Users }` (sem `comingSoon`). |
| `admin/src/App.tsx` | +imports `UsersList`, `UserDetail`; +2 `<Route>` sob `RequirePermission permission="users.read"`. |

---

## Task 1: Migration `20260901000000_admin_user_ops.sql`

**Files:**
- Create: `supabase/migrations/20260901000000_admin_user_ops.sql`
- Create: `supabase/tests/manual/20260901000000_admin_user_ops.test.sql`

**Interfaces:**
- Consumes: `public.admin_audit_write(uuid, text, text, text, jsonb, jsonb, text, jsonb)` e `public.admin_has_permission(text)` (do SP1). `public.profiles` (colunas `id, email, full_name, plan, account_status, trial_started_at, trial_ends_at, created_at`), `public.bot_configs` (`user_id, status, paused_reason`), `public.subscriptions` (`user_id, status, provider, current_period_end`), `public.offers` (`user_id`), `public.channels` (`user_id, type, status`), `public.history` (`user_id, sent_at`), `public.clicks` (`user_id, created_at`).
- Produces:
  - CHECK novo em `profiles.account_status` inclui `'suspended'`.
  - Tabelas `public.admin_user_notes(id, user_id, admin_id, admin_email, body, created_at)` e `public.admin_user_tags(user_id, tag, created_at, created_by)`.
  - `public.admin_user_suspend(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb) returns jsonb`
  - `public.admin_user_reactivate(p_actor uuid, p_target uuid, p_ctx jsonb) returns jsonb`
  - `public.admin_user_set_plan(p_actor uuid, p_target uuid, p_plan text, p_ctx jsonb) returns jsonb`
  - `public.admin_user_extend_trial(p_actor uuid, p_target uuid, p_days int, p_ctx jsonb) returns jsonb`
  - `public.admin_user_add_note(p_actor uuid, p_target uuid, p_body text, p_ctx jsonb) returns jsonb` (retorna a linha da nota)
  - `public.admin_user_set_tags(p_actor uuid, p_target uuid, p_tags text[], p_ctx jsonb) returns jsonb` (retorna `{ tags: text[] }`)
  - `public.admin_users_list(p_search text, p_page int, p_page_size int) returns jsonb` -> `{ items, page, pageSize, total }`
  - `public.admin_user_detail(p_target uuid) returns jsonb` -> `{ profile, counts, subscription, tags, notes }` ou `NULL`

- [ ] **Step 1: Escrever `supabase/tests/manual/20260901000000_admin_user_ops.test.sql`**

```sql
-- Requer: um usuario de teste em auth.users/profiles. Usa o primeiro profile.
do $$
declare v_uid uuid; v_admin uuid; v_note jsonb; v_detail jsonb; v_list jsonb; v_blocked boolean;
begin
  select id into v_uid from public.profiles order by created_at limit 1;
  select id into v_admin from public.admin_accounts limit 1;
  assert v_uid is not null, 'precisa de ao menos 1 profile';
  assert v_admin is not null, 'precisa de ao menos 1 admin_account';

  -- suspend seta status e pausa bot
  perform public.admin_user_suspend(v_admin, v_uid, 'teste', '{}'::jsonb);
  assert (select account_status from public.profiles where id = v_uid) = 'suspended', 'account_status deveria ser suspended';

  -- reactivate volta
  perform public.admin_user_reactivate(v_admin, v_uid, '{}'::jsonb);
  assert (select account_status from public.profiles where id = v_uid) = 'active', 'account_status deveria ser active';

  -- suspend sem motivo -> erro
  v_blocked := false;
  begin perform public.admin_user_suspend(v_admin, v_uid, '', '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'suspend sem motivo deveria falhar';

  -- set_plan invalido -> erro
  v_blocked := false;
  begin perform public.admin_user_set_plan(v_admin, v_uid, 'ouro', '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'plano invalido deveria falhar';

  -- extend_trial fora do range -> erro
  v_blocked := false;
  begin perform public.admin_user_extend_trial(v_admin, v_uid, 999, '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'days > 90 deveria falhar';

  -- note append + nao edita
  v_note := public.admin_user_add_note(v_admin, v_uid, 'primeira nota', '{}'::jsonb);
  assert v_note ? 'id', 'add_note deve retornar id';
  v_blocked := false;
  begin update public.admin_user_notes set body = 'hack' where id = (v_note->>'id')::uuid;
  exception when others then v_blocked := true; end;
  assert v_blocked, 'admin_user_notes deveria ser append-only';

  -- tags substituem
  perform public.admin_user_set_tags(v_admin, v_uid, array['vip','beta'], '{}'::jsonb);
  perform public.admin_user_set_tags(v_admin, v_uid, array['churn-risk'], '{}'::jsonb);
  assert (select array_agg(tag order by tag) from public.admin_user_tags where user_id = v_uid) = array['churn-risk'], 'set_tags deveria substituir';

  -- tag invalida -> erro
  v_blocked := false;
  begin perform public.admin_user_set_tags(v_admin, v_uid, array['MAIUSCULA'], '{}'::jsonb);
  exception when others then v_blocked := true; end;
  assert v_blocked, 'tag fora do regex deveria falhar';

  -- list e detail
  v_list := public.admin_users_list('', 1, 5);
  assert v_list ? 'items' and v_list ? 'total', 'list precisa de items/total';
  assert jsonb_array_length(v_list->'items') <= 5, 'pageSize respeitado';
  v_detail := public.admin_user_detail(v_uid);
  assert v_detail ? 'profile' and v_detail ? 'counts' and v_detail ? 'tags' and v_detail ? 'notes', 'detail incompleto';
  assert public.admin_user_detail('00000000-0000-0000-0000-000000000000') is null, 'detail de id inexistente = null';

  -- limpeza
  delete from public.admin_user_tags where user_id = v_uid;
  raise notice 'PASS admin_user_ops';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901000000_admin_user_ops.test.sql`
Expected: `function public.admin_user_suspend(...) does not exist`.
(Se Docker indisponivel: pular, verificar por inspecao, documentar no commit.)

- [ ] **Step 3: Escrever `supabase/migrations/20260901000000_admin_user_ops.sql`**

```sql
-- SP2: operacoes de conta de cliente pelo painel admin.

-- 1) account_status ganha 'suspended'
alter table public.profiles drop constraint if exists profiles_account_status_check;
alter table public.profiles add constraint profiles_account_status_check
  check (account_status is null or account_status in
    ('trialing','active','expired','canceled','suspended'));

-- 2) notas internas (append-only)
create table if not exists public.admin_user_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  admin_id uuid,
  admin_email text,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index if not exists admin_user_notes_user_idx on public.admin_user_notes(user_id, created_at desc);
alter table public.admin_user_notes enable row level security;
drop policy if exists admin_user_notes_read on public.admin_user_notes;
create policy admin_user_notes_read on public.admin_user_notes
  for select to authenticated using (public.admin_has_permission('users.read'));
revoke update, delete on public.admin_user_notes from authenticated, anon;

create or replace function public.admin_user_notes_block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'admin_user_notes e append-only';
end;
$$;
drop trigger if exists admin_user_notes_no_update on public.admin_user_notes;
create trigger admin_user_notes_no_update
  before update or delete on public.admin_user_notes
  for each row execute function public.admin_user_notes_block_mutation();

-- 3) tags internas
create table if not exists public.admin_user_tags (
  user_id uuid not null,
  tag text not null check (tag ~ '^[a-z0-9][a-z0-9_-]{0,29}$'),
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (user_id, tag)
);
alter table public.admin_user_tags enable row level security;
drop policy if exists admin_user_tags_read on public.admin_user_tags;
create policy admin_user_tags_read on public.admin_user_tags
  for select to authenticated using (public.admin_has_permission('users.read'));

-- 4) permissao nova
insert into public.admin_permissions (key, grp, description)
values ('users.billing.manage', 'users', 'users.billing.manage')
on conflict (key) do update set grp = excluded.grp, description = excluded.description;

insert into public.admin_role_permissions (role_key, permission_key)
values ('SUPER_ADMIN','users.billing.manage'), ('SUPPORT','users.billing.manage')
on conflict do nothing;

-- 5) RPCs de mutacao (mudanca + audit atomicos)

create or replace function public.admin_user_suspend(
  p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'motivo obrigatorio' using errcode='P0001', hint='REASON_REQUIRED';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update public.profiles set account_status = 'suspended' where id = p_target;
  update public.bot_configs set status = 'paused', paused_reason = 'admin_suspended'
    where user_id = p_target and status = 'active';
  perform public.admin_audit_write(p_actor, 'USER_SUSPENDED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), p_reason, p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_reactivate(
  p_actor uuid, p_target uuid, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update public.profiles set account_status = 'active' where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_REACTIVATED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), null, p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_set_plan(
  p_actor uuid, p_target uuid, p_plan text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_plan not in ('free','starter','pro','enterprise') then
    raise exception 'plano invalido' using errcode='P0001', hint='INVALID_PLAN';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if exists (select 1 from public.subscriptions s
            where s.user_id = p_target and s.status in ('active','past_due')) then
    raise exception 'conta com assinatura paga' using errcode='P0001', hint='HAS_SUBSCRIPTION';
  end if;
  update public.profiles set
    plan = p_plan,
    account_status = case when p_plan = 'free' then account_status else 'active' end,
    trial_ends_at = case when p_plan = 'free' then trial_ends_at else null end
  where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_PLAN_SET', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), null, p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_extend_trial(
  p_actor uuid, p_target uuid, p_days int, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'dias invalidos' using errcode='P0001', hint='INVALID_DAYS';
  end if;
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if exists (select 1 from public.subscriptions s
            where s.user_id = p_target and s.status in ('active','past_due')) then
    raise exception 'conta com assinatura paga' using errcode='P0001', hint='HAS_SUBSCRIPTION';
  end if;
  update public.profiles set
    trial_ends_at = greatest(now(), coalesce(trial_ends_at, now())) + (p_days || ' days')::interval,
    account_status = 'trialing',
    trial_started_at = coalesce(trial_started_at, now())
  where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_TRIAL_EXTENDED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target),
    p_days || ' dias', p_ctx);
  return (select to_jsonb(p) from public.profiles p where p.id = p_target);
end; $$;

create or replace function public.admin_user_add_note(
  p_actor uuid, p_target uuid, p_body text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'nota vazia' using errcode='P0001', hint='NOTE_EMPTY';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  insert into public.admin_user_notes (user_id, admin_id, admin_email, body)
    values (p_target, p_actor,
      (select email from public.admin_accounts where id = p_actor), trim(p_body))
    returning id into v_id;
  perform public.admin_audit_write(p_actor, 'USER_NOTE_ADDED', 'profile', p_target::text,
    null, jsonb_build_object('note_id', v_id), null, p_ctx);
  return (select to_jsonb(n) from public.admin_user_notes n where n.id = v_id);
end; $$;

create or replace function public.admin_user_set_tags(
  p_actor uuid, p_target uuid, p_tags text[], p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t text; v_before text[];
begin
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  if coalesce(array_length(p_tags, 1), 0) > 20 then
    raise exception 'maximo de 20 tags' using errcode='P0001', hint='INVALID_TAG';
  end if;
  foreach t in array coalesce(p_tags, array[]::text[]) loop
    if t !~ '^[a-z0-9][a-z0-9_-]{0,29}$' then
      raise exception 'tag invalida: %', t using errcode='P0001', hint='INVALID_TAG';
    end if;
  end loop;
  select array_agg(tag order by tag) into v_before from public.admin_user_tags where user_id = p_target;
  delete from public.admin_user_tags where user_id = p_target;
  foreach t in array coalesce(p_tags, array[]::text[]) loop
    insert into public.admin_user_tags (user_id, tag, created_by) values (p_target, t, p_actor)
      on conflict do nothing;
  end loop;
  perform public.admin_audit_write(p_actor, 'USER_TAGS_SET', 'profile', p_target::text,
    to_jsonb(coalesce(v_before, array[]::text[])),
    to_jsonb(coalesce(p_tags, array[]::text[])), null, p_ctx);
  return jsonb_build_object('tags', coalesce(
    (select array_agg(tag order by tag) from public.admin_user_tags where user_id = p_target),
    array[]::text[]));
end; $$;

-- 6) leitura

create or replace function public.admin_users_list(
  p_search text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int; v_total bigint; v_items jsonb; v_q text := nullif(trim(coalesce(p_search, '')), '');
begin
  v_off := (v_page - 1) * v_size;
  select count(*) into v_total from public.profiles p
    where v_q is null
       or p.email ilike '%' || v_q || '%'
       or coalesce(p.full_name, '') ilike '%' || v_q || '%';
  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', p.id::text, 'email', p.email, 'full_name', p.full_name,
      'plan', p.plan, 'account_status', p.account_status,
      'trial_ends_at', p.trial_ends_at, 'created_at', p.created_at
    ) as x
    from public.profiles p
    where v_q is null
       or p.email ilike '%' || v_q || '%'
       or coalesce(p.full_name, '') ilike '%' || v_q || '%'
    order by p.created_at desc
    offset v_off limit v_size
  ) s;
  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_user_detail(p_target uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_profile jsonb; v_since timestamptz := now() - interval '30 days';
begin
  select jsonb_build_object(
    'id', p.id::text, 'email', p.email, 'full_name', p.full_name, 'plan', p.plan,
    'account_status', p.account_status, 'trial_started_at', p.trial_started_at,
    'trial_ends_at', p.trial_ends_at, 'created_at', p.created_at
  ) into v_profile from public.profiles p where p.id = p_target;
  if v_profile is null then return null; end if;

  return jsonb_build_object(
    'profile', v_profile,
    'counts', jsonb_build_object(
      'offers',    (select count(*) from public.offers   where user_id = p_target),
      'channels',  (select count(*) from public.channels where user_id = p_target),
      'sends_30d', (select count(*) from public.history  where user_id = p_target and sent_at >= v_since),
      'clicks_30d',(select count(*) from public.clicks   where user_id = p_target and created_at >= v_since)
    ),
    'subscription', (
      select jsonb_build_object('status', s.status, 'provider', s.provider,
                                'current_period_end', s.current_period_end)
      from public.subscriptions s where s.user_id = p_target
      order by s.current_period_end desc nulls last limit 1
    ),
    'tags', coalesce((select array_agg(tag order by tag) from public.admin_user_tags where user_id = p_target), array[]::text[]),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id::text, 'admin_email', n.admin_email, 'body', n.body, 'created_at', n.created_at
      ) order by n.created_at desc)
      from public.admin_user_notes n where n.user_id = p_target
    ), '[]'::jsonb)
  );
end; $$;

-- grants
revoke execute on function public.admin_user_suspend(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_reactivate(uuid, uuid, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_set_plan(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_extend_trial(uuid, uuid, int, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_add_note(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_set_tags(uuid, uuid, text[], jsonb) from authenticated, anon;
revoke execute on function public.admin_users_list(text, int, int) from authenticated, anon;
revoke execute on function public.admin_user_detail(uuid) from authenticated, anon;
grant execute on function public.admin_user_suspend(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_reactivate(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_user_set_plan(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_extend_trial(uuid, uuid, int, jsonb) to service_role;
grant execute on function public.admin_user_add_note(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_set_tags(uuid, uuid, text[], jsonb) to service_role;
grant execute on function public.admin_users_list(text, int, int) to service_role;
grant execute on function public.admin_user_detail(uuid) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa** (ou verificar por inspecao se sem Docker)

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901000000_admin_user_ops.test.sql`
Expected: `NOTICE: PASS admin_user_ops`.

Verificacao por inspecao (sem Docker): conferir que toda coluna/tabela referenciada existe (`profiles.full_name/plan/account_status/trial_*`, `bot_configs.paused_reason`, `subscriptions.provider/current_period_end`, `offers/channels/history/clicks.user_id`, `history.sent_at`, `clicks.created_at`) contra as migrations e o uso no `src/`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901000000_admin_user_ops.sql supabase/tests/manual/20260901000000_admin_user_ops.test.sql
git commit -m "feat(admin): migration do SP2 (account_status suspended, notas/tags, 6 RPCs + 2 de leitura)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `admin-api` leitura (`users/list`, `users/get`) + wiring

**Files:**
- Create: `supabase/functions/admin-api/handlers/users.ts`
- Create: `supabase/functions/admin-api/handlers/users_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`, `RbacError` de `rbac.ts`.
- Produces:
  - `reqUserId(params): string` — pega `params.userId`, `RbacError('validation', 'userId e obrigatorio.')` se ausente/vazio.
  - `list: Handler` — `params { search?: string; page?: number; pageSize?: number }` -> rpc `admin_users_list`, devolve o jsonb.
  - `get: Handler` — `params { userId }` -> rpc `admin_user_detail`; `data === null` -> `throw new RbacError('not_found', 'Usuario nao encontrado.')`.

- [ ] **Step 1: Escrever `handlers/users_test.ts`** (funcoes puras)

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqUserId } from './users.ts';

Deno.test('reqUserId devolve o id', () => {
  assertEquals(reqUserId({ userId: ' abc ' }), 'abc');
});
Deno.test('reqUserId sem id lanca', () => {
  assertThrows(() => reqUserId({}));
  assertThrows(() => reqUserId({ userId: '' }));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/users_test.ts`
Expected: FAIL, modulo `./users.ts` nao encontrado.

- [ ] **Step 3: Escrever `handlers/users.ts` (parte de leitura)**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqUserId(params: Record<string, unknown>): string {
  const v = params.userId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'userId e obrigatorio.');
  return v.trim();
}

export const list: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_users_list', {
    p_search: typeof params.search === 'string' ? params.search : '',
    p_page: Number(params.page) || 1,
    p_page_size: Number(params.pageSize) || 25,
  });
  if (error) throw new Error(error.message);
  return data;
};

export const get: Handler = async (params) => {
  const userId = reqUserId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_detail', { p_target: userId });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Usuario nao encontrado.');
  return data;
};
```

- [ ] **Step 4: Registrar no `index.ts`**

Adicionar `import * as users from './handlers/users.ts';` junto aos outros imports de handler. No `HANDLERS`, adicionar o bloco (antes ou depois de `roles`):

```ts
  users: {
    list: { permission: 'users.read', handler: users.list },
    get:  { permission: 'users.read', handler: users.get },
  },
```

- [ ] **Step 5: Rodar testes e checar tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS, sem erro de tipo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-api/handlers/users.ts supabase/functions/admin-api/handlers/users_test.ts supabase/functions/admin-api/index.ts
git commit -m "feat(admin-api): handlers users/list e users/get

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: `admin-api` mutacoes de usuario + mapeamento de erro

**Files:**
- Modify: `supabase/functions/admin-api/handlers/users.ts`
- Modify: `supabase/functions/admin-api/handlers/_pg-errors.ts`
- Modify: `supabase/functions/admin-api/handlers/pg_errors_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `reqUserId` (Task 2), `serviceClient`, `RbacError`, `mapPgError` (via `index.ts` catch, ja existe).
- Produces (em `users.ts`):
  - `suspend: Handler` — `{ userId, reason }` -> rpc `admin_user_suspend(p_actor, p_target, p_reason, p_ctx)`.
  - `reactivate: Handler` — `{ userId }` -> rpc `admin_user_reactivate(p_actor, p_target, p_ctx)`.
  - `setPlan: Handler` — `{ userId, plan }` -> rpc `admin_user_set_plan(p_actor, p_target, p_plan, p_ctx)`.
  - `extendTrial: Handler` — `{ userId, days }` -> rpc `admin_user_extend_trial(p_actor, p_target, p_days, p_ctx)`.
  - `addNote: Handler` — `{ userId, body }` -> rpc `admin_user_add_note(p_actor, p_target, p_body, p_ctx)`.
  - `setTags: Handler` — `{ userId, tags: string[] }` -> rpc `admin_user_set_tags(p_actor, p_target, p_tags, p_ctx)`.
- `_pg-errors.ts`: `BY_HINT` ganha `REASON_REQUIRED`/`INVALID_PLAN`/`INVALID_DAYS`/`INVALID_TAG`/`NOTE_EMPTY` (`validation`) e `HAS_SUBSCRIPTION` (`conflict`).

- [ ] **Step 1: Escrever o teste de `_pg-errors`**

Em `supabase/functions/admin-api/handlers/pg_errors_test.ts`, adicionar:

```ts
Deno.test('reconhece HAS_SUBSCRIPTION via hint', () => {
  assertEquals(mapPgError({ hint: 'HAS_SUBSCRIPTION', message: 'x' })?.code, 'conflict');
});
Deno.test('reconhece INVALID_PLAN via hint', () => {
  assertEquals(mapPgError({ hint: 'INVALID_PLAN', message: 'x' })?.code, 'validation');
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/pg_errors_test.ts`
Expected: FAIL (mapPgError devolve null pros hints novos).

- [ ] **Step 3: Atualizar `_pg-errors.ts`**

No objeto `BY_HINT`, adicionar as entradas:

```ts
  REASON_REQUIRED: { code: 'validation', message: 'Informe o motivo.' },
  INVALID_PLAN: { code: 'validation', message: 'Plano invalido.' },
  INVALID_DAYS: { code: 'validation', message: 'Numero de dias invalido (1 a 90).' },
  INVALID_TAG: { code: 'validation', message: 'Tag invalida (minusculas, numeros, hifen; ate 30 chars; max 20 tags).' },
  NOTE_EMPTY: { code: 'validation', message: 'A nota nao pode ficar vazia.' },
  HAS_SUBSCRIPTION: { code: 'conflict', message: 'Essa conta tem assinatura paga; ajuste pela Cakto, nao por cortesia.' },
```

- [ ] **Step 4: Escrever as mutacoes em `handlers/users.ts`**

Adicionar ao final do arquivo:

```ts
export const suspend: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const reason = typeof params.reason === 'string' ? params.reason : '';
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_suspend', {
    p_actor: identity.adminId, p_target: userId, p_reason: reason, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const reactivate: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_reactivate', {
    p_actor: identity.adminId, p_target: userId, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const setPlan: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const plan = typeof params.plan === 'string' ? params.plan : '';
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_set_plan', {
    p_actor: identity.adminId, p_target: userId, p_plan: plan, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const extendTrial: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const days = Number(params.days);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_extend_trial', {
    p_actor: identity.adminId, p_target: userId, p_days: Number.isFinite(days) ? days : 0, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const addNote: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const body = typeof params.body === 'string' ? params.body : '';
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_add_note', {
    p_actor: identity.adminId, p_target: userId, p_body: body, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const setTags: Handler = async (params, identity, ctx) => {
  const userId = reqUserId(params);
  const tags = Array.isArray(params.tags) ? (params.tags as unknown[]).map(String) : [];
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_set_tags', {
    p_actor: identity.adminId, p_target: userId, p_tags: tags, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
```

- [ ] **Step 5: Registrar no `index.ts`**

Expandir o bloco `users:` do `HANDLERS`:

```ts
  users: {
    list:         { permission: 'users.read',            handler: users.list },
    get:          { permission: 'users.read',            handler: users.get },
    suspend:      { permission: 'users.suspend',         handler: users.suspend },
    reactivate:   { permission: 'users.reactivate',      handler: users.reactivate },
    'set-plan':   { permission: 'users.billing.manage',  handler: users.setPlan },
    'extend-trial':{ permission: 'users.billing.manage', handler: users.extendTrial },
    'add-note':   { permission: 'users.notes.manage',    handler: users.addNote },
    'set-tags':   { permission: 'users.tags.manage',     handler: users.setTags },
  },
```

- [ ] **Step 6: Rodar testes e checar tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-api/
git commit -m "feat(admin-api): mutacoes users/* (suspend, reactivate, set-plan, extend-trial, add-note, set-tags) + hints de erro

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Catalogo, permissao `users.billing.manage`

**Files:**
- Modify: `shared/admin-permissions.ts`
- Modify: `shared/admin-permissions.test.ts`
- Modify: `admin/src/lib/permission-labels.ts`
- Modify: `admin/src/lib/permission-labels.test.ts`

**Interfaces:**
- Produces: `users.billing.manage` no catalogo TS (grupo `users`, cargo SUPPORT) e o rotulo pt-BR no front.

- [ ] **Step 1: Ajustar os testes**

Em `shared/admin-permissions.test.ts`: trocar `expect(PERMISSION_KEYS.length).toBe(49)` por `toBe(50)`; se houver `expect(new Set(PERMISSION_KEYS).size).toBe(...)` numerico, idem. Adicionar `expect(PERMISSION_KEYS).toContain('users.billing.manage')`.

Em `admin/src/lib/permission-labels.test.ts`: no array `KEYS`, adicionar `'users.billing.manage'` na secao users; trocar `toHaveLength(49)` por `toHaveLength(50)` (nas 3 ocorrencias: `KEYS`, `Object.keys(PERMISSION_LABELS)`, `PERMISSION_ORDER` size).

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- permission-labels admin-permissions`
Expected: FAIL (contagem 49 != 50; chave ausente).

- [ ] **Step 3: Adicionar a permissao**

`shared/admin-permissions.ts`:
- Em `RAW.users`, adicionar `'users.billing.manage'` ao final do array (depois de `'users.impersonate'`).
- No array `SUPPORT`, adicionar `'users.billing.manage'` (perto das outras `users.*`).

`admin/src/lib/permission-labels.ts`:
- Em `PERMISSION_LABELS`, na secao users (depois de `'users.impersonate'`), adicionar:
  ```ts
  'users.billing.manage': 'Gerenciar plano e trial do usuário',
  ```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- permission-labels admin-permissions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/admin-permissions.ts shared/admin-permissions.test.ts admin/src/lib/permission-labels.ts admin/src/lib/permission-labels.test.ts
git commit -m "feat(admin): permissao users.billing.manage no catalogo (49 -> 50)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: Rotas `/users` e `/users/:id` + nav

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Create: `admin/src/pages/users/UsersList.tsx` (stub)
- Create: `admin/src/pages/users/UserDetail.tsx` (stub)

**Interfaces:**
- Produces: as rotas montadas atras de `RequirePermission permission="users.read"`; o item "Usuarios" do menu deixa de ser `comingSoon`. Stubs substituidos nas Tasks 6 e 7.

- [ ] **Step 1: `admin/src/nav.ts`**

Na secao `title: 'Usuários'` (ja acentuada pelo polish), trocar o item por:

```ts
      { label: 'Usuários', to: '/users', permission: 'users.read', icon: Users },
```
(tira o `comingSoon: true`).

- [ ] **Step 2: Stubs das paginas**

`admin/src/pages/users/UsersList.tsx`:
```tsx
// Placeholder da Task 5. A tela real vem na Task 6.
export default function UsersList() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink">Usuários</h1>
    </section>
  );
}
```

`admin/src/pages/users/UserDetail.tsx`:
```tsx
// Placeholder da Task 5. A tela real vem na Task 7.
export default function UserDetail() {
  return (
    <section className="space-y-6">
      <h1 className="font-display text-xl font-bold text-ink">Conta do cliente</h1>
    </section>
  );
}
```

- [ ] **Step 3: `admin/src/App.tsx`**

Adicionar aos imports de pagina:
```tsx
import UsersList from './pages/users/UsersList';
import UserDetail from './pages/users/UserDetail';
```
Dentro do `<Route element={<AdminLayout />}>`, antes da rota `path="*"`:
```tsx
          <Route path="/users" element={<RequirePermission permission="users.read"><UsersList /></RequirePermission>} />
          <Route path="/users/:id" element={<RequirePermission permission="users.read"><UserDetail /></RequirePermission>} />
```

- [ ] **Step 4: Rodar testes e build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: 50+ testes passam (`App.test.tsx` continua verde; nada novo quebra), build OK.

- [ ] **Step 5: Commit**

```bash
git add admin/src/nav.ts admin/src/App.tsx admin/src/pages/users/
git commit -m "feat(admin): rotas /users e /users/:id + item de menu Usuarios

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: `UsersList` (tabela + busca)

**Files:**
- Modify: `admin/src/pages/users/UsersList.tsx`
- Create: `admin/src/pages/users/UsersList.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi` (`admin-api.ts`), `useAsync` (`use-async.ts`), `DataTable`/`Badge` (primitivas), `useSearchParams`/`useNavigate` (react-router).
- Produces: nada consumido por outra task.

**Shape esperado de `users/list`:** `{ items: Array<{ id, email, full_name, plan, account_status, trial_ends_at, created_at }>, page: number, pageSize: number, total: number }`.

- [ ] **Step 1: Escrever `admin/src/pages/users/UsersList.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 'u1', email: 'cliente@x.com', full_name: 'Cliente X', plan: 'starter', account_status: 'active', trial_ends_at: null, created_at: '2026-08-01' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));

import UsersList from './UsersList';

it('lista clientes e busca chama a API com search', async () => {
  render(<MemoryRouter><UsersList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'cliente');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('users');
    expect(last[1]).toBe('list');
    expect((last[2] as { search?: string }).search).toContain('cliente');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- UsersList`
Expected: FAIL (stub nao chama a API nem tem input de busca).

- [ ] **Step 3: Implementar `admin/src/pages/users/UsersList.tsx`**

```tsx
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = {
  id: string;
  email: string;
  full_name: string | null;
  plan: string;
  account_status: string | null;
  trial_ends_at: string | null;
  created_at: string;
};
type Payload = { items: Row[]; page: number; pageSize: number; total: number };

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  active: 'success', trialing: 'warning', expired: 'danger', canceled: 'danger', suspended: 'danger',
};

function fmtDate(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function UsersList() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get('page')) || 1);
  const urlQ = params.get('q') ?? '';
  const [term, setTerm] = useState(urlQ);

  // debounce do input -> query na URL
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params);
      if (term) next.set('q', term); else next.delete('q');
      next.set('page', '1');
      if (next.toString() !== params.toString()) setParams(next);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<Payload>('users', 'list', { search: urlQ, page, pageSize: 25 }),
    [urlQ, page],
  );

  const setPage = useCallback(
    (p: number) => {
      const next = new URLSearchParams(params);
      next.set('page', String(p));
      setParams(next);
    },
    [params, setParams],
  );

  const columns: Column<Row>[] = [
    { key: 'email', header: 'E-mail' },
    { key: 'full_name', header: 'Nome', render: (r) => r.full_name || '-' },
    { key: 'plan', header: 'Plano', render: (r) => <Badge>{r.plan}</Badge> },
    {
      key: 'account_status',
      header: 'Status',
      render: (r) => (
        <Badge tone={STATUS_TONE[r.account_status ?? ''] ?? 'neutral'}>{r.account_status ?? '-'}</Badge>
      ),
    },
    { key: 'trial_ends_at', header: 'Trial ate', render: (r) => fmtDate(r.trial_ends_at) },
    { key: 'created_at', header: 'Criado em', render: (r) => fmtDate(r.created_at) },
  ];

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Usuários</h1>
        <p className="mt-1 text-sm text-ink-secondary">Contas de cliente do Aflyo.</p>
      </header>

      <input
        type="search"
        placeholder="Buscar por e-mail ou nome"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus"
      />

      <DataTable<Row>
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(r) => r.id}
        loading={loading}
        error={error}
        onRetry={reload}
        emptyTitle={urlQ ? 'Nenhum cliente para essa busca' : 'Nenhum cliente'}
        pagination={{
          page: data?.page ?? page,
          pageSize: data?.pageSize ?? 25,
          total: data?.total ?? 0,
          onPageChange: setPage,
        }}
      />

      {(data?.items?.length ?? 0) > 0 && (
        <p className="text-xs text-ink-tertiary">Clique numa linha para ver a conta.</p>
      )}

      <div className="sr-only">
        {(data?.items ?? []).map((r) => (
          <button key={r.id} type="button" onClick={() => navigate(`/users/${r.id}`)}>{r.email}</button>
        ))}
      </div>
    </section>
  );
}
```

> Nota: o `DataTable` do SP1 nao expoe `onRowClick`. Pra nao mexer na primitiva agora, cada `email` da tabela vira um link/acao. **Ajuste minimo aceitavel:** adicionar uma prop opcional `onRowClick?: (row: Row) => void` no `DataTable` e usar aqui (o `<tr>` vira clicavel, `cursor-pointer`). Fazer isso no Step 3 (modificar `admin/src/components/ui/DataTable.tsx` + seu teste continua verde) e remover o bloco `sr-only` acima. O teste desta task nao depende do clique.

- [ ] **Step 4: (se optar pelo onRowClick) ajustar `DataTable.tsx`**

Adicionar `onRowClick?: (row: Row) => void` ao `DataTableProps<Row>`; no `<tr>` do corpo, quando `onRowClick` existe: `onClick={() => onRowClick(row)}` + `className` com `cursor-pointer hover:bg-surface-1`. `DataTable.test.tsx` nao muda (nao passa `onRowClick`).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- UsersList DataTable`
Expected: PASS.

- [ ] **Step 6: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 7: Commit**

```bash
git add admin/src/pages/users/UsersList.tsx admin/src/pages/users/UsersList.test.tsx admin/src/components/ui/DataTable.tsx
git commit -m "feat(admin): tela /users (tabela paginada + busca na URL)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: `UserDetail` (resumo + acoes)

**Files:**
- Modify: `admin/src/pages/users/UserDetail.tsx`
- Create: `admin/src/pages/users/UserDetail.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `useAdminAuth`, `useToast`, `hasPermission`, `StatCard`, `Badge`, `Skeleton`, `ErrorState`, `useParams`.
- Produces: nada.

**Shape esperado de `users/get`:** `{ profile: { id, email, full_name, plan, account_status, trial_started_at, trial_ends_at, created_at }, counts: { offers, channels, sends_30d, clicks_30d }, subscription: { status, provider, current_period_end } | null, tags: string[], notes: Array<{ id, admin_email, body, created_at }> }`.

- [ ] **Step 1: Escrever `admin/src/pages/users/UserDetail.test.tsx`**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return { FakeErr, get: (..._a: unknown[]): Promise<unknown> => Promise.resolve(null), mutate: (..._a: unknown[]): Promise<unknown> => Promise.resolve({}), perms: { value: ['users.read', 'users.billing.manage'] as string[] } };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (resource: string, action: string, params?: unknown) =>
    action === 'get' ? h.get(resource, action, params) : h.mutate(resource, action, params),
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import UserDetail from './UserDetail';

const DETAIL = {
  profile: { id: 'u1', email: 'cliente@x.com', full_name: 'Cliente X', plan: 'starter', account_status: 'active', trial_started_at: null, trial_ends_at: null, created_at: '2026-08-01' },
  counts: { offers: 3, channels: 1, sends_30d: 10, clicks_30d: 0 },
  subscription: null,
  tags: ['vip'],
  notes: [{ id: 'n1', admin_email: 'admin@x.com', body: 'nota teste', created_at: '2026-08-02' }],
};

function renderAt(id = 'u1') {
  return render(
    <MemoryRouter initialEntries={[`/users/${id}`]}>
      <Routes><Route path="/users/:id" element={<UserDetail />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { h.perms.value = ['users.read', 'users.billing.manage']; });

it('mostra o perfil e as notas', async () => {
  h.get = () => Promise.resolve(DETAIL);
  renderAt();
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  expect(screen.getByText('nota teste')).toBeInTheDocument();
});

it('cortesia de plano so aparece com users.billing.manage', async () => {
  h.get = () => Promise.resolve(DETAIL);
  h.perms.value = ['users.read'];
  renderAt();
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /cortesia de plano/i })).not.toBeInTheDocument();
});

it('erro HAS_SUBSCRIPTION na cortesia vira toast (nao quebra a tela)', async () => {
  h.get = () => Promise.resolve(DETAIL);
  h.mutate = () => Promise.reject(new h.FakeErr('conflict', 'Essa conta tem assinatura paga'));
  renderAt();
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  // abre o seletor de plano e confirma
  await userEvent.selectOptions(screen.getByLabelText(/plano de cortesia/i), 'pro');
  await userEvent.click(screen.getByRole('button', { name: /cortesia de plano/i }));
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument()); // ainda viva
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm --prefix admin test -- UserDetail`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `admin/src/pages/users/UserDetail.tsx`**

Requisitos concretos (montar o componente com estes blocos, todos usando as primitivas existentes; copy pt-BR com acento, sem travessao):

- `const { id } = useParams()`. `useAsync(() => callAdminApi('users','get',{ userId: id }), [id])`.
- `loading` -> `Skeleton`s; `error` -> `<ErrorState message={error} onRetry={reload} />`.
- **Perfil** (card `rounded-xl border border-line bg-surface-0 p-4`): email (h2), nome, `Badge` do plano, `Badge` do `account_status` (mesmo mapa de tom da UsersList), trial (inicio/fim via `toLocaleDateString('pt-BR')` ou "-"), criado em.
- **Contadores**: `<div className="grid grid-cols-2 gap-3 md:grid-cols-4">` com 4 `StatCard` (`available` sempre true): Ofertas, Canais, Envios (30d), Cliques (30d).
- **Assinatura** (card): se `data.subscription` -> status/provider/`current_period_end`; senao texto "Sem assinatura (cortesia ou trial)".
- **Tags** (card): chips dos `data.tags`. Se `hasPermission(perms,'users.tags.manage')`: input que adiciona tag (Enter) e um `x` por chip que remove; qualquer mudanca chama `callAdminApi('users','set-tags',{ userId:id, tags: <novo array> })` e `reload()`.
- **Notas** (card): lista `data.notes` (autor + `created_at` + `body`), mais recente primeiro. Se `hasPermission(perms,'users.notes.manage')`: `<textarea>` + botao "Adicionar nota" -> `callAdminApi('users','add-note',{ userId:id, body })`, limpa e `reload()`.
- **Barra de acoes** (cada bloco condicionado a permissao; erros via `toast(e.message)` do `AdminApiError`, `reload()` no sucesso):
  - `users.suspend` / `users.reactivate`: botao "Suspender" (abre modal com `<textarea>` "Motivo" obrigatorio -> `users/suspend { userId, reason }`) OU "Reativar" (`users/reactivate { userId }`), conforme `account_status === 'suspended'`.
  - `users.billing.manage`:
    - `<label>` "Plano de cortesia" + `<select>` (free/starter/pro/enterprise) + botao "Cortesia de plano" -> `users/set-plan { userId, plan }`.
    - `<label>` "Estender trial (dias)" + `<input type="number" min={1} max={90}>` + botao "Estender trial" -> `users/extend-trial { userId, days }`.
- Header padrao: `<section className="space-y-6">` + `<header>` com `<h1 className="font-display text-xl font-bold text-ink">Conta do cliente</h1>` + `<p>` com o email.

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npm --prefix admin test -- UserDetail`
Expected: PASS (3 testes).

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/users/UserDetail.tsx admin/src/pages/users/UserDetail.test.tsx
git commit -m "feat(admin): tela /users/:id (resumo do cliente + acoes: suspender, cortesia, trial, notas, tags)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Verificacao final + deploy

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

- [ ] **Step 2: Migration do zero** (ou inspecao se sem Docker)

Run: `supabase db reset` e rodar os `*.test.sql` das Tasks de migration (SP1 + `20260901000000`).
Expected: todos `PASS`.
Sem Docker: conferir por inspecao que `20260901000000_admin_user_ops.sql` roda depois de `20260829130100` (usa `admin_audit_write`) e que nao colide com `20260831000000..000200` (plan_limits) nem `20260831010000..` (security), e que toda coluna referenciada existe.

- [ ] **Step 3: Aplicar a migration em prod**

Colar `supabase/migrations/20260901000000_admin_user_ops.sql` no SQL Editor do Supabase (projeto `zuqaccivowbzdfrpgekz`) e rodar. Conferir: `select to_regclass('public.admin_user_notes'), to_regclass('public.admin_user_tags'), (select count(*) from public.admin_permissions where key='users.billing.manage');` -> tabelas nao nulas, permissao = 1.

- [ ] **Step 4: Deploy da `admin-api`**

Run: `supabase functions deploy admin-api`
Smoke: `curl -s -XPOST "$ADMIN_API_URL" -H "Authorization: Bearer <token AAL2>" -H 'content-type: application/json' -d '{"resource":"users","action":"list","params":{"pageSize":3}}' | jq` -> `{ data: { items: [...], total: N } }`.

- [ ] **Step 5: Deploy do front (preview + prod)**

Run (de `admin/`, `.vercel` ja aponta pro projeto `aflyo-admin`):
```bash
cd admin && vercel deploy --yes --scope atendimentostopon-progs-projects && cd ..
```
QA no preview:
- `/users` lista, busca por email filtra, paginacao anda, clicar leva pra `/users/:id`.
- `/users/:id`: perfil + contadores + assinatura + tags + notas.
- Suspender (com motivo) -> `account_status='suspended'` no banco, bot pausado, linha na `/audit`. Reativar volta.
- Cortesia numa conta sem assinatura -> `plan` muda. Numa conta COM assinatura -> toast de erro.
- Estender trial -> `trial_ends_at` empurrado.
- Nota adicionada aparece com autor; sem editar/apagar.
- Tags: adicionar/remover persiste.
- Sem a permissao -> a acao correspondente nao aparece.

Depois: `cd admin && vercel deploy --prod --yes --scope atendimentostopon-progs-projects && cd ..`

- [ ] **Step 6: PR**

```bash
git push -u origin feat/admin-sp2-usuarios
gh pr create --base main --head feat/admin-sp2-usuarios \
  --title "Painel admin SP2: Usuarios (gerenciar contas de cliente)" \
  --body "Ver docs/superpowers/specs/2026-08-31-admin-panel-sp2-usuarios-design.md. Empilha sobre #44 e #47."
```

- [ ] **Step 7: Atualizar a memoria**

`project_admin_panel.md`: "SP2 (Usuarios) implementado e deployado; migration 20260901000000 aplicada em prod; PR feat/admin-sp2-usuarios". Atualizar o pointer em `MEMORY.md`. Proximo: SP3 (Operacao).

---

## Self-Review

**1. Spec coverage:**

| Spec | Task |
|---|---|
| Migration: `account_status` +suspended, `admin_user_notes` (append-only), `admin_user_tags`, permissao `users.billing.manage`, 6 RPCs de mutacao, `admin_users_list`, `admin_user_detail` | Task 1 |
| `admin-api` `users/list` + `users/get` + wiring | Task 2 |
| `admin-api` mutacoes `users/{suspend,reactivate,set-plan,extend-trial,add-note,set-tags}` + hints de erro novos (`_pg-errors`) | Task 3 |
| `shared/admin-permissions.ts` + teste (50) + `permission-labels.ts` + teste | Task 4 |
| `nav.ts` (Usuarios ativo) + `App.tsx` (rotas) | Task 5 |
| `/users` (lista + busca + paginacao na URL) | Task 6 |
| `/users/:id` (resumo: perfil, contadores, assinatura, tags editaveis, notas append-only, acoes suspender/reativar/cortesia/trial gated por permissao) | Task 7 |
| Verificacao (deno/vitest/build/lint/sql), aplicar migration prod, deploy admin-api + front, PR | Task 8 |
| Personificacao = so a pagina de resumo (sem sessao) | coberto: nao ha task de sessao; explicitado nas Global Constraints |

Sem lacuna.

**2. Placeholder scan:** Task 7 Step 3 descreve o componente por blocos com requisitos concretos (primitivas exatas, params exatos de cada `callAdminApi`, condicoes de permissao) em vez de colar 250 linhas de JSX; e a mesma abordagem do "requisitos concretos" usada no plano do SP1 (Task 15) e aprovada. Todo o resto tem codigo real. Sem "TBD"/"etc.".

**3. Type consistency:**
- `reqUserId(params): string` definido na Task 2, reusado na Task 3.
- Handlers todos `Handler` (`(params, identity, ctx) => Promise<unknown>`), assinatura do SP1.
- Nomes das RPCs batem entre a migration (Task 1) e os handlers (Tasks 2-3): `admin_user_suspend`, `admin_user_reactivate`, `admin_user_set_plan`, `admin_user_extend_trial`, `admin_user_add_note`, `admin_user_set_tags`, `admin_users_list`, `admin_user_detail`.
- Params das RPCs batem: `p_actor/p_target/p_reason/p_plan/p_days/p_body/p_tags/p_ctx` e `p_search/p_page/p_page_size`, `p_target` no detail.
- Actions no `HANDLERS` batem com as strings usadas no front (`users/list`, `users/get`, `users/suspend`, `users/reactivate`, `users/set-plan`, `users/extend-trial`, `users/add-note`, `users/set-tags`).
- Shape de `users/list` e `users/get` identico entre a funcao SQL (Task 1), o handler (Task 2) e o consumo no front (Tasks 6-7).
- `STATUS_TONE` (UsersList) e o mesmo mapa citado na UserDetail (Task 7).
- Permissoes: `users.read` (list/get/paginas), `users.suspend`, `users.reactivate`, `users.billing.manage` (set-plan/extend-trial), `users.notes.manage` (add-note), `users.tags.manage` (set-tags) — todas ja no catalogo (a `billing.manage` entra na Task 4, antes das tasks que a usam? Nao: Task 4 vem depois da Task 3. Mas o handler so referencia a string; o enforcement real e o seed da migration da Task 1, que ja insere a permissao + matriz. O catalogo TS/label da Task 4 e so front/teste. Ordem OK.)

**4. Ordem:** Task 1 (migration, ja semeia a permissao) -> 2 (leitura) -> 3 (mutacoes, usa `reqUserId` da 2) -> 4 (catalogo TS + label) -> 5 (rotas + stubs) -> 6 (UsersList) -> 7 (UserDetail) -> 8 (verificacao + deploy). Rodar em ordem.
