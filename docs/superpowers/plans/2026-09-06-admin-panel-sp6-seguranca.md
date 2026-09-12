# Painel Admin SP6, Seguranca Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Area de Seguranca no painel admin: contas de risco + postura, banir/desbanir conta no nivel de auth, e blocklist de e-mail/dominio com enforcement por trigger.

**Architecture:** Igual SP1-SP5. `admin-api` (Deno) autoriza (JWT + AAL2 + conta admin ativa + permissao) e chama RPCs `security definer` de leitura e escrita com audit atomico. Front (`admin/`) so consome `admin-api`. Uma fase, SQL puro, sem Management API. Nenhuma mudanca em `src/` (o enforcement da blocklist e 100% no banco).

**Tech Stack:** Deno + `https://deno.land/std@0.168.0/http/server.ts`. Postgres 17 (1 migration). React 19.2 + Vite 8 + TS ~6.0 + Tailwind 3.4 + react-router-dom 7.18 + Vitest 2.1.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-09-06-admin-panel-sp6-seguranca-design.md`. Em conflito, o spec vence.
- **Branch:** `feat/admin-sp6-seguranca` (ja criada, de `feat/admin-sp5-observabilidade`). Carrega a pilha SP1-polish + SP2 + SP3 + SP4 + SP5.
- **Toda acao da `admin-api` exige AAL2** (o `authorize` ja faz), leitura inclusive.
- **Copy de UI em pt-BR com acento. Sem travessao (em dash `-`) em lugar nenhum** (codigo, comentario, spec, plano, commit). Rodar `python -c "print(open(f,encoding='utf-8').read().count(chr(8212)))"` antes de cada commit.
- **`admin/` nao importa de `../shared`** (build standalone). Constantes locais.
- **Numero da migration:** `20260901040000_admin_security.sql` (depois da do SP5 `20260901030100`).
- **Permissoes (grp `security`, ja no catalogo `20260829130000`, nenhuma nova):** `security.read`, `security.block_ip`, `risk.read`, `risk.manage`. O SP6 so as adiciona a matriz (`admin_role_permissions`): SUPER_ADMIN ganha as 4, SUPPORT ganha `security.read` + `risk.read`. Rotulos pt-BR ja existem em `admin/src/lib/permission-labels.ts` (`Ver seguranca` / `Bloquear IP` / `Ver risco` / `Gerenciar risco`).
- **Schema verificado no banco de prod (MCP, 2026-09-06):**
  - `auth.users`: `id uuid`, `email text`, `email_confirmed_at timestamptz`, `created_at`, `last_sign_in_at`, `banned_until timestamptz`. `'infinity'::timestamptz > now()` = true.
  - `auth.mfa_factors`: `id`, `user_id`, `factor_type`, `status` (`verified`|`unverified`), `created_at`. (Fonte de verdade pra MFA; `admin_accounts.mfa_enrolled_at` esta NULL mesmo pra admin com MFA, nao usar.)
  - `public.admin_accounts`: `id`, `user_id`, `email`, `status`, `mfa_enrolled_at`, `created_at`, `created_by`, `suspended_at`, `suspended_reason`.
  - `public.admin_role_permissions`: `role_key text`, `permission_key text`.
  - `public.profiles`: `id`, `email`, `plan`, `account_status` (`trialing`|`active`|`expired`|`canceled`|`suspended`), `trial_ends_at`.
  - `public.history`: `user_id`, `status` (`success`|`partial`|`error`; prod so tem `success`/`partial`), `sent_at`, `failed_channels text[]`.
  - `public.bot_configs`: `user_id`, `status`, `paused_reason`.
  - `public.admin_has_permission(text)` existe (SP1). `admin_audit_write(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_before jsonb, p_after jsonb, p_reason text, p_ctx jsonb)` (8 args, SP1).
  - `_pg-errors.ts` `BY_HINT` ja tem: `REASON_REQUIRED`, `NOT_FOUND`, `INVALID_PLAN`, `INVALID_DAYS`, `INVALID_TAG`, `NOTE_EMPTY`, `HAS_SUBSCRIPTION`, `USER_NOT_FOUND`, `ALREADY_LINKED`, `CAKTO_STATUS_UNKNOWN`, `JOB_NOT_FOUND`. `mapPgError` mapeia `23505` -> conflict "Registro duplicado.".
- **Comandos** da raiz do worktree `D:/ofertapro-admin-sp1`. Testes admin: `npm --prefix admin test` (ou `npx --prefix admin vitest run <path>`). Build: `npm --prefix admin run build`. Lint: `npm --prefix admin run lint`. Deno: `deno test --allow-env supabase/functions/admin-api/` e `deno check supabase/functions/admin-api/index.ts`.
- **Docker indisponivel:** `.test.sql` verificado por inspecao. As queries de leitura das RPCs JA foram rodadas contra prod via MCP e retornaram dados.
- **Commits:** um por task, pt-BR, prefixo convencional, trailer `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.

---

## File Structure

### Novos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/20260901040000_admin_security.sql` | Tabela `security_email_blocklist` + 2 triggers + matriz de roles + 3 read RPCs + 4 write RPCs. |
| `supabase/tests/manual/20260901040000_admin_security.test.sql` | Asserts de shape + guard de dominio comum + fail-open do trigger de auth. |
| `supabase/functions/admin-api/handlers/security.ts` | `reqUserId`/`reqId` helpers + 7 handlers. |
| `supabase/functions/admin-api/handlers/security_test.ts` | Testa os helpers puros. |
| `admin/src/pages/security/SecurityArea.tsx` | Shell com 2 abas via `?tab=`. |
| `admin/src/pages/security/RiscoTab.tsx` + `.test.tsx` | Postura + contas de risco + (Task 6) banir/desbanir. |
| `admin/src/pages/security/BloqueiosTab.tsx` + `.test.tsx` | Lista + add/remove da blocklist. |

### Modificados

| Arquivo | Mudanca |
|---|---|
| `supabase/functions/admin-api/index.ts` | `import * as security` + bloco `security:` no `HANDLERS` (7 actions). |
| `supabase/functions/admin-api/handlers/_pg-errors.ts` | `COMMON_DOMAIN` (validation), `INVALID_KIND` (validation) no `BY_HINT`. |
| `admin/src/nav.ts` | Secao "Seguranca": `{ label: 'Risco e bloqueios', to: '/security', permission: 'security.read', icon: ShieldAlert }` (tira `comingSoon`). |
| `admin/src/App.tsx` | +imports; rota `/security` sob `RequirePermission permission="security.read"`. |

