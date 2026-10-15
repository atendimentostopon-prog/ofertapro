-- supabase/tests/manual/20261015000000_ops_resumo_disparos_whatsapp.test.sql
-- Rodar no SQL Editor DEPOIS da migration 20261015000000_ops_resumo_disparos_whatsapp.sql.
-- Os blocos (a) e (b) so leem. (c) pode emitir alertas reais se a condicao existir. (d)
-- emite 1 alerta REAL (dedupe diario) e fica comentado. (e) escreve e sempre reverte.

-- (a) trigger e 2 crons presentes
select tgname, tgrelid::regclass as tabela
  from pg_trigger
 where tgname = 'trg_ops_whatsapp_down' and not tgisinternal;                              -- espera 1 linha

select jobname, schedule, active
  from cron.job
 where jobname in ('ops_healthcheck_dispatch', 'ops_daily_summary')
 order by jobname;                                                                         -- espera 2 linhas: '3 11 * * *' e '4-59/5 * * * *', active = true

-- (b) privilegios: nenhuma funcao executavel por anon/authenticated
select f.proname,
       has_function_privilege('anon',          f.oid, 'execute') as anon_exec,
       has_function_privilege('authenticated', f.oid, 'execute') as auth_exec
  from pg_proc f
 where f.pronamespace = 'public'::regnamespace
   and f.proname in ('ops_on_whatsapp_down', 'ops_healthcheck_dispatch', 'ops_daily_summary')
 order by f.proname;                                                                       -- espera 3 linhas, tudo false

-- (c) checagens de disparo: so le o historico; emite alerta real se a condicao existir agora
select public.ops_healthcheck_dispatch();
  -- espera jsonb com disparos_falhando, canais_persistentes, taxa_alta, evolution_instavel
  -- (0 num dia normal; falha PARCIAL de um canal nunca entra na contagem)

-- (d) resumo diario. ATENCAO: gera 1 alerta REAL "Resumo diário" no Discord e no Telegram.
--     Dedupe diario ('daily:YYYYMMDD'): rodar de novo no mesmo dia so soma occurrences.
--
--   select public.ops_daily_summary();   -- espera {"emitido": true, "chaves": 13}
--   select detail from public.ops_events
--    where fingerprint like 'k:daily:%' order by created_at desc limit 1;
--     -- espera usuarios, trials, vendas_qtd, vendas_valor, reembolsos, ofertas, bots,
--     -- disparos, alertas, whatsapp, cron, banco, entrega (uma chave so some se sua consulta falhar)

-- (e) trigger: connected -> error gera o evento e qrcode -> error nao. Sempre reverte.
--     Dentro da transacao revertida o pg_net tambem descarta a requisicao: nada chega ao Discord.
do $$
declare
  v_id     uuid;
  v_titulo text;
  v_qtd    int;
begin
  select w.id into v_id
    from public.whatsapp_instances w
   where w.status = 'connected'
   order by w.updated_at desc
   limit 1;

  if v_id is null then
    raise notice 'sem instancia connected para testar; pule este bloco';
    return;
  end if;

  update public.whatsapp_instances
     set status = 'error', error_message = '<html>Evolution API 530</html>'
   where id = v_id;

  select title into v_titulo
    from public.ops_events
   where fingerprint like 'k:wa_down:' || v_id::text || ':%'
   order by created_at desc limit 1;
  if v_titulo is distinct from 'WhatsApp com erro' then
    raise exception 'FALHA: esperava "WhatsApp com erro", veio %', v_titulo;
  end if;

  -- error -> qrcode -> error nao pode avisar de novo (old.status nao e connected)
  update public.whatsapp_instances set status = 'qrcode' where id = v_id;
  update public.whatsapp_instances set status = 'error' where id = v_id;
  select occurrences into v_qtd
    from public.ops_events
   where fingerprint like 'k:wa_down:' || v_id::text || ':%'
   order by created_at desc limit 1;
  if v_qtd is distinct from 1 then
    raise exception 'FALHA: qrcode -> error nao pode avisar (occurrences = %)', v_qtd;
  end if;

  raise exception 'OK: teste concluido, transacao revertida de proposito';
end;
$$;
                                                                                           -- espera o erro final 'OK: teste concluido...' (nada persiste)
