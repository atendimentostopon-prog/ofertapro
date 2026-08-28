-- Liga/desliga o bot sem precisar desconectar o Telegram (mais leve que o
-- fluxo de "Desconectar" existente, que derruba a sessão e exige relogin).
-- ativo=false: o bot continua conectado e responde ofertas manuais já
-- pendentes, mas ignora novas ofertas dos grupos monitorados.
--
-- horario_inicio/horario_fim ('HH:MM', fuso America/Sao_Paulo): janela em
-- que o bot processa novas ofertas. Nulo em qualquer um dos dois = sempre
-- ativo (comportamento atual, sem regressão). Suporta janela que cruza a
-- meia-noite (ex: 22:00 às 06:00).
ALTER TABLE public.bot_configs
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS horario_inicio text,
  ADD COLUMN IF NOT EXISTS horario_fim text;