---

## Task 1: Migracao `20260901040000_admin_security.sql`

**Files:**
- Create: `supabase/migrations/20260901040000_admin_security.sql`
- Create: `supabase/tests/manual/20260901040000_admin_security.test.sql`

**Interfaces:**
- Produces:
  - table `public.security_email_blocklist(id uuid, kind text, value text, reason text, created_by uuid, created_at timestamptz)`
  - `admin_security_posture() returns jsonb` -> `{ admins:{total,mfa_enrolled}, users:{total,banned,suspended,unconfirmed}, blocklist:{emails,domains} }`
  - `admin_risk_accounts() returns jsonb` -> `{ items:[{ user_id, email, created_at, account_status, plan, banned, flags:[text] }] }`
  - `admin_blocklist_list(p_search text) returns jsonb` -> `{ items:[{ id, kind, value, reason, created_at }] }`
  - `admin_user_ban(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb) returns jsonb` (hint `REASON_REQUIRED`/`NOT_FOUND`)
  - `admin_user_unban(p_actor uuid, p_target uuid, p_ctx jsonb) returns jsonb` (hint `NOT_FOUND`)
  - `admin_blocklist_add(p_actor uuid, p_kind text, p_value text, p_reason text, p_ctx jsonb) returns jsonb` (hint `INVALID_KIND`/`COMMON_DOMAIN`; `23505` conflict)
  - `admin_blocklist_remove(p_actor uuid, p_id uuid, p_ctx jsonb) returns jsonb` (hint `NOT_FOUND`)

- [ ] **Step 1: Escrever `supabase/tests/manual/20260901040000_admin_security.test.sql`**

```sql
do $$
declare v jsonb; v_id uuid;
begin
  v := public.admin_security_posture();
  assert v ? 'admins' and v ? 'users' and v ? 'blocklist', 'posture incompleto';
  assert (v->'users'->>'total')::int >= 1, 'esperado >= 1 usuario';

  v := public.admin_risk_accounts();
  assert v ? 'items', 'risk_accounts precisa de items';

  v := public.admin_blocklist_list(null);
  assert v ? 'items', 'blocklist_list precisa de items';

  -- guard de dominio comum
  begin
    perform public.admin_blocklist_add('00000000-0000-0000-0000-000000000000', 'domain', 'gmail.com', null, '{}'::jsonb);
    assert false, 'deveria barrar gmail.com (COMMON_DOMAIN)';
  exception when others then
    assert sqlerrm ilike '%comum%' or sqlerrm ilike '%COMMON_DOMAIN%', 'hint errado: ' || sqlerrm;
  end;

  -- add + remove de dominio ok
  v := public.admin_blocklist_add('00000000-0000-0000-0000-000000000000', 'domain', '  @Spammer.TEST ', 'teste', '{}'::jsonb);
  assert v->>'value' = 'spammer.test', 'valor nao normalizado: ' || coalesce(v->>'value','null');
  v_id := (v->>'id')::uuid;
  v := public.admin_blocklist_remove('00000000-0000-0000-0000-000000000000', v_id, '{}'::jsonb);
  assert (v->>'removed')::boolean = true, 'remove falhou';

  -- kind invalido
  begin
    perform public.admin_blocklist_add('00000000-0000-0000-0000-000000000000', 'ip', 'x', null, '{}'::jsonb);
    assert false, 'deveria barrar kind ip';
  exception when others then
    assert sqlerrm ilike '%invalido%' or sqlerrm ilike '%INVALID_KIND%', 'hint errado: ' || sqlerrm;
  end;

  raise notice 'PASS admin_security';
end $$;
```

- [ ] **Step 2: Rodar e confirmar que falha** (Docker indisponivel: pular, verificar por inspecao)

Run: `supabase db reset && psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/manual/20260901040000_admin_security.test.sql`
Expected: `function public.admin_security_posture() does not exist`.

- [ ] **Step 3: Escrever `supabase/migrations/20260901040000_admin_security.sql`**

