-- SP1: bootstrap do primeiro SUPER_ADMIN + limpeza do admin legado.

do $$
declare v_uid uuid; v_admin uuid;
begin
  select id into v_uid from auth.users where lower(email) = 'contatogivaldo@outlook.com';
  if v_uid is null then
    raise notice 'bootstrap: auth.users para contatogivaldo@outlook.com nao encontrado. Rode esta migration de novo (ou insira a mao) apos a conta existir.';
    return;
  end if;

  insert into public.admin_accounts (user_id, email, status)
    values (v_uid, 'contatogivaldo@outlook.com', 'active')
    on conflict (user_id) do update set status = 'active'
    returning id into v_admin;

  insert into public.admin_user_roles (admin_id, role_key)
    values (v_admin, 'SUPER_ADMIN')
    on conflict do nothing;

  raise notice 'bootstrap: contatogivaldo@outlook.com promovido a SUPER_ADMIN (admin_accounts %).', v_admin;
end $$;

-- Limpeza do seed antigo de e-mails de teste (estavam em supabase_admin_setup.sql).
-- Roda so se a tabela antiga ainda existir. NAO inclui contatogivaldo@outlook.com:
-- essa conta e o SUPER_ADMIN novo, ja tratada no bloco de bootstrap acima. Este
-- delete e redundante com o drop table logo abaixo, mas documenta a intencao.
do $$
begin
  if to_regclass('public.admin_users') is not null then
    delete from public.admin_users where email in (
      'qa.teste1@gmail.com','kaikfarias051@gmail.com','testeonboarding@teste.com',
      'qa.ofertapro.162606@gmail.com','conta@teste.com'
    );
  end if;
end $$;

drop table if exists public.admin_users cascade;

drop function if exists public.get_admin_dashboard_stats() cascade;
drop function if exists public.get_admin_recent_users() cascade;
drop function if exists public.get_admin_recent_offers() cascade;
drop function if exists public.get_admin_recent_dispatches() cascade;
drop function if exists public.get_admin_channels() cascade;
drop function if exists public.get_admin_api_keys() cascade;
