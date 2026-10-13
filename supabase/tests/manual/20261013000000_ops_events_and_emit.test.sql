-- supabase/tests/manual/20261013000000_ops_events_and_emit.test.sql
-- Rodar no SQL Editor DEPOIS de aplicar a migration 20261013000000.
-- Atencao: os itens (c) e (d) geram alertas REAIS se notify e os canais ja estiverem configurados.

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

-- (d2) gating de notificacao (1a e 5a ocorrencia; dedupe_key notifica 1x). Roda dentro de uma
-- transacao que termina em ROLLBACK. ops_emit le a chave do Vault; as requisicoes http sao
-- enfileiradas dentro da transacao e descartadas pelo rollback, entao nenhum alerta real e enviado.
-- net.http_request_queue e o nome documentado da fila do pg_net; se a sua versao usar outro
-- nome, ajuste. O SQL Editor nao suporta \gset: as contagens ficam numa tabela temporaria.
-- Rodar tudo de uma vez, no mesmo run (um unico begin ... rollback).
begin;
  create temp table _g on commit drop as select count(*) as n from net.http_request_queue;
  -- 6 emissoes identicas (digitos normalizam): notifica na 1a e na 5a
  select public.ops_emit('error','edge_error','Teste gating 1') from generate_series(1,6);
  select (select count(*) from net.http_request_queue) - (select n from _g) as notificacoes;       -- espera 2
  -- dedupe_key: 3 chamadas, 1 notificacao (total acumulado 3)
  select public.ops_emit('business','signup','Teste gating chave', '{}'::jsonb, null, 'teste:gating')
    from generate_series(1,3);
  select (select count(*) from net.http_request_queue) - (select n from _g) as notificacoes_total;  -- espera 3
rollback;

-- (e) fail-open: argumento invalido NAO lanca, devolve null
select public.ops_emit('nao-existe','x','t') is null as devolveu_null;                        -- espera true

-- (f) mascara de e-mail
select public.ops_mask_email('kaik@gmail.com') as mascarado;                                  -- espera k***@gmail.com
select public.ops_mask_email(null) is null as nulo_ok;                                        -- espera true

-- (g) cron de retencao agendado
select jobname, schedule from cron.job where jobname = 'ops_prune';                           -- espera 1 linha

-- (h) segredo no Vault (sem imprimir o valor)
select exists (select 1 from vault.secrets where name = 'app_service_role_key') as vault_key_ok;  -- espera true

-- limpeza
delete from public.ops_events where title like 'Falha teste dedup%' or fingerprint = 'k:teste:k1';