```sql
-- SP6: area de Seguranca. Blocklist com enforcement + risco + banir/desbanir.

-- 1) tabela
create table if not exists public.security_email_blocklist (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email','domain')),
  value text not null,
  reason text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists security_email_blocklist_uniq
  on public.security_email_blocklist (kind, lower(value));
alter table public.security_email_blocklist enable row level security;
drop policy if exists security_email_blocklist_read on public.security_email_blocklist;
create policy security_email_blocklist_read on public.security_email_blocklist
  for select to authenticated using (public.admin_has_permission('security.read'));
revoke insert, update, delete on public.security_email_blocklist from authenticated, anon;

-- 2) guard: normaliza value e barra dominio comum
create or replace function public.security_blocklist_normalize_guard()
returns trigger language plpgsql as $$
declare v_common text[] := array[
  'gmail.com','googlemail.com','hotmail.com','hotmail.com.br','outlook.com','outlook.com.br',
  'live.com','msn.com','icloud.com','me.com','yahoo.com','yahoo.com.br','ymail.com',
  'proton.me','protonmail.com','uol.com.br','bol.com.br','terra.com.br','ig.com.br','globo.com'];
begin
  new.value := lower(trim(new.value));
  if new.kind = 'domain' and left(new.value, 1) = '@' then
    new.value := substr(new.value, 2);
  end if;
  if new.kind = 'domain' and new.value = any(v_common) then
    raise exception 'dominio comum, nao pode bloquear todo cadastro dele' using errcode='P0001', hint='COMMON_DOMAIN';
  end if;
  return new;
end; $$;
drop trigger if exists security_blocklist_normalize on public.security_email_blocklist;
create trigger security_blocklist_normalize
  before insert or update on public.security_email_blocklist
  for each row execute function public.security_blocklist_normalize_guard();

-- 3) enforcement no cadastro (fail-open)
create or replace function public.auth_users_blocklist_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_hit boolean;
begin
  if new.email is null then return new; end if;
  begin
    select exists(
      select 1 from public.security_email_blocklist b
      where (b.kind = 'email' and b.value = lower(new.email))
         or (b.kind = 'domain' and b.value = lower(split_part(new.email, '@', 2)))
    ) into v_hit;
  exception when others then
    return new; -- nunca deixa erro do guard travar cadastro
  end;
  if v_hit then
    raise exception 'Cadastro bloqueado para este e-mail.' using errcode='23514';
  end if;
  return new;
end; $$;
drop trigger if exists auth_users_blocklist_check on auth.users;
create trigger auth_users_blocklist_check
  before insert on auth.users
  for each row execute function public.auth_users_blocklist_check();

-- 4) matriz de roles
insert into public.admin_role_permissions (role_key, permission_key) values
  ('SUPER_ADMIN','security.read'), ('SUPER_ADMIN','security.block_ip'),
  ('SUPER_ADMIN','risk.read'), ('SUPER_ADMIN','risk.manage'),
  ('SUPPORT','security.read'), ('SUPPORT','risk.read')
on conflict do nothing;

-- 5) leitura
create or replace function public.admin_security_posture()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  return jsonb_build_object(
    'admins', (
      select jsonb_build_object(
        'total', count(*),
        'mfa_enrolled', count(*) filter (where exists (
          select 1 from auth.mfa_factors f where f.user_id = aa.user_id and f.status = 'verified')))
      from public.admin_accounts aa),
    'users', (
      select jsonb_build_object(
        'total', count(*),
        'banned', count(*) filter (where u.banned_until is not null and u.banned_until > now()),
        'suspended', count(*) filter (where p.account_status = 'suspended'),
        'unconfirmed', count(*) filter (where u.email_confirmed_at is null))
      from auth.users u left join public.profiles p on p.id = u.id),
    'blocklist', (
      select jsonb_build_object(
        'emails', count(*) filter (where kind = 'email'),
        'domains', count(*) filter (where kind = 'domain'))
      from public.security_email_blocklist)
  );
end; $$;

create or replace function public.admin_risk_accounts()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_disposable text[] := array[
  'mailinator.com','guerrillamail.com','10minutemail.com','tempmail.com','trashmail.com',
  'yopmail.com','sharklasers.com','getnada.com','dispostable.com','maildrop.cc'];
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(x order by x->>'created_at' desc) from (
      select jsonb_build_object(
        'user_id', p.id::text, 'email', u.email, 'created_at', u.created_at,
        'account_status', p.account_status, 'plan', p.plan,
        'banned', (u.banned_until is not null and u.banned_until > now()),
        'flags', array_remove(array[
          case when u.banned_until is not null and u.banned_until > now() then 'banido' end,
          case when p.account_status = 'suspended' then 'suspenso' end,
          case when u.email_confirmed_at is null and u.created_at < now() - interval '7 days' then 'nao_confirmado_7d' end,
          case when lower(split_part(u.email,'@',2)) = any(v_disposable)
                 or lower(split_part(u.email,'@',2)) in (select value from public.security_email_blocklist where kind = 'domain')
               then 'dominio_suspeito' end,
          case when coalesce(h.sends,0) > 10 and (h.bad::numeric / nullif(h.sends,0)) > 0.5 then 'muita_falha_disparo' end
        ], null)
      ) as x
      from public.profiles p
      join auth.users u on u.id = p.id
      left join (
        select user_id, count(*) sends, count(*) filter (where status in ('error','partial')) bad
        from public.history where sent_at > now() - interval '30 days' group by user_id
      ) h on h.user_id = p.id
    ) s
    where jsonb_array_length(x->'flags') >= 1
    order by x->>'created_at' desc
    limit 200
  ), '[]'::jsonb));
end; $$;

create or replace function public.admin_blocklist_list(p_search text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_q text := nullif(trim(coalesce(p_search,'')), '');
begin
  return jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', id::text, 'kind', kind, 'value', value, 'reason', reason, 'created_at', created_at
    ) order by created_at desc)
    from public.security_email_blocklist
    where v_q is null or value ilike '%' || v_q || '%'
    limit 500
  ), '[]'::jsonb));
end; $$;

-- 6) escrita
create or replace function public.admin_user_ban(p_actor uuid, p_target uuid, p_reason text, p_ctx jsonb)
returns jsonb
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
  update auth.users set banned_until = 'infinity'::timestamptz where id = p_target;
  update public.profiles set account_status = 'suspended' where id = p_target;
  update public.bot_configs set status = 'paused', paused_reason = 'admin_banned'
    where user_id = p_target and status = 'active';
  perform public.admin_audit_write(p_actor, 'USER_BANNED', 'profile', p_target::text,
    v_before, (select to_jsonb(p) from public.profiles p where p.id = p_target), p_reason, p_ctx);
  return jsonb_build_object('user_id', p_target::text, 'banned', true, 'account_status', 'suspended');
end; $$;

create or replace function public.admin_user_unban(p_actor uuid, p_target uuid, p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  select to_jsonb(p) into v_before from public.profiles p where p.id = p_target;
  if v_before is null then
    raise exception 'usuario nao encontrado' using errcode='P0002', hint='NOT_FOUND';
  end if;
  update auth.users set banned_until = null where id = p_target;
  perform public.admin_audit_write(p_actor, 'USER_UNBANNED', 'profile', p_target::text,
    v_before, v_before, null, p_ctx);
  return jsonb_build_object('user_id', p_target::text, 'banned', false);
end; $$;

create or replace function public.admin_blocklist_add(
  p_actor uuid, p_kind text, p_value text, p_reason text, p_ctx jsonb
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_row jsonb;
begin
  if p_kind not in ('email','domain') then
    raise exception 'tipo invalido' using errcode='P0001', hint='INVALID_KIND';
  end if;
  insert into public.security_email_blocklist (kind, value, reason, created_by)
    values (p_kind, p_value, nullif(trim(coalesce(p_reason,'')), ''), p_actor)
    returning id into v_id;
  select to_jsonb(b) into v_row from public.security_email_blocklist b where b.id = v_id;
  perform public.admin_audit_write(p_actor, 'BLOCKLIST_ADDED', 'blocklist', v_id::text,
    null, v_row, p_reason, p_ctx);
  return jsonb_build_object('id', v_id::text, 'kind', v_row->>'kind', 'value', v_row->>'value',
    'reason', v_row->>'reason', 'created_at', v_row->>'created_at');
end; $$;

create or replace function public.admin_blocklist_remove(p_actor uuid, p_id uuid, p_ctx jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_row jsonb;
begin
  select to_jsonb(b) into v_row from public.security_email_blocklist b where b.id = p_id;
  if v_row is null then
    raise exception 'entrada nao encontrada' using errcode='P0002', hint='NOT_FOUND';
  end if;
  delete from public.security_email_blocklist where id = p_id;
  perform public.admin_audit_write(p_actor, 'BLOCKLIST_REMOVED', 'blocklist', p_id::text,
    v_row, null, null, p_ctx);
  return jsonb_build_object('removed', true);
end; $$;

-- grants
revoke execute on function public.admin_security_posture() from authenticated, anon;
revoke execute on function public.admin_risk_accounts() from authenticated, anon;
revoke execute on function public.admin_blocklist_list(text) from authenticated, anon;
revoke execute on function public.admin_user_ban(uuid, uuid, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_user_unban(uuid, uuid, jsonb) from authenticated, anon;
revoke execute on function public.admin_blocklist_add(uuid, text, text, text, jsonb) from authenticated, anon;
revoke execute on function public.admin_blocklist_remove(uuid, uuid, jsonb) from authenticated, anon;
grant execute on function public.admin_security_posture() to service_role;
grant execute on function public.admin_risk_accounts() to service_role;
grant execute on function public.admin_blocklist_list(text) to service_role;
grant execute on function public.admin_user_ban(uuid, uuid, text, jsonb) to service_role;
grant execute on function public.admin_user_unban(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_blocklist_add(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.admin_blocklist_remove(uuid, uuid, jsonb) to service_role;
```

