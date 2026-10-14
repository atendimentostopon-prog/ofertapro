-- supabase/tests/manual/20261014010000_ops_user_milestones.test.sql
-- Rodar no SQL Editor DEPOIS da migration 20261014010000_ops_user_milestones.sql.
-- Os blocos (a), (b) e (d) so leem. O bloco (c) escreve e fica comentado: rode so dentro
-- de uma transacao revertida.

-- (a) triggers presentes
select tgname, tgrelid::regclass as tabela
  from pg_trigger
 where tgname in ('trg_ops_channel_connected', 'trg_ops_whatsapp_connected',
                  'trg_ops_bot_started', 'trg_ops_first_offer')
   and not tgisinternal
 order by tgname;                                                                          -- espera 4 linhas

-- (b) privilegios: nenhuma funcao executavel por anon/authenticated
select f.proname,
       has_function_privilege('anon',          f.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', f.oid, 'execute') as auth_exec
  from pg_proc f
 where f.pronamespace = 'public'::regnamespace
   and f.proname in ('ops_user_snapshot', 'ops_on_channel_connected', 'ops_on_whatsapp_connected',
                     'ops_on_bot_started', 'ops_on_first_offer')
 order by f.proname;                                                                       -- espera 5 linhas, tudo false

-- (c) simulacao dentro de transacao revertida. ATENCAO: fora do begin ... rollback isto
--     dispara alerta REAL. Dentro da transacao revertida, as requisicoes enfileiradas pelo
--     pg_net tambem sao descartadas pelo rollback (nada chega ao Discord/Telegram).
--
--   begin;
--     insert into public.channels (user_id, name, type, status, identifier)
--     select id, 'Canal de teste', 'telegram', 'connected', '@canal_teste'
--       from public.profiles order by created_at limit 1;
--     select title, severity, category, detail from public.ops_events
--      where fingerprint like 'k:tg_connected:%' order by created_at desc limit 1;
--       -- espera title 'Telegram conectado', severity 'business', category 'bot',
--       -- detail com nome, email, canal_nome 'Canal de teste', identificador '@canal_teste',
--       -- canais_telegram >= 1 e painel 'https://admin.aflyo.com.br/users/<uuid>'
--     -- UPDATE connected -> connected nao pode gerar nada novo (occurrences segue 1):
--     update public.channels set status = 'connected' where name = 'Canal de teste';
--     select occurrences from public.ops_events
--      where fingerprint like 'k:tg_connected:%' order by created_at desc limit 1;       -- espera 1
--   rollback;

-- (d) backfill: 1 evento 'k:first_offer:<user>' por usuario com ofertas, ja notificado
select (select count(distinct user_id) from public.offers where user_id is not null) as usuarios_com_ofertas,
       (select count(*) from public.ops_events where fingerprint like 'k:first_offer:%') as marcas_first_offer;
                                                                                           -- espera os dois iguais logo apos aplicar
                                                                                           -- (depois, marcas >= usuarios: novos usuarios geram 1a oferta)
select count(*) as backfill_sem_notificar
  from public.ops_events
 where fingerprint like 'k:first_offer:%' and detail = '{}'::jsonb and notified_at is null; -- espera 0
