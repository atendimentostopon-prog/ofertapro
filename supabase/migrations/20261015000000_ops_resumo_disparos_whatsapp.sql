-- supabase/migrations/20261015000000_ops_resumo_disparos_whatsapp.sql
-- Central de alertas: resumo diario (vigia do vigia), disparos falhando, canal com falha
-- persistente, taxa de falha alta, Evolution API instavel e WhatsApp desconectado/com erro.
-- Depende de 20261013000000_ops_events_and_emit.sql (ops_events, ops_emit),
-- 20261014000000_ops_phase2_health.sql (padrao de healthcheck e cron) e
-- 20261014010000_ops_user_milestones.sql (ops_user_snapshot).
-- ROLLBACK: supabase/rollbacks/20261015000000_ops_resumo_disparos_whatsapp_rollback.sql
-- Aplicar no SQL Editor com o mesmo papel das migrations anteriores.
-- NAO altera ops_healthcheck(): funcoes e jobs novos. Crons fora do minuto 0 (a unica
-- excecao e o resumo diario das 11:00 UTC = 08:00 BRT, pedido explicito do operador).
-- Falha PARCIAL em um canal nao gera alerta: so falha total do usuario na hora ou canal
-- que falhou >= 10 vezes em 24 h e nunca entregou.

-- 1) WhatsApp caiu (trigger) -------------------------------------------------------------
-- UPDATE-only: o WHEN pode olhar OLD. So avisa connected -> disconnected/error; a carga
-- inicial (INSERT) e qrcode/disconnected -> error nunca disparam.
create or replace function public.ops_on_whatsapp_down()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    perform public.ops_emit(
      'error', 'bot',
      case when new.status = 'disconnected' then 'WhatsApp desconectado' else 'WhatsApp com erro' end,
      public.ops_user_snapshot(new.user_id) || jsonb_strip_nulls(jsonb_build_object(
        'numero_whatsapp', nullif(btrim(new.phone_number), ''),
        'perfil_whatsapp', nullif(btrim(new.profile_name), ''),
        'instancia',       nullif(btrim(new.instance_name), ''),
        'erro',            nullif(left(btrim(regexp_replace(
                             regexp_replace(coalesce(new.error_message, ''), '<[^>]*>', ' ', 'g'),
                             '\s+', ' ', 'g')), 160), '')
      )),
      new.user_id,
      'wa_down:' || new.id::text || ':' || to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDDHH24')
    );
  exception when others then
    raise warning '[ops_on_whatsapp_down] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_whatsapp_down() from public, anon, authenticated;

drop trigger if exists trg_ops_whatsapp_down on public.whatsapp_instances;
create trigger trg_ops_whatsapp_down
  after update of status on public.whatsapp_instances
  for each row
  when (old.status = 'connected' and new.status in ('disconnected', 'error'))
  execute function public.ops_on_whatsapp_down();

-- 2) Checagens de disparo e Evolution ------------------------------------------------------
create or replace function public.ops_healthcheck_dispatch()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r             record;
  v_hora        text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDDHH24');
  v_dia         text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD');
  v_falhando    int := 0;
  v_canais      int := 0;
  v_taxa        int := 0;
  v_evolution   int := 0;
  v_total       int;
  v_falhas      int;
  v_instancias  int;
  v_exemplo     text;
