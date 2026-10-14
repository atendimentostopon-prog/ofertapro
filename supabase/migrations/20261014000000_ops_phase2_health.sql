-- supabase/migrations/20261014000000_ops_phase2_health.sql
-- Central de alertas, Fase 2 (saude): ops_health (para o Uptime Kuma), reenvio de
-- alertas nao entregues, healthcheck periodico do banco e aviso de expiracao de conta.
-- Depende de 20261013000000_ops_events_and_emit.sql (ops_events, ops_emit).
-- ROLLBACK: supabase/rollbacks/20261014000000_ops_phase2_health_rollback.sql
-- Aplicar no SQL Editor com o mesmo papel das migrations anteriores.

-- 1) ops_health: sonda para o Uptime Kuma via PostgREST -------------------------------
-- Nao le tabela nenhuma: responde 200 enquanto o PostgREST e o banco estiverem de pe.
create or replace function public.ops_health()
returns jsonb
language sql
stable
security invoker
as $$
  select jsonb_build_object('ok', true, 'ts', now())
$$;

revoke all on function public.ops_health() from public;
grant execute on function public.ops_health() to anon, authenticated, service_role;

-- 2) Colunas de reenvio em ops_events -------------------------------------------------
alter table public.ops_events
  add column if not exists notify_attempts int not null default 0,
  add column if not exists last_notify_attempt_at timestamptz;

-- 3) Reenvio de alertas nao entregues -------------------------------------------------
create or replace function public.ops_retry_undelivered()
returns int
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  r       record;
  v_key   text;
  v_n     int := 0;
  v_url   constant text := 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/notify';
begin
  select ds.decrypted_secret into v_key
    from vault.decrypted_secrets ds
   where ds.name = 'app_service_role_key'
   limit 1;

  if coalesce(v_key, '') = '' then
    raise notice '[ops_retry_undelivered] app_service_role_key nao configurado no Vault; nada reenviado';
    return 0;
  end if;

  for r in
    select e.id
      from public.ops_events e
     where e.notified_at is null
       and e.severity in ('critical', 'error', 'business')
       and e.created_at > now() - interval '24 hours'
       and e.created_at < now() - interval '2 minutes'
       and e.notify_attempts < 3
       and coalesce(e.last_notify_attempt_at, '-infinity'::timestamptz) < now() - interval '5 minutes'
     order by e.created_at
     limit 20
  loop
    -- a tentativa e contada antes do envio: um erro no envio nao gera laco infinito
    update public.ops_events
       set notify_attempts = notify_attempts + 1,
           last_notify_attempt_at = now()
     where id = r.id;

    begin
      perform net.http_post(
        url     := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_key),
        body    := jsonb_build_object('event_id', r.id)
      );
      v_n := v_n + 1;
    exception when others then
      raise warning '[ops_retry_undelivered] reenvio falhou para %: %', r.id, sqlerrm;
    end;
  end loop;

  return v_n;
exception when others then
  raise warning '[ops_retry_undelivered] % (%)', sqlerrm, sqlstate;
  return 0;
end;
$$;

revoke all on function public.ops_retry_undelivered() from public, anon, authenticated;

-- 4) Healthcheck periodico ------------------------------------------------------------
create or replace function public.ops_healthcheck()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r              record;
  v_limite_mb    constant int := 400;   -- 80% do limite Free de 500 MB
  v_cron_falha   int := 0;
  v_cron_parado  int := 0;
  v_bots         int := 0;
  v_conexoes     int := 0;
  v_disco        int := 0;
  v_reenviados   int := 0;
  v_bots_n       int;
  v_amostra      jsonb;
  v_ativas       int;
  v_maximo       int;
  v_bytes        bigint;