- [ ] **Step 4: Rodar e confirmar que passa** (ou por inspecao: `admin_security_posture`/`admin_risk_accounts`/`admin_blocklist_list` ja rodaram contra prod via MCP e retornaram dados; conferir que `20260901040000` roda depois de `20260901030100`; que toda coluna existe; que o `update auth.users` esta so em `admin_user_ban`/`unban`).

Nota de deploy: se `admin_user_ban`/`unban` derem `permission denied for table users` (schema auth) no apply, rodar antes: `grant update (banned_until) on auth.users to postgres;` (owner). O SP5 ja LE `auth.users` sem grant extra; UPDATE pode precisar.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260901040000_admin_security.sql supabase/tests/manual/20260901040000_admin_security.test.sql
git commit -m "feat(admin): migration do SP6 (blocklist + trigger + risco + banir/desbanir)

Docker indisponivel: test.sql por inspecao; as 3 queries de leitura rodaram
contra prod via MCP.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `admin-api` `handlers/security.ts`

**Files:**
- Create: `supabase/functions/admin-api/handlers/security.ts`
- Create: `supabase/functions/admin-api/handlers/security_test.ts`
- Modify: `supabase/functions/admin-api/index.ts`
- Modify: `supabase/functions/admin-api/handlers/_pg-errors.ts`

**Interfaces:**
- Consumes: `Handler` de `index.ts`, `serviceClient` de `_lib.ts`, `RbacError` de `rbac.ts`.
- Produces:
  - `reqUserId(params): string` (`params.userId`), `reqId(params, key): string`.
  - Handlers `posture`, `riskAccounts`, `blocklistList`, `ban`, `unban`, `blocklistAdd`, `blocklistRemove`.

- [ ] **Step 1: `handlers/security_test.ts`**

```ts
import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { reqId, reqUserId } from './security.ts';

Deno.test('reqUserId devolve o id', () => {
  assertEquals(reqUserId({ userId: ' u1 ' }), 'u1');
});
Deno.test('reqUserId ausente lanca', () => {
  assertThrows(() => reqUserId({}));
});
Deno.test('reqId por chave', () => {
  assertEquals(reqId({ blocklistId: ' b1 ' }, 'blocklistId'), 'b1');
  assertThrows(() => reqId({}, 'blocklistId'));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `deno test --allow-env supabase/functions/admin-api/handlers/security_test.ts`
Expected: FAIL, `./security.ts` nao encontrado.

- [ ] **Step 3: Escrever `handlers/security.ts`**

```ts
import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqUserId(params: Record<string, unknown>): string {
  const v = params.userId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'userId e obrigatorio.');
  return v.trim();
}
export function reqId(params: Record<string, unknown>, key: string): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export const posture: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_security_posture', {});
  if (error) throw new Error(error.message);
  return data;
};

export const riskAccounts: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_risk_accounts', {});
  if (error) throw new Error(error.message);
  return data;
};

export const blocklistList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_blocklist_list', { p_search: str(params.search) });
  if (error) throw new Error(error.message);
  return data;
};