begin
  -- 1) usuario com >= 3 disparos na ultima hora e nenhum sucesso (falha total).
  --    Falha parcial (success_count > 0 em qualquer linha) soma em ok e nao alerta.
  begin
    for r in
      select h.user_id,
             count(*)::int as disparos,
             sum(coalesce(h.failure_count, 0))::int as falhas,
             (array_agg(
                nullif(left(btrim(regexp_replace(regexp_replace(coalesce(h.error, ''), '<[^>]*>', ' ', 'g'),
                                                 '\s+', ' ', 'g')), 160), '')
                order by h.sent_at desc) filter (where nullif(btrim(coalesce(h.error, '')), '') is not null))[1]
               as ultimo_erro
        from public.history h
       where h.sent_at > now() - interval '60 minutes'
         and h.user_id is not null
       group by h.user_id
      having count(*) >= 3
         and sum(coalesce(h.success_count, 0)) = 0
         and sum(coalesce(h.failure_count, 0)) > 0
    loop
      begin
        perform public.ops_emit(
          'error', 'bot', 'Disparos falhando',
          public.ops_user_snapshot(r.user_id) || jsonb_strip_nulls(jsonb_build_object(
            'disparos',    r.disparos,
            'falhas',      r.falhas,
            'ultimo_erro', r.ultimo_erro
          )),
          r.user_id,
          'disp_falha:' || r.user_id::text || ':' || v_hora
        );
        v_falhando := v_falhando + 1;
      exception when others then
        raise warning '[ops_healthcheck_dispatch] disparos falhando (emit): %', sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning '[ops_healthcheck_dispatch] disparos falhando: %', sqlerrm;
  end;

  -- 2) canal que falhou em >= 10 disparos nas ultimas 24 h e nunca entregou no periodo.
  begin
    for r in
      with f as (
        select h.user_id, c.canal, count(*)::int as n
          from public.history h
         cross join lateral unnest(coalesce(h.failed_channels, '{}'::text[])) as c(canal)
         where h.sent_at > now() - interval '24 hours'
           and h.user_id is not null
           and c.canal is not null
         group by h.user_id, c.canal
        having count(*) >= 10
      ),
      s as (
        select distinct h.user_id, c.canal
          from public.history h
         cross join lateral unnest(coalesce(h.successful_channels, '{}'::text[])) as c(canal)
         where h.sent_at > now() - interval '24 hours'
           and h.user_id is not null
           and c.canal is not null
      )
      select f.user_id,
             count(*)::int as quantidade,
             array_to_string((array_agg(f.canal order by f.n desc, f.canal))[1:5], ', ') as canais
        from f
       where not exists (select 1 from s where s.user_id = f.user_id and s.canal = f.canal)
       group by f.user_id
    loop
      begin
        perform public.ops_emit(
          'error', 'bot', 'Canal com falha persistente',
          public.ops_user_snapshot(r.user_id) || jsonb_strip_nulls(jsonb_build_object(
            'canais_com_falha', nullif(r.canais, ''),
            'quantidade',       r.quantidade
          )),
          r.user_id,
          'canal_falha:' || r.user_id::text || ':' || v_dia
        );
        v_canais := v_canais + 1;
      exception when others then
        raise warning '[ops_healthcheck_dispatch] canal persistente (emit): %', sqlerrm;
      end;
    end loop;
  exception when others then
    raise warning '[ops_healthcheck_dispatch] canal persistente: %', sqlerrm;
  end;

  -- 3) taxa geral: >= 10 disparos na ultima hora e >= 50% com falha total.
  begin
    select count(*)::int,
           (count(*) filter (where coalesce(h.success_count, 0) = 0
                                and coalesce(h.failure_count, 0) > 0))::int
      into v_total, v_falhas
      from public.history h
     where h.sent_at > now() - interval '60 minutes';

    if v_total >= 10 and v_falhas * 2 >= v_total then
      perform public.ops_emit(
        'error', 'health', 'Taxa de falha de disparo alta',
        jsonb_build_object(
          'total',      v_total,
          'falhas',     v_falhas,
          'percentual', round(v_falhas * 100.0 / v_total)::int
        ),
        null,
        'disp_taxa:' || v_hora
      );
      v_taxa := 1;
    end if;
  exception when others then
    raise warning '[ops_healthcheck_dispatch] taxa geral: %', sqlerrm;
  end;

  -- 4) Evolution instavel: >= 2 instancias em erro atualizadas nos ultimos 30 minutos.
  begin
    select count(*)::int,
           (array_agg(
              nullif(left(btrim(regexp_replace(regexp_replace(coalesce(w.error_message, ''), '<[^>]*>', ' ', 'g'),
                                               '\s+', ' ', 'g')), 160), '')
              order by w.updated_at desc))[1]
      into v_instancias, v_exemplo
      from public.whatsapp_instances w
     where w.status = 'error'
       and w.updated_at > now() - interval '30 minutes';

    if v_instancias >= 2 then
      perform public.ops_emit(
        'error', 'health', 'Evolution API instável',
        jsonb_strip_nulls(jsonb_build_object(
          'instancias',   v_instancias,
          'exemplo_erro', v_exemplo
        )),
        null,
        'evolution:' || v_hora
      );
      v_evolution := 1;
    end if;
  exception when others then
    raise warning '[ops_healthcheck_dispatch] evolution: %', sqlerrm;
  end;

  return jsonb_build_object(
    'disparos_falhando',   v_falhando,
    'canais_persistentes', v_canais,
    'taxa_alta',           v_taxa,
    'evolution_instavel',  v_evolution
  );
exception when others then
  raise warning '[ops_healthcheck_dispatch] % (%)', sqlerrm, sqlstate;
  return jsonb_build_object('erro', true);
