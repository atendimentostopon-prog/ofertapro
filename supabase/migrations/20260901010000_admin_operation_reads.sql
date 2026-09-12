-- SP3: funcoes de leitura da area de Operacao. So SELECT, nenhuma mutacao.

create or replace function public.admin_promotions_list(
  p_search text, p_client text, p_status text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_q  text := nullif(trim(coalesce(p_search, '')), '');
  v_c  text := nullif(trim(coalesce(p_client, '')), '');
  v_st text := nullif(trim(coalesce(p_status, '')), '');
  v_total bigint; v_items jsonb;
begin
  select count(*) into v_total
  from public.offers o
  join public.profiles p on p.id = o.user_id
  where (v_q  is null or o.name ilike '%' || v_q || '%')
    and (v_c  is null or p.email ilike '%' || v_c || '%' or o.user_id::text = v_c)
    and (v_st is null or o.status = v_st);

  select coalesce(jsonb_agg(x order by x->>'created_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', o.id::text, 'name', o.name, 'status', o.status,
      'short_code', o.short_code, 'affiliate_link', o.affiliate_link,
      'created_at', o.created_at, 'owner_id', o.user_id::text, 'owner_email', p.email,
      'clicks_total', (select count(*) from public.clicks c where c.offer_id = o.id)
    ) as x
    from public.offers o
    join public.profiles p on p.id = o.user_id
    where (v_q  is null or o.name ilike '%' || v_q || '%')
      and (v_c  is null or p.email ilike '%' || v_c || '%' or o.user_id::text = v_c)
      and (v_st is null or o.status = v_st)
    order by o.created_at desc
    offset v_off limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

create or replace function public.admin_promotion_detail(p_offer_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_offer jsonb; v_since timestamptz := now() - interval '30 days';
begin
  select jsonb_build_object(
    'id', o.id::text, 'name', o.name, 'status', o.status, 'short_code', o.short_code,
    'affiliate_link', o.affiliate_link, 'image', o.image, 'marketplace', o.marketplace,
    'created_at', o.created_at, 'owner_id', o.user_id::text, 'owner_email', p.email
  ) into v_offer
  from public.offers o join public.profiles p on p.id = o.user_id
  where o.id = p_offer_id;
  if v_offer is null then return null; end if;

  return jsonb_build_object(
    'offer', v_offer,
    'clicks', jsonb_build_object(
      'total',   (select count(*) from public.clicks c where c.offer_id = p_offer_id),
      'last_30d',(select count(*) from public.clicks c where c.offer_id = p_offer_id and c.created_at >= v_since),
      'by_source', coalesce((
        select jsonb_agg(jsonb_build_object('source', src, 'count', n) order by n desc)
        from (
          select coalesce(c.source, '') as src, count(*) as n
          from public.clicks c where c.offer_id = p_offer_id
          group by coalesce(c.source, '')
          order by n desc limit 10
        ) g
      ), '[]'::jsonb)
    )
  );
end; $$;

create or replace function public.admin_sends_list(
  p_client text, p_status text, p_from text, p_to text, p_page int, p_page_size int
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_size int := least(100, greatest(1, coalesce(p_page_size, 25)));
  v_page int := greatest(1, coalesce(p_page, 1));
  v_off int := (greatest(1, coalesce(p_page, 1)) - 1) * least(100, greatest(1, coalesce(p_page_size, 25)));
  v_c  text := nullif(trim(coalesce(p_client, '')), '');
  v_st text := nullif(trim(coalesce(p_status, '')), '');
  v_from timestamptz; v_to timestamptz;
  v_total bigint; v_items jsonb;
begin
  begin v_from := nullif(trim(coalesce(p_from, '')), '')::timestamptz; exception when others then v_from := null; end;
  begin v_to   := nullif(trim(coalesce(p_to, '')), '')::timestamptz;   exception when others then v_to := null; end;

  select count(*) into v_total
  from public.history h
  join public.profiles p on p.id = h.user_id
  where (v_c  is null or p.email ilike '%' || v_c || '%' or h.user_id::text = v_c)
    and (v_st is null or h.status = v_st)
    and (v_from is null or h.sent_at >= v_from)
    and (v_to   is null or h.sent_at <= v_to);

  select coalesce(jsonb_agg(x order by x->>'sent_at' desc), '[]'::jsonb) into v_items from (
    select jsonb_build_object(
      'id', h.id::text, 'offer_name', h.offer_name, 'offer_image', h.offer_image,
      'marketplace', h.marketplace, 'status', h.status, 'error', h.error, 'sent_at', h.sent_at,
      'channel_count', h.channel_count,
      'successful_channels', to_jsonb(coalesce(h.successful_channels, array[]::text[])),
      'failed_channels', to_jsonb(coalesce(h.failed_channels, array[]::text[])),
      'owner_id', h.user_id::text, 'owner_email', p.email
    ) as x
    from public.history h
    join public.profiles p on p.id = h.user_id
    where (v_c  is null or p.email ilike '%' || v_c || '%' or h.user_id::text = v_c)
      and (v_st is null or h.status = v_st)
      and (v_from is null or h.sent_at >= v_from)
      and (v_to   is null or h.sent_at <= v_to)
    order by h.sent_at desc
    offset v_off limit v_size
  ) s;

  return jsonb_build_object('items', v_items, 'page', v_page, 'pageSize', v_size, 'total', v_total);
end; $$;

revoke execute on function public.admin_promotions_list(text, text, text, int, int) from authenticated, anon;
revoke execute on function public.admin_promotion_detail(uuid) from authenticated, anon;
revoke execute on function public.admin_sends_list(text, text, text, text, int, int) from authenticated, anon;
grant execute on function public.admin_promotions_list(text, text, text, int, int) to service_role;
grant execute on function public.admin_promotion_detail(uuid) to service_role;
grant execute on function public.admin_sends_list(text, text, text, text, int, int) to service_role;