export const ban: Handler = async (params, identity, ctx) => {
  const target = reqUserId(params);
  const reason = str(params.reason);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_ban', {
    p_actor: identity.adminId, p_target: target, p_reason: reason, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const unban: Handler = async (params, identity, ctx) => {
  const target = reqUserId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_user_unban', {
    p_actor: identity.adminId, p_target: target, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const blocklistAdd: Handler = async (params, identity, ctx) => {
  const kind = str(params.kind);
  const value = str(params.value).trim();
  if (!value) throw new RbacError('validation', 'value e obrigatorio.');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_blocklist_add', {
    p_actor: identity.adminId, p_kind: kind, p_value: value,
    p_reason: str(params.reason), p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const blocklistRemove: Handler = async (params, identity, ctx) => {
  const id = reqId(params, 'blocklistId');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_blocklist_remove', {
    p_actor: identity.adminId, p_id: id, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};
```

- [ ] **Step 4: Registrar no `index.ts`**

`import * as security from './handlers/security.ts';` junto aos outros. No `HANDLERS`, depois de `monitoring`:

```ts
  security: {
    posture:            { permission: 'security.read', handler: security.posture },
    'risk-accounts':    { permission: 'risk.read',     handler: security.riskAccounts },
    blocklist:          { permission: 'security.read', handler: security.blocklistList },
    ban:                { permission: 'risk.manage',   handler: security.ban },
    unban:              { permission: 'risk.manage',   handler: security.unban },
    'blocklist-add':    { permission: 'risk.manage',   handler: security.blocklistAdd },
    'blocklist-remove': { permission: 'risk.manage',   handler: security.blocklistRemove },
  },
```

- [ ] **Step 5: `_pg-errors.ts`** - acrescentar ao `BY_HINT`:

```ts
  COMMON_DOMAIN: { code: 'validation', message: 'Esse dominio e comum demais; nao da pra bloquear todo cadastro dele.' },
  INVALID_KIND: { code: 'validation', message: 'Tipo invalido (use email ou domain).' },
```

- [ ] **Step 6: Rodar testes + tipos**

Run:
```bash
deno test --allow-env supabase/functions/admin-api/
deno check supabase/functions/admin-api/index.ts
```
Expected: PASS (38 testes: 35 do SP5 + 3 de `security_test`), sem erro de tipo.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-api/handlers/security.ts supabase/functions/admin-api/handlers/security_test.ts supabase/functions/admin-api/index.ts supabase/functions/admin-api/handlers/_pg-errors.ts
git commit -m "feat(admin-api): handlers de Seguranca (posture, risk-accounts, ban/unban, blocklist)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Rotas + nav + shell + stubs

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Create: `admin/src/pages/security/SecurityArea.tsx`
- Create: `admin/src/pages/security/{RiscoTab,BloqueiosTab}.tsx` (stubs)

**Interfaces:**
- Produces: rota `/security` (SecurityArea, 2 abas via `?tab=`) sob `RequirePermission permission="security.read"`. Menu "Seguranca" com item ativo.

- [ ] **Step 1: `admin/src/nav.ts`**

Na secao `title: 'Segurança'`, trocar o item por:
```ts
      { label: 'Risco e bloqueios', to: '/security', permission: 'security.read', icon: ShieldAlert },
```
(`ShieldAlert` ja importado.)

- [ ] **Step 2: `SecurityArea.tsx`**

```tsx
import { useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { hasPermission } from '../../lib/permissions';
import RiscoTab from './RiscoTab';
import BloqueiosTab from './BloqueiosTab';

const TABS = [
  { key: 'risco', label: 'Risco', perm: 'risk.read' },
  { key: 'bloqueios', label: 'Bloqueios', perm: 'security.read' },
] as const;

function NoPerm() {
  return <p className="text-sm text-ink-secondary">Voce nao tem permissao pra esta aba.</p>;
}

export default function SecurityArea() {
  const { identity } = useAdminAuth();
  const perms = identity?.permissions ?? [];
  const [params, setParams] = useSearchParams();
  const active = params.get('tab') ?? 'risco';
  const setTab = (t: string) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    setParams(next);
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Risco e bloqueios</h1>
        <p className="mt-1 text-sm text-ink-secondary">Contas de risco, postura de segurança e blocklist de cadastro.</p>
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
      {active === 'risco' && (hasPermission(perms, 'risk.read') ? <RiscoTab /> : <NoPerm />)}
      {active === 'bloqueios' && (hasPermission(perms, 'security.read') ? <BloqueiosTab /> : <NoPerm />)}
    </section>
  );
}
```

- [ ] **Step 3: Stubs** (substituidos nas Tasks 4-5)

`RiscoTab.tsx` / `BloqueiosTab.tsx`:
```tsx
// Placeholder da Task 3. Tela real na Task 4/5.
export default function RiscoTab() {
  return <p className="text-sm text-ink-secondary">Risco</p>;
}
```

- [ ] **Step 4: `admin/src/App.tsx`**

Import `import SecurityArea from './pages/security/SecurityArea';`. Rota (antes de `path="*"`):
```tsx
          <Route path="/security" element={<RequirePermission permission="security.read"><SecurityArea /></RequirePermission>} />
```

- [ ] **Step 5: Rodar testes + build**

Run:
```bash
npm --prefix admin test
npm --prefix admin run build
```
Expected: 74 testes passam (nada novo quebra), build OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/nav.ts admin/src/App.tsx admin/src/pages/security/
git commit -m "feat(admin): rota /security com abas Risco e Bloqueios + menu Seguranca

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: `RiscoTab` (leitura)

**Files:**
- Modify: `admin/src/pages/security/RiscoTab.tsx`
- Create: `admin/src/pages/security/RiscoTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `useAsync`, `DataTable`/`Column`, `Badge`, `Skeleton`, `ErrorState`, `Link`.

**Shapes:**
- `security/posture` -> `{ admins:{total,mfa_enrolled}, users:{total,banned,suspended,unconfirmed}, blocklist:{emails,domains} }`
- `security/risk-accounts` -> `{ items: Array<{ user_id, email, created_at, account_status, plan, banned, flags: string[] }> }`

- [ ] **Step 1: `RiscoTab.test.tsx`**

```tsx
import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'posture') return Promise.resolve({
      admins: { total: 1, mfa_enrolled: 1 },
      users: { total: 6, banned: 0, suspended: 0, unconfirmed: 0 },
      blocklist: { emails: 0, domains: 0 },
    });
    if (action === 'risk-accounts') return Promise.resolve({
      items: [{ user_id: 'u9', email: 'suspeito@x.com', created_at: '2026-08-30T00:00:00Z', account_status: 'active', plan: 'pro', banned: false, flags: ['muita_falha_disparo'] }],
    });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: (r: string, a: string) => h.impl(r, a), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['risk.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import RiscoTab from './RiscoTab';

it('mostra postura e contas de risco', async () => {
  render(<MemoryRouter><RiscoTab /></MemoryRouter>);
  expect(await screen.findByText('suspeito@x.com')).toBeInTheDocument();
  expect(screen.getByText('muita_falha_disparo')).toBeInTheDocument();
  expect(screen.getByText(/1\s*\/\s*1/)).toBeInTheDocument(); // MFA 1/1
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/security/RiscoTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `RiscoTab.tsx`**

```tsx
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useNavigate } from 'react-router-dom';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Posture = {
  admins: { total: number; mfa_enrolled: number };
  users: { total: number; banned: number; suspended: number; unconfirmed: number };
  blocklist: { emails: number; domains: number };
};
type Row = { user_id: string; email: string; created_at: string; account_status: string; plan: string; banned: boolean; flags: string[] };

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
      <p className="text-xs text-ink-secondary">{label}</p>
      <p className="mt-0.5 font-display text-lg font-bold text-ink">{value}</p>
    </div>
  );
}

