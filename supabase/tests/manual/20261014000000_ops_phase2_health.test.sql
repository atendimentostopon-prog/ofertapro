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
--     As falhas "job startup timeout" (39 em 48h ate 2026-10-13) sao agregadas na checagem
--     1b (>= 5 em 3 h gera 1 aviso por hora), nao viram um alerta por job.
select public.ops_healthcheck() as resultado;
                                                                                           -- espera jsonb com cron_falhando, cron_parado, cron_timeouts, bots_com_erro, conexoes, disco, reenviados
                                                                                           -- (falhas "job startup timeout" NAO contam em cron_falhando; so em cron_timeouts)

-- (c2) leitura pura: quantas falhas "job startup timeout" nas ultimas 3 horas e qual
--      seria a decisao da checagem agregada (alerta se >= 5)
select count(*) as timeouts_3h,
       count(*) >= 5 as alertaria,
       (select coalesce(jsonb_agg(x.jobname), '[]'::jsonb)
          from (select distinct j.jobname
                  from cron.job_run_details d2
                  join cron.job j on j.jobid = d2.jobid
                 where d2.status = 'failed' and d2.return_message = 'job startup timeout'
                   and d2.start_time > now() - interval '3 hours'
                 order by j.jobname limit 8) x) as jobs
  from cron.job_run_details d
 where d.status = 'failed' and d.return_message = 'job startup timeout'
   and d.start_time > now() - interval '3 hours';
                                                                                           -- espera: timeouts_3h N, alertaria true/false conforme N >= 5
select jsonb_typeof(public.ops_healthcheck()) = 'object' as ok;                            -- espera true

-- (d) trigger e agendamento presentes; colunas de reenvio criadas
select tgname from pg_trigger
 where tgrelid = 'public.profiles'::regclass and tgname = 'trg_ops_account_status';        -- espera 1 linha
select jobname, schedule, active from cron.job where jobname = 'ops_healthcheck';          -- espera '2-59/5 * * * *', true
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
