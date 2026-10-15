-- supabase/tests/manual/20261015010000_ops_wa_status_sync_cron.test.sql
-- Rodar no SQL Editor DEPOIS da migration 20261015010000_ops_wa_status_sync_cron.sql e do
-- deploy da Edge Function evolution-status-sync.
-- Os blocos (a) e (b) so leem. O bloco (c) faz uma chamada HTTP em modo simulacao (dry run).
-- O bloco (d) e a execucao REAL e ESCREVE status em whatsapp_instances: fica comentado.

-- (a) job agendado, ativo, fora do minuto cheio
select jobname, schedule, active
  from cron.job
 where jobname = 'ops_wa_status_sync';                              -- espera 1 linha: '7-59/15 * * * *', active = true

-- (b) privilegios: a funcao nao pode ser executavel por anon/authenticated
select f.proname,
       has_function_privilege('anon',          f.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', f.oid, 'execute') as auth_exec
  from pg_proc f
 where f.pronamespace = 'public'::regnamespace
   and f.proname = 'ops_invoke_wa_status_sync';                     -- espera 1 linha, anon_exec = false e auth_exec = false

-- (c) simulacao (dry run): consulta a Evolution e NAO grava nada. Anote o id retornado.
select public.ops_invoke_wa_status_sync(true) as request_id;        -- espera um bigint (null = Vault sem chave ou falha)

-- Aguarde alguns segundos e leia a resposta pelo id acima (troque 123):
--   select id, status_code, content::jsonb as resposta, error_msg
--     from net._http_response where id = 123;
--   -- espera status_code 200 e content com dry_run = true, verificadas, sem_mudanca,
--   -- inconclusivas, erros e a lista mudancas (instancia = 8 primeiros caracteres do id).
--   -- status_code 401: chave do Vault diferente da service role da function.
--   -- status_code 404: function ainda nao implantada.

-- (d) EXECUCAO REAL. ATENCAO: grava status e last_sync_at em whatsapp_instances, pode
--     disparar o alerta "WhatsApp desconectado" e espelha o status em channels.
--     Rode so depois de conferir o dry run.
--
--   select public.ops_invoke_wa_status_sync(false);
--   select jobname, status, return_message, start_time
--     from cron.job_run_details d join cron.job j using (jobid)
--    where j.jobname = 'ops_wa_status_sync' order by start_time desc limit 3;   -- espera status 'succeeded'
--   select id, status, last_sync_at from public.whatsapp_instances order by last_sync_at desc nulls last;
--       -- espera last_sync_at recente nas instancias verificadas
