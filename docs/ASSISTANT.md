# Assistente Lyo

Assistente dentro do app logado. Responde dúvidas sobre o Aflyo e sobre a conta do usuário usando o Google Gemini.

## Peças

- Edge Function `supabase/functions/assistant-chat` (`index.ts` handler, `core.ts` lógica pura, `knowledge.ts` base de conhecimento). Envolvida em `withAlerts`, então erros 5xx (inclusive Gemini fora do ar) chegam na central de alertas.
- Tabela `public.assistant_messages` (RLS: usuário lê e apaga as próprias; só a função insere).
- Tabela `public.assistant_usage (user_id, day, count)` com a cota do dia (fuso America/Sao_Paulo). Separada das mensagens para "Limpar conversa" não zerar a cota. Sem acesso do usuário; a função usa as RPCs `assistant_reserve_quota` (reserva atômica antes do Gemini) e `assistant_release_quota` (devolve quando o Gemini falha), só `service_role`.
- Coluna `public.plan_limits.assistant_daily_messages` (free 10, starter 50, pro 150, enterprise 400), espelho em `src/config/plans.ts`.
- Job `pg_cron` `assistant_messages_retention` (04:15 UTC, apaga mensagens e registros de cota com mais de 90 dias).
- Front: `src/components/assistant/AssistantWidget.tsx`, `src/hooks/useAssistant.ts`, `src/services/AssistantService.ts`. O widget ocupa o canto inferior direito; o atalho do grupo de WhatsApp fica só na sidebar (`CommunityCallout`).

## Secrets e env da função

- `GEMINI_API_KEY` (obrigatório). Usar chave de projeto Google com faturamento ativado: no tier gratuito o Google pode usar os prompts para melhorar modelos.
- `GEMINI_MODEL` (opcional, padrão `gemini-3.5-flash-lite`).

## Rollout (nesta ordem)

1. Aplicar `supabase/migrations/20261021000000_assistant_lyo.sql` num ambiente não produtivo e rodar `supabase/tests/manual/20261021000000_assistant_lyo.test.sql` (precisa imprimir `PASS assistant_lyo`).
2. Aplicar a mesma migration em produção (SQL Editor, pelo dono do projeto).
3. `supabase secrets set GEMINI_API_KEY=...` no projeto.
4. `supabase functions deploy assistant-chat`.
5. Mergear o front. O front antes da função faz o widget abrir e falhar.

## Mudar a cota

Atualizar `plan_limits` com uma migration nova de `UPDATE`, ajustar `assistantDailyMessages` em `src/config/plans.ts` e o `CASE` lido por `scripts/check-plan-limits.mjs`, e rodar `npm run check:plan-limits`. A tela de Limites do painel admin ainda não edita esta coluna.

## Atualizar o que o Lyo sabe

Editar `supabase/functions/assistant-chat/knowledge.ts` e fazer deploy da função. Sem travessão no texto. O módulo de Instagram ainda não está na base (está atrás de `VITE_FEATURE_INSTAGRAM`).

## Custo

Cerca de 15 a 20 mil tokens de entrada e 500 de saída por pergunta. Com `gemini-3.5-flash-lite` (US$ 0,30/1M entrada, US$ 2,50/1M saída), perto de US$ 0,007 por pergunta. Tokens gravados em `assistant_messages.tokens_in/tokens_out` para auditoria.

## Desligar

Remover `<AssistantWidget />` de `src/components/Layout.tsx`, ou zerar `assistant_daily_messages` em todos os planos (o widget passa a mostrar cota esgotada).
