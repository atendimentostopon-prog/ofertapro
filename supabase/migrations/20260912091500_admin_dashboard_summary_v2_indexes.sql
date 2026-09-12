-- Indices de apoio pra admin_dashboard_summary_v2: as colunas de data agora
-- sao filtradas 3x por request (periodo atual, periodo anterior, serie
-- diaria), sem indice isso e full scan em clicks/webhook_events/profiles/offers.
create index if not exists clicks_created_at_idx on public.clicks (created_at desc);
create index if not exists webhook_events_processed_at_idx on public.webhook_events (processed_at desc);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
create index if not exists offers_created_at_idx on public.offers (created_at desc);