export default function RiscoTab() {
  const navigate = useNavigate();
  const posture = useAsync(() => callAdminApi<Posture>('security', 'posture', {}), []);
  const accounts = useAsync(() => callAdminApi<{ items: Row[] }>('security', 'risk-accounts', {}), []);

  const columns: Column<Row>[] = [
    { key: 'email', header: 'E-mail' },
    { key: 'account_status', header: 'Conta', render: (r) => <Badge tone={r.account_status === 'suspended' ? 'danger' : 'neutral'}>{r.account_status}</Badge> },
    { key: 'flags', header: 'Sinais', render: (r) => (
      <div className="flex flex-wrap gap-1">
        {r.flags.map((f) => <Badge key={f} tone={f === 'banido' ? 'danger' : 'warning'}>{f}</Badge>)}
      </div>
    ) },
    { key: 'created_at', header: 'Criada', render: (r) => new Date(r.created_at).toLocaleDateString('pt-BR') },
  ];

  return (
    <div className="space-y-4">
      {posture.loading && <Skeleton className="h-20 w-full" />}
      {posture.data && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Admins com MFA" value={`${posture.data.admins.mfa_enrolled} / ${posture.data.admins.total}`} />
          <Stat label="Contas banidas" value={posture.data.users.banned} />
          <Stat label="Contas suspensas" value={posture.data.users.suspended} />
          <Stat label="Nao confirmadas" value={posture.data.users.unconfirmed} />
          <Stat label="Blocklist" value={`${posture.data.blocklist.emails}e / ${posture.data.blocklist.domains}d`} />
        </div>
      )}

      <div>
        <h3 className="mb-2 font-display text-sm font-bold text-ink">Contas sinalizadas</h3>
        {accounts.error ? (
          <ErrorState message={accounts.error} onRetry={accounts.reload} />
        ) : (
          <DataTable<Row>
            columns={columns}
            rows={accounts.data?.items ?? []}
            rowKey={(r) => r.user_id}
            loading={accounts.loading}
            onRowClick={(r) => navigate(`/users/${r.user_id}`)}
            emptyTitle="Nenhuma conta sinalizada"
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/security/RiscoTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/security/RiscoTab.tsx admin/src/pages/security/RiscoTab.test.tsx
git commit -m "feat(admin): aba Risco (postura + contas sinalizadas por heuristica)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: `BloqueiosTab` (lista + add/remove)

**Files:**
- Modify: `admin/src/pages/security/BloqueiosTab.tsx`
- Create: `admin/src/pages/security/BloqueiosTab.test.tsx`

**Interfaces:**
- Consumes: `callAdminApi`, `AdminApiError`, `useAsync`, `useAdminAuth`, `useToast`, `hasPermission`, `DataTable`/`Column`, `Badge`.

**Shape de `security/blocklist`:** `{ items: Array<{ id, kind, value, reason, created_at }> }`.

- [ ] **Step 1: `BloqueiosTab.test.tsx`**

```tsx
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return {
    FakeErr,
    calls: [] as unknown[][],
    perms: { value: ['security.read', 'risk.manage'] as string[] },
    list: [{ id: 'b1', kind: 'domain', value: 'spammer.test', reason: 'abuso', created_at: '2026-09-06T00:00:00Z' }],
  };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => {
    h.calls.push([r, a, p]);
    if (a === 'blocklist') return Promise.resolve({ items: h.list });
    return Promise.resolve({ id: 'b2', kind: 'email', value: 'x@y.com' });
  },
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import BloqueiosTab from './BloqueiosTab';

beforeEach(() => { h.calls.length = 0; h.perms.value = ['security.read', 'risk.manage']; });

it('lista, e adicionar dominio mostra o aviso e chama blocklist-add', async () => {
  render(<MemoryRouter><BloqueiosTab /></MemoryRouter>);
  await screen.findByText('spammer.test');
  await userEvent.selectOptions(screen.getByLabelText(/tipo/i), 'domain');
  expect(screen.getByText(/bloqueia TODO cadastro/i)).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/dominio ou e-mail/i), 'ruim.test');
  await userEvent.click(screen.getByRole('button', { name: /adicionar/i }));
  await waitFor(() => {
    const add = h.calls.find((c) => c[1] === 'blocklist-add');
    expect(add).toBeTruthy();
    expect((add![2] as { value?: string }).value).toBe('ruim.test');
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx --prefix admin vitest run src/pages/security/BloqueiosTab.test.tsx`
Expected: FAIL (stub).

- [ ] **Step 3: Implementar `BloqueiosTab.tsx`**

```tsx
import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { DataTable, type Column } from '../../components/ui/DataTable';
import { Badge } from '../../components/ui/Badge';

type Row = { id: string; kind: string; value: string; reason: string | null; created_at: string };

export default function BloqueiosTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'risk.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Row[] }>('security', 'blocklist', {}),
    [],
  );
  const [kind, setKind] = useState<'email' | 'domain'>('email');
  const [value, setValue] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      await callAdminApi('security', 'blocklist-add', { kind, value: value.trim(), reason });
      toast('Adicionado a blocklist.');
      setValue('');
      setReason('');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao adicionar.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    try {
      await callAdminApi('security', 'blocklist-remove', { blocklistId: id });
      toast('Removido.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao remover.');
    }
  };

  const columns: Column<Row>[] = [
    { key: 'kind', header: 'Tipo', render: (r) => <Badge>{r.kind === 'domain' ? 'domínio' : 'e-mail'}</Badge> },
    { key: 'value', header: 'Valor' },
    { key: 'reason', header: 'Motivo', render: (r) => r.reason || '-' },
    { key: 'created_at', header: 'Criada', render: (r) => new Date(r.created_at).toLocaleDateString('pt-BR') },
    ...(canManage ? [{
      key: 'acao', header: '', render: (r: Row) => (
        <button type="button" onClick={() => remove(r.id)} className="text-xs font-semibold text-danger-ink">remover</button>
      ),
    } as Column<Row>] : []),
  ];

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
          <h3 className="font-display text-sm font-bold text-ink">Adicionar</h3>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-ink-secondary">
              Tipo
              <select value={kind} onChange={(e) => setKind(e.target.value as 'email' | 'domain')}
                className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink">
                <option value="email">E-mail exato</option>
                <option value="domain">Domínio</option>
              </select>
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-secondary">
              Valor
              <input value={value} onChange={(e) => setValue(e.target.value)}
                placeholder="domínio ou e-mail"
                className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus" />
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-secondary">
              Motivo (opcional)
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                className="rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink outline-none focus:shadow-focus" />
            </label>
            <button type="button" onClick={add} disabled={busy}
              className="rounded-lg border border-line bg-ink px-3 py-2 text-xs font-semibold text-surface-0 disabled:opacity-50">
              {busy ? '...' : 'Adicionar'}
            </button>
          </div>
          {kind === 'domain' && (
            <p className="mt-2 rounded-lg border border-warning/25 bg-warning-bg px-3 py-2 text-xs text-warning-ink">
              Isto bloqueia TODO cadastro desse domínio. Domínios comuns (gmail, hotmail, outlook...) sao recusados.
            </p>
          )}
        </div>
      )}

      {error ? (
        <p className="text-sm text-ink-secondary">{error}</p>
      ) : (
        <DataTable<Row>
          columns={columns}
          rows={data?.items ?? []}
          rowKey={(r) => r.id}
          loading={loading}
          emptyTitle="Blocklist vazia"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx --prefix admin vitest run src/pages/security/BloqueiosTab.test.tsx`
Expected: PASS.

- [ ] **Step 5: Build + lint**

Run: `npm --prefix admin run build && npm --prefix admin run lint`
Expected: OK.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/security/BloqueiosTab.tsx admin/src/pages/security/BloqueiosTab.test.tsx
git commit -m "feat(admin): aba Bloqueios (blocklist de e-mail/dominio + add/remove)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: Banir/Desbanir no `RiscoTab`

**Files:**
- Modify: `admin/src/pages/security/RiscoTab.tsx`
- Modify: `admin/src/pages/security/RiscoTab.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth`, `useToast`, `hasPermission`, `AdminApiError`.

- [ ] **Step 1: Acrescentar botao + modal de motivo no `RiscoTab`**

- Imports: `useState` de react, `useAdminAuth`, `useToast`, `hasPermission`, `AdminApiError`.
- No componente: `const { identity } = useAdminAuth(); const toast = useToast(); const canManage = hasPermission(identity?.permissions ?? [], 'risk.manage'); const [banId, setBanId] = useState<string | null>(null); const [reason, setReason] = useState('');`
- Nova coluna na `DataTable` (so quando `canManage`):
  ```tsx
  {
    key: 'ban', header: '',
    render: (r: Row) => r.banned ? (
      <button type="button" onClick={() => unban(r.user_id)} className="text-xs font-semibold text-ink-secondary">desbanir</button>
    ) : (
      <button type="button" onClick={() => setBanId(r.user_id)} className="text-xs font-semibold text-danger-ink">banir</button>
    ),
  }
  ```
- `unban`:
  ```tsx
  const unban = async (userId: string) => {
    try { await callAdminApi('security', 'unban', { userId }); toast('Desbanido.'); accounts.reload(); posture.reload(); }
    catch (e) { toast(e instanceof AdminApiError ? e.message : 'Falha.'); }
  };
  ```
- Modal (renderizado quando `banId`): textarea de `reason` obrigatorio + botoes Cancelar / Banir. Confirmar:
  ```tsx
  const doBan = async () => {
    if (!reason.trim() || !banId) return;
    try {
      await callAdminApi('security', 'ban', { userId: banId, reason: reason.trim() });
      toast('Conta banida.'); setBanId(null); setReason(''); accounts.reload(); posture.reload();
    } catch (e) { toast(e instanceof AdminApiError ? e.message : 'Falha ao banir.'); }
  };
  ```
- Onde a linha tem `onRowClick` pra `/users/:id`: manter, mas o clique nos botoes de banir/desbanir precisa de `e.stopPropagation()`.

- [ ] **Step 2: Acrescentar teste em `RiscoTab.test.tsx`**

- `useAdminAuth` mutavel (`h.perms.value`), `beforeEach` reset pra `['risk.read']`.
- mock `callAdminApi` pra `action === 'ban'` -> `Promise.resolve({ banned: true })` e `'unban'` -> `Promise.resolve({ banned: false })`.
- teste: sem `risk.manage` nao aparece botao "banir"; com `risk.manage`, clicar "banir" abre o modal, digitar motivo e confirmar chama `security/ban` com `{ userId, reason }` e nao quebra a tela.

- [ ] **Step 3: Rodar os testes de security + build + lint**

Run:
```bash
npx --prefix admin vitest run src/pages/security/
npm --prefix admin run build
npm --prefix admin run lint
```
Expected: PASS, build + lint OK.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/security/RiscoTab.tsx admin/src/pages/security/RiscoTab.test.tsx
git commit -m "feat(admin): banir/desbanir conta na aba Risco (gated risk.manage, modal de motivo)

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

`20260901040000`: tabela `if not exists` + `create or replace function` + triggers `drop/create` + `insert ... on conflict do nothing` + grants. Roda depois de `20260901030100`. O `update auth.users` so em `admin_user_ban`/`unban`. As 3 queries de leitura ja rodaram contra prod.

- [ ] **Step 3: Em-dash sweep**

Run: `python -c "import glob; [print(f, open(f,encoding='utf-8').read().count(chr(8212))) for f in glob.glob('admin/src/pages/security/*.tsx') + ['supabase/migrations/20260901040000_admin_security.sql','supabase/functions/admin-api/handlers/security.ts','docs/superpowers/plans/2026-09-06-admin-panel-sp6-seguranca.md','docs/superpowers/specs/2026-09-06-admin-panel-sp6-seguranca-design.md']]"`
Expected: 0 em cada.

- [ ] **Step 4: PR**

```bash
git push -u origin feat/admin-sp6-seguranca
gh pr create --base main --head feat/admin-sp6-seguranca \
  --title "Painel admin SP6: Seguranca (risco, banir/desbanir, blocklist de cadastro)" \
  --body "$(cat <<'EOF'
Ver docs/superpowers/specs/2026-09-06-admin-panel-sp6-seguranca-design.md. Uma fase, SQL puro. Empilha sobre #44, #47, #48, #49, #51, #52.

- Migration 20260901040000: `security_email_blocklist` + trigger de enforcement em `auth.users` (fail-open) + guard de dominio comum + matriz de roles + 3 read RPCs + 4 write RPCs (ban/unban/blocklist-add/remove).
- admin-api `handlers/security.ts` (7 rotas) + hints `COMMON_DOMAIN`/`INVALID_KIND`.
- Front `/security` com abas Risco (postura + contas sinalizadas + banir/desbanir) e Bloqueios (lista + add/remove com aviso).
- Nenhuma permissao nova (as 4 ja no catalogo; SP6 so adiciona a matriz).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 5: Handoff de deploy**

1. Aplicar `20260901040000_admin_security.sql` no SQL Editor (ou via MCP). Se `admin_user_ban`/`unban` derem `permission denied for table users`, rodar antes: `grant update (banned_until) on auth.users to postgres;`. Conferir: `select proname from pg_proc where proname like 'admin_security%' or proname like 'admin_risk%' or proname like 'admin_blocklist%' or proname in ('admin_user_ban','admin_user_unban');` -> 7 linhas. E: `select tgname from pg_trigger where tgname = 'auth_users_blocklist_check';` -> 1 linha.
2. `supabase functions deploy admin-api --project-ref zuqaccivowbzdfrpgekz`.
3. `cd admin` ; `vercel deploy --prod --yes` ; `cd ..`.

Smoke test pos-deploy (login SUPER_ADMIN):
- `/security` aba **Risco**: cards de postura (MFA 1/1, 0 banidos), tabela de contas sinalizadas (deve aparecer `kaikgivaldo31@gmail.com` com `muita_falha_disparo`).
- aba **Bloqueios**: adicionar `domain` `gmail.com` -> toast de erro "dominio comum"; adicionar `domain` `descartavel-teste.xyz` -> entra; remover -> sai.
- Teste de enforcement (cuidado, real): criar conta com um e-mail `@descartavel-teste.xyz` enquanto a entrada existe -> signup recusado. Remover a entrada depois.
- Banir uma conta de teste -> `/audit` mostra `USER_BANNED`; a conta nao loga mais. Desbanir -> `USER_UNBANNED`.

- [ ] **Step 6: Atualizar a memoria**

`project_admin_panel.md` + `MEMORY.md`: SP6 implementado, PR, deploy, o trigger em `auth.users` (fail-open, `drop trigger auth_users_blocklist_check on auth.users` reverte). Proximo: SP7 (Sistema).

---

## Self-Review

**1. Spec coverage:**

| Spec | Task |
|---|---|
| Tabela `security_email_blocklist` + unique | Task 1 |
| Trigger normalize + guard de dominio comum (lista fixa) | Task 1 |
| Trigger `before insert` em `auth.users` fail-open | Task 1 |
| Matriz de roles (SUPER_ADMIN 4, SUPPORT 2) | Task 1 |
| `admin_security_posture` (admins MFA de `auth.mfa_factors`, users, blocklist) | Task 1 |
| `admin_risk_accounts` com 5 flags heuristicas | Task 1 |
| `admin_blocklist_list` | Task 1 |
| `admin_user_ban` (banned_until + suspend + bot + audit) | Task 1 |
| `admin_user_unban` (so limpa banned_until) | Task 1 |
| `admin_blocklist_add` / `admin_blocklist_remove` | Task 1 |
| admin-api 7 handlers + perms corretas | Task 2 |
| `_pg-errors` `COMMON_DOMAIN` / `INVALID_KIND` | Task 2 |
| nav item ativo + rota `/security` sob RequirePermission | Task 3 |
| SecurityArea 2 abas + checagem de permissao por aba | Task 3 |
| RiscoTab (postura + contas sinalizadas + link pra /users/:id) | Task 4 |
| BloqueiosTab (lista + add com aviso de dominio + remove) | Task 5 |
| Banir/desbanir gated `risk.manage` + modal de motivo | Task 6 |
| Verificacao + deploy + memoria | Task 7 |
| Fora de escopo (IP, score, auth hook, src/, SEC-1..10) | nenhuma task viola |

Sem lacuna.

**2. Placeholder scan:** Tasks 1-5 tem codigo completo. Task 6 descreve as edicoes com os corpos de `unban`/`doBan`/coluna dados e o mock nomeado (`action === 'ban'|'unban'`); o executor tem o padrao das Tasks 4-5 e do SP4/SP5 Task 10 (mesmo tipo de "acrescentar botao gated + teste"). Nao ha "TBD".

**3. Type consistency:**
- `reqUserId(params)` / `reqId(params, key)` (Task 2) - usados so dentro do proprio `security.ts`.
- Shapes RPC (Task 1) == handler passthrough (Task 2) == front (Tasks 4-6): `posture` -> `{admins,users,blocklist}`; `risk-accounts` -> `{items:[{...flags:string[]}]}`; `blocklist` -> `{items:[{id,kind,value,reason,created_at}]}`; `ban` -> `{banned:true,...}`; `unban` -> `{banned:false}`; `blocklist-add` -> `{id,kind,value,reason,created_at}`; `blocklist-remove` -> `{removed:true}`.
- Actions no `HANDLERS`: `security/{posture,risk-accounts,blocklist,ban,unban,blocklist-add,blocklist-remove}` == strings no front (Tasks 4-6).
- Params: front manda `{ userId, reason }` no ban / `{ userId }` no unban / `{ kind, value, reason }` no blocklist-add / `{ blocklistId }` no blocklist-remove -> bate com `reqUserId`/`str(params.reason)`/`str(params.kind)`/`reqId(params,'blocklistId')` nos handlers -> bate com `p_target`/`p_reason`/`p_kind`/`p_value`/`p_id` nas RPCs.
- Permissoes: `security.read` (posture, blocklist), `risk.read` (risk-accounts), `risk.manage` (ban/unban/blocklist-add/remove). Todas no catalogo; a matriz e adicionada na Task 1.
- `Badge` tones usados: `danger`/`warning`/`neutral` - todos validos (Badge do SP1: neutral/success/warning/danger/info).

**4. Ordem:** 1 (migration) -> 2 (handlers) -> 3 (rotas+shell) -> 4 (RiscoTab leitura) -> 5 (BloqueiosTab) -> 6 (ban/unban) -> 7 (verificacao+deploy). Rodar em ordem.