end;
$$;

revoke all on function public.ops_healthcheck_dispatch() from public, anon, authenticated;

select cron.schedule('ops_healthcheck_dispatch', '4-59/5 * * * *', $$ select public.ops_healthcheck_dispatch(); $$);

-- 3) Resumo diario --------------------------------------------------------------------------
-- Janelas de 24 h limitadas, cada metrica em seu proprio bloco: se uma consulta falhar, a
-- chave some e o resto segue. Vendas saem como numeros (vendas_qtd, vendas_valor): o
-- formatador TypeScript monta "2 · R$ 97,78 (bruto)". Apenas contagens, sem dados pessoais.
create or replace function public.ops_daily_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detail   jsonb := '{}'::jsonb;
  v_dia      text := to_char(now() at time zone 'America/Sao_Paulo', 'YYYYMMDD');
  a          int;
  b          int;
  c          int;
  d          int;
  v_valor    numeric;
  v_bytes    bigint;
  v_maximo   int;
  v_emitido  boolean := false;
begin
  -- usuarios
  begin
    select count(*)::int,
           (count(*) filter (where p.created_at > now() - interval '24 hours'))::int
      into a, b
      from public.profiles p;
    select count(*)::int into c
      from auth.users u
     where u.email_confirmed_at > now() - interval '24 hours';
    v_detail := v_detail || jsonb_build_object(
      'usuarios', a || ' no total · +' || b || ' novos · ' || c || case when c = 1 then ' confirmou' else ' confirmaram' end
    );
  exception when others then
    raise warning '[ops_daily_summary] usuarios: %', sqlerrm;
  end;

  -- trials
  begin
    select count(*)::int,
           (count(*) filter (where p.trial_ends_at > now() and p.trial_ends_at <= now() + interval '24 hours'))::int
      into a, b
      from public.profiles p
     where p.account_status = 'trialing';
    v_detail := v_detail || jsonb_build_object(
      'trials', a || case when a = 1 then ' ativo' else ' ativos' end
                || ' · ' || b || case when b = 1 then ' vence' else ' vencem' end || ' em 24h'
    );
  exception when others then
    raise warning '[ops_daily_summary] trials: %', sqlerrm;
  end;

  -- vendas (numericas; o formatador monta o texto)
  begin
    select count(*)::int,
           coalesce(sum(case when e.payload->'data'->>'amount' ~ '^[0-9]+(\.[0-9]+)?$'
                             then (e.payload->'data'->>'amount')::numeric end), 0)
      into a, v_valor
      from public.webhook_events e
     where e.event_type in ('purchase_approved', 'subscription_renewed')
       and e.processed_at > now() - interval '24 hours';
    v_detail := v_detail || jsonb_build_object('vendas_qtd', a, 'vendas_valor', v_valor);
  exception when others then
    raise warning '[ops_daily_summary] vendas: %', sqlerrm;
  end;

  -- reembolsos, chargebacks e recusas
  begin
    select (count(*) filter (where e.event_type = 'refund'))::int,
           (count(*) filter (where e.event_type = 'chargeback'))::int,
           (count(*) filter (where e.event_type in ('purchase_refused', 'subscription_renewal_refused')))::int
      into a, b, c
      from public.webhook_events e
     where e.event_type in ('refund', 'chargeback', 'purchase_refused', 'subscription_renewal_refused')
       and e.processed_at > now() - interval '24 hours';
    v_detail := v_detail || jsonb_build_object(
      'reembolsos', a || case when a = 1 then ' reembolso' else ' reembolsos' end
                    || ' · ' || b || case when b = 1 then ' chargeback' else ' chargebacks' end
                    || ' · ' || c || case when c = 1 then ' recusa' else ' recusas' end
    );
  exception when others then
    raise warning '[ops_daily_summary] reembolsos: %', sqlerrm;
  end;

  -- ofertas
  begin
    select count(*)::int into a
      from public.offers o
     where o.created_at > now() - interval '24 hours';
    v_detail := v_detail || jsonb_build_object(
      'ofertas', a || case when a = 1 then ' recebida' else ' recebidas' end
    );
  exception when others then
    raise warning '[ops_daily_summary] ofertas: %', sqlerrm;
  end;

  -- bots
  begin
    select count(*)::int into a
      from public.bot_configs bc
     where bc.status = 'active';
    v_detail := v_detail || jsonb_build_object(
      'bots', a || case when a = 1 then ' ativo' else ' ativos' end
    );
  exception when others then
    raise warning '[ops_daily_summary] bots: %', sqlerrm;
  end;

  -- disparos
  begin
    select count(*)::int,
           (count(*) filter (where h.status = 'success'))::int,
           (count(*) filter (where h.status = 'partial'))::int,
           (count(*) filter (where h.status = 'error'))::int
      into a, b, c, d
      from public.history h
     where h.sent_at > now() - interval '24 hours';
    v_detail := v_detail || jsonb_build_object(
      'disparos', a || ' (' || b || ' ok · ' || c || case when c = 1 then ' parcial' else ' parciais' end
                  || ' · ' || d || ' erro)'
    );
  exception when others then
    raise warning '[ops_daily_summary] disparos: %', sqlerrm;
  end;

  -- alertas das ultimas 24 h (sem as amostras de teste)
  begin
    select (count(*) filter (where e.severity = 'critical'))::int,
           (count(*) filter (where e.severity = 'error'))::int
      into a, b
      from public.ops_events e
     where e.created_at > now() - interval '24 hours'
       and e.fingerprint not like 'k:amostra:%';
    v_detail := v_detail || jsonb_build_object(
      'alertas', a || case when a = 1 then ' crítico' else ' críticos' end
                 || ' · ' || b || case when b = 1 then ' erro' else ' erros' end
    );
  exception when others then
    raise warning '[ops_daily_summary] alertas: %', sqlerrm;
  end;

  -- whatsapp
  begin
    select count(*)::int,
           (count(*) filter (where w.status = 'connected'))::int,
           (count(*) filter (where w.status = 'error'))::int
      into a, b, c
      from public.whatsapp_instances w;
    v_detail := v_detail || jsonb_build_object(
      'whatsapp', b || case when b = 1 then ' conectada' else ' conectadas' end
                  || ' de ' || a || ' (' || c || ' com erro)'
    );
  exception when others then
    raise warning '[ops_daily_summary] whatsapp: %', sqlerrm;
  end;

  -- cron
  begin
    select count(*)::int into a
      from cron.job_run_details jr
     where jr.status = 'failed'
       and jr.start_time > now() - interval '24 hours';
    v_detail := v_detail || jsonb_build_object(
      'cron', a || case when a = 1 then ' falha' else ' falhas' end || ' nas últimas 24 h'
    );
  exception when others then
    raise warning '[ops_daily_summary] cron: %', sqlerrm;
  end;

  -- banco
  begin
    v_bytes := pg_database_size(current_database());
    select count(*)::int into a
      from pg_stat_activity where backend_type = 'client backend';
    v_maximo := current_setting('max_connections')::int;
    v_detail := v_detail || jsonb_build_object(
      'banco', round(v_bytes / 1048576.0)::int || ' MB de 500 · ' || a || ' conexões de ' || v_maximo
    );
  exception when others then
    raise warning '[ops_daily_summary] banco: %', sqlerrm;
  end;

  -- entrega de alertas
  begin
    select count(*)::int into a
      from public.ops_events e
     where e.notified_at is null
       and e.severity in ('critical', 'error', 'business')
       and e.created_at > now() - interval '24 hours'
       and e.fingerprint not like 'k:amostra:%';
    v_detail := v_detail || jsonb_build_object(
      'entrega', case when a = 0 then 'nenhum alerta pendente de entrega'
                      when a = 1 then '1 alerta pendente de entrega'
                      else a || ' alertas pendentes de entrega' end
    );
  exception when others then
    raise warning '[ops_daily_summary] entrega: %', sqlerrm;
  end;

  -- emite sempre, mesmo com metricas ausentes (a chegada do resumo as 08h e o sinal de vida)
  begin
    perform public.ops_emit(
      'business', 'admin', 'Resumo diário',
      jsonb_strip_nulls(v_detail),
      null,
      'daily:' || v_dia
    );
    v_emitido := true;
  exception when others then
    raise warning '[ops_daily_summary] emit: %', sqlerrm;
  end;

  return jsonb_build_object(
    'emitido', v_emitido,
    'chaves',  (select count(*)::int from jsonb_object_keys(v_detail))
  );
exception when others then
  raise warning '[ops_daily_summary] % (%)', sqlerrm, sqlstate;
  return jsonb_build_object('erro', true);
end;
$$;

revoke all on function public.ops_daily_summary() from public, anon, authenticated;

-- 08:00 BRT = 11:00 UTC (o Brasil nao tem horario de verao)
select cron.schedule('ops_daily_summary', '0 11 * * *', $$ select public.ops_daily_summary(); $$);
