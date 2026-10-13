-- supabase/tests/manual/20261013000100_ops_business_sources.test.sql
-- Rodar no SQL Editor DEPOIS das duas migrations. Gera alertas REAIS (1 por bloco).

-- (a) trigger presente em auth.users
select tgname from pg_trigger
 where tgrelid = 'auth.users'::regclass and tgname = 'trg_ops_signup';                      -- espera 1 linha

-- (b) funcoes nao executaveis por anon/authenticated
select has_function_privilege('anon',          'public.ops_on_signup()', 'execute') as anon,
       has_function_privilege('authenticated', 'public.ops_on_signup()', 'execute') as auth;
                                                                                          -- espera false, false
select has_function_privilege('authenticated', 'public.ops_trial_expiring_scan()', 'execute');
                                                                                          -- espera false

-- (c) cron agendado
select jobname, schedule from cron.job where jobname = 'ops_trial_expiring_scan';           -- espera 1 linha

-- (d) cadastro de teste gera 1 evento e e-mail mascarado
--   insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data)
--   values (gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'authenticated',
--           'authenticated', 'ops-teste@example.com', '{"provider":"email"}');
--   select title, detail, occurrences from public.ops_events where title = 'Novo cadastro'
--    order by created_at desc limit 1;     -- espera detail.email = 'o***@example.com'
--   delete from auth.users where email = 'ops-teste@example.com';
--   delete from public.ops_events where fingerprint like 'k:signup:%' and detail->>'email' = 'o***@example.com';

-- (e) scan devolve inteiro e e idempotente (2a chamada nao notifica de novo)
select public.ops_trial_expiring_scan() as primeira;
select public.ops_trial_expiring_scan() as segunda;   -- mesmo numero, mas occurrences sobem e NAO ha novo alerta
select fingerprint, occurrences from public.ops_events
 where fingerprint like 'k:trial_expiring:%' order by created_at desc limit 5;
