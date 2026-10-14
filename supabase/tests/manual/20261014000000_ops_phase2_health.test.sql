-- supabase/tests/manual/20261014000000_ops_phase2_health.test.sql
-- Rodar no SQL Editor DEPOIS da migration 20261014000000_ops_phase2_health.sql.
-- Os blocos (a), (b) e (d) so leem; (c) roda o healthcheck e pode gerar alertas reais.

-- (a) sonda de saude
select public.ops_health() as saude;                                                       -- espera {"ok": true, "ts": ...}
select (public.ops_health() ->> 'ok')::boolean as ok;                                      -- espera true

-- (b) privilegios
select has_function_privilege('anon',          'public.ops_health()',                   'execute') as anon_health,
       has_function_privilege('authenticated', 'public.ops_health()',                   'execute') as auth_health;
                                                                                           -- espera true, true
select has_function_privilege('anon',          'public.ops_healthcheck()',              'execute') as anon_check,
       has_function_privilege('authenticated', 'public.ops_healthcheck()',              'execute') as auth_check,
       has_function_privilege('anon',          'public.ops_retry_undelivered()',        'execute') as anon_retry,
       has_function_privilege('authenticated', 'public.ops_retry_undelivered()',        'execute') as auth_retry,
       has_function_privilege('anon',          'public.ops_on_account_status_change()', 'execute') as anon_trg;
                                                                                           -- espera tudo false

-- (c) healthcheck devolve jsonb com a contagem por checagem
--     ATENCAO: se houver falha de cron nos ultimos 15 min, isto emite alerta REAL.
--     As 39 falhas "job startup timeout" (ultima em 2026-10-13 10:45 UTC) so aparecem na
--     checagem 1 enquanto estiverem dentro da janela de 15 minutos; fora dela, espera 0.
select public.ops_healthcheck() as resultado;
                                                                                           -- espera jsonb com cron_falhando, cron_parado, bots_com_erro, conexoes, disco, reenviados
select jsonb_typeof(public.ops_healthcheck()) = 'object' as ok;                            -- espera true

-- (d) trigger e agendamento presentes; colunas de reenvio criadas
select tgname from pg_trigger
 where tgrelid = 'public.profiles'::regclass and tgname = 'trg_ops_account_status';        -- espera 1 linha
select jobname, schedule, active from cron.job where jobname = 'ops_healthcheck';          -- espera '*/5 * * * *', true
select column_name from information_schema.columns
 where table_schema = 'public' and table_name = 'ops_events'
   and column_name in ('notify_attempts', 'last_notify_attempt_at');                       -- espera 2 linhas

-- (e) SIMULACAO de expiracao de trial. ATENCAO: dispara alerta REAL (Discord/Telegram)
--     se for executada fora de uma transacao revertida. Dentro de begin ... rollback, as
--     requisicoes enfileiradas pelo pg_net tambem sao descartadas.
--
--   begin;
--     update public.profiles set account_status = 'expired'
--      where id = (select id from public.profiles where account_status = 'trialing' limit 1);
--     select title, severity, category, detail from public.ops_events
--      where fingerprint like 'k:acct:%' order by created_at desc limit 1;
--       -- espera title 'Trial expirou', severity 'business', category 'billing',
--       -- detail com nome, email, telefone, plano, situacao_anterior 'trialing',
--       -- situacao_atual 'expired' e painel 'https://admin.aflyo.com.br/users/<uuid>'
--   rollback;
--
-- (f) NULL -> 'trialing'/'active' NAO deve gerar alerta (o WHEN so aceita 'expired'/'canceled').
