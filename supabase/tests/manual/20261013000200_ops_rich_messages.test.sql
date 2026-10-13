-- supabase/tests/manual/20261013000200_ops_rich_messages.test.sql
-- Rodar no SQL Editor DEPOIS da migration 20261013000200_ops_rich_messages.sql.
-- Os blocos (a) a (e) so leem; (e) pode gerar avisos reais de trial na 1a chamada.

-- (a) trigger de e-mail confirmado presente em auth.users
select tgname from pg_trigger
 where tgrelid = 'auth.users'::regclass and tgname = 'trg_ops_email_confirmed';             -- espera 1 linha

-- (b) funcoes novas/alteradas nao executaveis por anon/authenticated
select has_function_privilege('anon',          'public.ops_on_email_confirmed()',  'execute') as anon_confirmed,
       has_function_privilege('authenticated', 'public.ops_on_email_confirmed()',  'execute') as auth_confirmed,
       has_function_privilege('anon',          'public.ops_sales_today()',         'execute') as anon_sales,
       has_function_privilege('authenticated', 'public.ops_sales_today()',         'execute') as auth_sales,
       has_function_privilege('anon',          'public.ops_on_signup()',           'execute') as anon_signup,
       has_function_privilege('authenticated', 'public.ops_trial_expiring_scan()', 'execute') as auth_scan;
                                                                                          -- espera tudo false
select has_function_privilege('service_role', 'public.ops_sales_today()', 'execute');     -- espera true

-- (c) vendas de hoje
select public.ops_sales_today() as vendas_hoje;
                                                                                          -- espera jsonb com as chaves "vendas" (int) e "faturamento" (numeric)
select jsonb_typeof(public.ops_sales_today()) = 'object'
   and public.ops_sales_today() ? 'vendas'
   and public.ops_sales_today() ? 'faturamento' as ok;                                    -- espera true

-- (d) o scan devolve inteiro e e idempotente: usuario ja avisado nao e reprocessado
select public.ops_trial_expiring_scan() as primeira;                                       -- espera um inteiro (N)
select public.ops_trial_expiring_scan() as segunda;                                        -- espera 0 (todos ja avisados), occurrences NAO sobem
select fingerprint, occurrences from public.ops_events
 where fingerprint like 'k:trial_expiring:%' order by created_at desc limit 5;            -- espera occurrences = 1

-- (e) chaves do detail do ultimo aviso de trial (sem chaves nulas)
select jsonb_object_keys(detail) as chave
  from (select detail from public.ops_events
         where fingerprint like 'k:trial_expiring:%' order by created_at desc limit 1) t;
                                                                                          -- espera: nome, email, telefone, horas_restantes, dias_de_uso, trial_termina, painel (+ onboarding_passo, bot_status, canais quando houver)

-- (f) SIMULACAO de cadastro + confirmacao de e-mail. ATENCAO: dispara alertas REAIS
--     (Discord/Telegram) se for executada fora de uma transacao revertida. Dentro de
--     begin ... rollback, as requisicoes enfileiradas pelo pg_net tambem sao descartadas.
--
--   begin;
--     insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
--     values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
--             'authenticated', 'ops-teste-rico@example.com', '{"provider":"email"}',
--             '{"full_name":"Teste Rico"}');
--     select title, detail from public.ops_events
--      where title = 'Novo cadastro' order by created_at desc limit 1;
--       -- espera detail com: nome 'Teste Rico', email 'ops-teste-rico@example.com',
--       -- origem 'email', email_confirmado false, cadastro_numero, cadastros_hoje,
--       -- trial_termina e painel 'https://admin.aflyo.com.br/users/<uuid>'
--
--     update auth.users set email_confirmed_at = now() where email = 'ops-teste-rico@example.com';
--     select title, detail from public.ops_events
--      where title = 'E-mail confirmado' order by created_at desc limit 1;
--       -- espera detail com: nome, email, confirmou_em_min, confirmaram_hoje,
--       -- taxa_confirmacao_7d, cadastro_numero, painel (+ onboarding_passo se houver linha)
--   rollback;
