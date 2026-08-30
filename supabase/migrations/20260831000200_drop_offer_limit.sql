-- SP1: ofertas passam a ser ilimitadas em todos os planos, em qualquer caminho
-- de escrita (front, public-api, PostgREST direto). Remove o enforce de
-- 20260821000000 (que ainda barrava starter em 20000).

DROP TRIGGER IF EXISTS offers_plan_limit ON public.offers;
DROP FUNCTION IF EXISTS public.enforce_offer_limit();
