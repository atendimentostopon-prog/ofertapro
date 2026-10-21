-- Teste manual de 20261021100000_whatsapp_source_groups.sql.
-- Rodar num banco descartável (branch do Supabase ou postgres local com o schema), depois da migration.
-- Tudo roda dentro de BEGIN ... ROLLBACK: não deixa dado para trás.
BEGIN;
DO $$
DECLARE u uuid := gen_random_uuid(); inst uuid; g1 uuid; g2 uuid; g3 uuid;
BEGIN
  INSERT INTO auth.users (id, email) VALUES (u, 'src-test@example.com');
  UPDATE public.profiles SET plan = 'starter' WHERE id = u; -- max_source_groups = 2
  INSERT INTO public.whatsapp_instances (user_id, instance_name, status)
    VALUES (u, 'src_test_inst', 'connected') RETURNING id INTO inst;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name)
    VALUES (u, inst, '1@g.us', 'A') RETURNING id INTO g1;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name)
    VALUES (u, inst, '2@g.us', 'B') RETURNING id INTO g2;
  INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name)
    VALUES (u, inst, '3@g.us', 'C') RETURNING id INTO g3;
  INSERT INTO public.bot_configs (user_id, grupos_origem) VALUES (u, ARRAY['-1001']);

  UPDATE public.whatsapp_groups SET is_source = true WHERE id = g1;          -- total 2: ok
  ASSERT public.count_source_groups(u) = 2, 'conta Telegram + WhatsApp';

  BEGIN
    UPDATE public.whatsapp_groups SET is_source = true WHERE id = g2;        -- total 3: estoura
    RAISE EXCEPTION 'deveria ter estourado o limite (WhatsApp)';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.whatsapp_groups (user_id, whatsapp_instance_id, evolution_group_id, name, is_source)
      VALUES (u, inst, '4@g.us', 'D', true);                                 -- insert já como origem também conta
    RAISE EXCEPTION 'deveria ter estourado o limite (insert)';
  EXCEPTION WHEN check_violation THEN NULL; END;

  BEGIN
    UPDATE public.bot_configs SET grupos_origem = ARRAY['-1001','-1002'] WHERE user_id = u;
    RAISE EXCEPTION 'limite do Telegram deveria somar o WhatsApp';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- Desmarcar e remarcar o mesmo grupo não conta duas vezes.
  UPDATE public.whatsapp_groups SET is_source = true WHERE id = g1;
  ASSERT public.count_source_groups(u) = 2, 'remarcar não soma';
  UPDATE public.whatsapp_groups SET is_source = false WHERE id = g1;
  UPDATE public.whatsapp_groups SET is_source = true WHERE id = g3;          -- volta a caber
  ASSERT public.count_source_groups(u) = 2, 'trocar de grupo cabe no limite';

  INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
    VALUES (u, g3, 'MSG1', 'oferta https://amzn.to/x');
  BEGIN
    INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
      VALUES (u, g3, 'MSG1', 'dup');
    RAISE EXCEPTION 'unique (grupo, mensagem) deveria barrar';
  EXCEPTION WHEN unique_violation THEN NULL; END;

  BEGIN
    INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text, status)
      VALUES (u, g3, 'MSG2', 'x', 'enviado');
    RAISE EXCEPTION 'status fora do CHECK deveria falhar';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

-- RLS: authenticated só lê o que é seu e não escreve.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid())::text, true);
DO $$ BEGIN
  ASSERT (SELECT count(*) FROM public.source_messages) = 0, 'outro usuário não vê nada';
  BEGIN
    INSERT INTO public.source_messages (user_id, whatsapp_group_id, external_message_id, raw_text)
      VALUES (auth.uid(), gen_random_uuid(), 'X', 'x');
    RAISE EXCEPTION 'authenticated não pode inserir';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.source_messages SET status = 'dispatched';
    RAISE EXCEPTION 'authenticated não pode atualizar';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