begin
  -- 1) cron falhando nos ultimos 15 minutos
  begin
    for r in
      select j.jobname,
             count(*)::int as falhas,
             max(d.start_time) as ultima,
             (array_agg(left(d.return_message, 200) order by d.start_time desc))[1] as mensagem
        from cron.job_run_details d
        join cron.job j on j.jobid = d.jobid
       where d.status = 'failed'
         and d.start_time > now() - interval '15 minutes'
       group by j.jobname
    loop
      perform public.ops_emit(
        'error', 'cron', 'Job do cron falhou: ' || r.jobname,
        jsonb_strip_nulls(jsonb_build_object(
          'job',      r.jobname,
          'falhas',   r.falhas,
          'ultima',   r.ultima,
          'mensagem', r.mensagem
        ))
      );
      v_cron_falha := v_cron_falha + 1;
    end loop;
  exception when others then
    raise warning '[ops_healthcheck] cron falhando: %', sqlerrm;
  end;

  -- 2) cron parado: job ativo sem execucao bem-sucedida dentro do intervalo maximo.
  --    Job sem nenhuma linha em job_run_details, ou cuja primeira execucao e mais
  --    recente que o intervalo maximo (criado recentemente), nao alerta.
  begin
    for r in
      select t.jobname,
             t.maxi,
             (select max(d.end_time) from cron.job_run_details d
               where d.jobid = j.jobid and d.status = 'succeeded') as ultima_ok,
             (select min(d.start_time) from cron.job_run_details d
               where d.jobid = j.jobid) as primeira
        from (values
               ('aflyo_expire_offers',     interval '45 minutes'),
               ('expire_trials',           interval '3 hours'),
               ('ops_trial_expiring_scan', interval '3 hours')
             ) as t(jobname, maxi)
        join cron.job j on j.jobname = t.jobname and j.active
    loop
      if r.primeira is not null
         and r.primeira < now() - r.maxi
         and (r.ultima_ok is null or r.ultima_ok < now() - r.maxi) then
        perform public.ops_emit(
          'error', 'cron', 'Cron parado: ' || r.jobname,
          jsonb_strip_nulls(jsonb_build_object(
            'job',                r.jobname,
            'ultima_execucao_ok', r.ultima_ok,
            'esperado_a_cada',    r.maxi::text
          ))
        );
        v_cron_parado := v_cron_parado + 1;
      end if;
    end loop;
  exception when others then
    raise warning '[ops_healthcheck] cron parado: %', sqlerrm;
  end;

  -- 3) bots ativos com erro registrado (pending e paused nunca alertam;
  --    last_seen_at e nulo para todos os bots, entao nao e usado como sinal de vida)
  begin
    select count(*)::int into v_bots_n
      from public.bot_configs b
     where b.status = 'active'
       and nullif(btrim(coalesce(b.last_error, '')), '') is not null;

    if v_bots_n > 0 then
      select coalesce(jsonb_agg(jsonb_build_object('user_id', s.user_id, 'erro', s.erro)), '[]'::jsonb)
        into v_amostra
        from (
          select b.user_id, left(b.last_error, 160) as erro
            from public.bot_configs b
           where b.status = 'active'
             and nullif(btrim(coalesce(b.last_error, '')), '') is not null
           order by b.updated_at desc nulls last
           limit 5
        ) s;

      perform public.ops_emit(
        'error', 'bot', 'Bots com erro: ' || v_bots_n::text,
        jsonb_build_object('quantidade', v_bots_n, 'amostra', v_amostra)
      );
      v_bots := 1;
    end if;
  exception when others then
    raise warning '[ops_healthcheck] bots: %', sqlerrm;
  end;

  -- 4) conexoes acima de 80% de max_connections
  begin
    select count(*)::int into v_ativas from pg_stat_activity;
    v_maximo := current_setting('max_connections')::int;
    if v_maximo > 0 and v_ativas > (v_maximo * 0.8) then
      perform public.ops_emit(
        'error', 'health', 'Conexões do banco acima de 80%',
        jsonb_build_object(
          'ativas',     v_ativas,
          'maximo',     v_maximo,
          'percentual', round(v_ativas * 100.0 / v_maximo, 1)
        )
      );
      v_conexoes := 1;
    end if;
  exception when others then
    raise warning '[ops_healthcheck] conexoes: %', sqlerrm;
  end;

  -- 5) disco acima de 400 MB (limite Free: 500 MB)
  begin
    v_bytes := pg_database_size(current_database());
    if v_bytes > (v_limite_mb::bigint * 1024 * 1024) then
      perform public.ops_emit(
        'error', 'health', 'Banco perto do limite de disco',
        jsonb_build_object(
          'tamanho_mb', round(v_bytes / 1048576.0, 1),
          'limite_mb',  v_limite_mb
        )
      );
      v_disco := 1;
    end if;
  exception when others then
    raise warning '[ops_healthcheck] disco: %', sqlerrm;
  end;

  -- 6) reenvio de alertas nao entregues (nao emite alerta, so devolve a contagem)
  begin
    v_reenviados := coalesce(public.ops_retry_undelivered(), 0);
  exception when others then
    raise warning '[ops_healthcheck] reenvio: %', sqlerrm;
  end;

  return jsonb_build_object(
    'cron_falhando', v_cron_falha,
    'cron_parado',   v_cron_parado,
    'bots_com_erro', v_bots,
    'conexoes',      v_conexoes,
    'disco',         v_disco,
    'reenviados',    v_reenviados
  );
exception when others then
  raise warning '[ops_healthcheck] % (%)', sqlerrm, sqlstate;
  return jsonb_build_object('erro', true);
end;
$$;

revoke all on function public.ops_healthcheck() from public, anon, authenticated;

select cron.schedule('ops_healthcheck', '*/5 * * * *', $$ select public.ops_healthcheck(); $$);

-- 5) Expiracao e cancelamento de conta ------------------------------------------------
-- Dispara so quando account_status passa a 'expired' ou 'canceled' (nunca NULL -> trialing/active).
create or replace function public.ops_on_account_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_titulo text;
begin
  begin
    v_titulo := case
      when old.account_status = 'trialing' and new.account_status = 'expired' then 'Trial expirou'
      when new.account_status = 'expired' then 'Assinatura expirou'
      else 'Conta cancelada'
    end;

    perform public.ops_emit(
      'business', 'billing', v_titulo,
      jsonb_strip_nulls(jsonb_build_object(
        'nome',              coalesce(nullif(btrim(new.full_name), ''), nullif(btrim(new.display_name), '')),
        'email',             new.email,
        'telefone',          nullif(btrim(new.phone), ''),
        'plano',             new.plan,
        'situacao_anterior', old.account_status,
        'situacao_atual',    new.account_status,
        'painel',            'https://admin.aflyo.com.br/users/' || new.id::text
      )),
      new.id,
      'acct:' || new.id::text || ':' || new.account_status || ':' || (extract(epoch from now())::bigint)::text
    );
  exception when others then
    raise warning '[ops_on_account_status_change] %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function public.ops_on_account_status_change() from public, anon, authenticated;

drop trigger if exists trg_ops_account_status on public.profiles;
create trigger trg_ops_account_status
  after update of account_status on public.profiles
  for each row
  when (old.account_status is distinct from new.account_status
        and new.account_status in ('expired', 'canceled'))
  execute function public.ops_on_account_status_change();
