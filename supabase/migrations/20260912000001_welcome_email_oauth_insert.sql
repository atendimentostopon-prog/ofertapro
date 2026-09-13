-- supabase/migrations/20260912000000_welcome_email_oauth_insert.sql
-- =====================================================================
-- Boas-vindas tambem para quem entra via Google (OAuth).
-- =====================================================================
-- O trigger original (20260901120000) so dispara em UPDATE de
-- email_confirmed_at (null -> not null), que cobre o signup por
-- e-mail/senha com link de confirmacao. Contas criadas via Google OAuth
-- ja nascem com email_confirmed_at preenchido no INSERT (o Google ja
-- verificou o e-mail), entao esse UPDATE nunca acontece e o e-mail de
-- boas-vindas nunca disparava pra quem entra com Google.
--
-- Correcao: a mesma funcao passa a tratar os dois casos (TG_OP), e um
-- segundo trigger cobre o INSERT. dedupe_key 'welcome:<user_id>' em
-- email_log ja garante no maximo 1 envio por usuario mesmo se, por
-- algum motivo, os dois triggers dispararem pro mesmo registro.
--
-- Idempotente.
-- =====================================================================

create or replace function public.on_email_confirmed_send_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := 'https://app.aflyo.com.br';
  v_name text;
  v_should_send boolean := false;
begin
  if tg_op = 'INSERT' then
    v_should_send := new.email_confirmed_at is not null;
  elsif tg_op = 'UPDATE' then
    v_should_send := new.email_confirmed_at is not null and old.email_confirmed_at is null;
  end if;

  if v_should_send then
    v_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    );
    perform public.enqueue_transactional_email(
      'boas-vindas',
      new.email,
      jsonb_build_object(
        'USER_NAME', v_name,
        'USER_EMAIL', new.email,
        'APP_URL', v_app,
        'SUPPORT_URL', v_app || '/suporte',
        'PREFERENCES_URL', v_app || '/configuracoes',
        'UNSUBSCRIBE_URL', v_app || '/configuracoes'
      ),
      'welcome:' || new.id::text,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_confirmed_welcome_insert on auth.users;
create trigger trg_email_confirmed_welcome_insert
  after insert on auth.users
  for each row execute function public.on_email_confirmed_send_welcome();

-- Verificacao (fora da migration):
--   -- criar usuario de teste ja confirmado (simula OAuth) e checar email_log:
--   -- select * from public.email_log where dedupe_key = 'welcome:<user_id>';
