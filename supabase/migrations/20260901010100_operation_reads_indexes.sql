-- SP3: indices pra acelerar as leituras de Operacao.
-- admin_sends_list ordena por sent_at desc (com e sem filtro de cliente);
-- admin_promotions_list conta cliques por offer_id.
-- Em producao rodar a versao CONCURRENTLY no SQL Editor pra nao travar
-- escrita em history durante o disparo do cliente.
create index if not exists history_sent_at_idx on public.history (sent_at desc);
create index if not exists history_user_id_sent_at_idx on public.history (user_id, sent_at desc);
create index if not exists clicks_offer_id_idx on public.clicks (offer_id);
