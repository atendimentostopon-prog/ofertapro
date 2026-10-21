-- Teste manual de 20261021100100_source_processor_cron.sql (banco descartável, depois de 20261021100000).
BEGIN;
DO $$
DECLARE u uuid := gen_random_uuid(); inst uuid; g uuid; n int;
BEGIN
  -- Fila vazia: não chama nada.
  ASSERT public.source_processor_sweep() IS NULL, 'fila vazia não chama a function';

  INSERT INTO auth.users (id, email) VALUES (u, 'cron-test@example.com');
  UPDATE public.profiles SET plan = 'pro' WHERE id = u;
  INSERT INTO public.whatsapp_instances (user_id, instance_name, status) VALUES (u, 'cron_test', 'connected') RETURNING id INTO inst;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name, is_source)
    VALUES (u, inst, 'c@g.us', 'C', true) RETURNING id INTO g;

  -- Pendente recente (< 1 min) ainda não é do cron.
  INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
    VALUES (u, g, 'NOW', 'x https://a.co/x');
  ASSERT public.source_processor_sweep() IS NULL, 'pendente recente fica com o webhook';

  -- Pendente antigo sem chave no Vault: não quebra, só não chama.
  INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text, created_at)
    VALUES (u, g, 'OLD', 'x https://a.co/x', now() - interval '5 minutes');
  ASSERT public.source_processor_sweep() IS NULL, 'sem chave no Vault: avisa e não chama';

  -- Retenção apaga só o que tem mais de 30 dias.
  INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text, created_at)
    VALUES (u, g, 'ANCIENT', 'x', now() - interval '31 days');
  PERFORM public.source_messages_retention();
  SELECT count(*) INTO n FROM public.source_messages WHERE whatsapp_group_id = g;
  ASSERT n = 2, 'retenção apagou só a antiga';
END $$;
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM cron.job WHERE jobname IN ('source_processor_sweep', 'source_messages_retention')) = 2, 'jobs agendados';
END $$;
ROLLBACK;
