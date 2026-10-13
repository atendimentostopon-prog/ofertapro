-- supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql
-- Rodar no SQL Editor DEPOIS de aplicar a migration 20261013000000.
-- Atencao: o item (c) gera 1 alerta REAL se notify e os canais ja estiverem configurados.

-- (a) tabela existe, RLS ligada, sem policy
select relrowsecurity as rls_ligada from pg_class where oid = 'public.ops_events'::regclass;   -- espera true
select count(*) as policies from pg_policies where tablename = 'ops_events';                  -- espera 0

-- (b) anon/authenticated nao tem nenhum privilegio na tabela nem executam ops_emit
select grantee, privilege_type from information_schema.role_table_grants
  where table_name = 'ops_events' and grantee in ('anon','authenticated','PUBLIC');           -- espera 0 linhas
select has_function_privilege('anon',          'public.ops_emit(text,text,text,jsonb,uuid,text)', 'execute') as anon,
       has_function_privilege('authenticated', 'public.ops_emit(text,text,text,jsonb,uuid,text)', 'execute') as auth,
       has_function_privilege('service_role',  'public.ops_emit(text,text,text,jsonb,uuid,text)', 'execute') as svc;
                                                                                              -- espera false, false, true

-- (c) dedup por fingerprint: numeros normalizam, 3 chamadas -> 1 linha com occurrences = 3
select public.ops_emit('error','edge_error','Falha teste dedup 111');
select public.ops_emit('error','edge_error','Falha teste dedup 222');
select public.ops_emit('error','edge_error','Falha teste dedup 333');
select count(*) as linhas, max(occurrences) as occ
  from public.ops_events where title like 'Falha teste dedup%';                               -- espera 1, 3

-- (d) dedupe_key: unico para sempre, repeticao so incrementa
select public.ops_emit('business','signup','Teste chave', '{}'::jsonb, null, 'teste:k1');
select public.ops_emit('business','signup','Teste chave', '{}'::jsonb, null, 'teste:k1');
select count(*) as linhas, max(occurrences) as occ
  from public.ops_events where fingerprint = 'k:teste:k1';                                    -- espera 1, 2

-- (e) fail-open: argumento invalido NAO lanca, devolve null
select public.ops_emit('nao-existe','x','t') is null as devolveu_null;                        -- espera true

-- (f) mascara de e-mail
select public.ops_mask_email('kaik@gmail.com') as mascarado;                                  -- espera k***@gmail.com
select public.ops_mask_email(null) is null as nulo_ok;                                        -- espera true

-- (g) cron de retencao agendado
select jobname, schedule from cron.job where jobname = 'ops_prune';                           -- espera 1 linha

-- (h) config
select current_setting('app.notify_url', true) as notify_url;                                 -- espera .../notify

-- limpeza
delete from public.ops_events where title like 'Falha teste dedup%' or fingerprint = 'k:teste:k1';
