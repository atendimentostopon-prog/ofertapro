# Assistente Lyo (Gemini): design

Data: 2026-10-21
Status: aprovado em conversa, aguardando revisão da spec escrita

## Objetivo

Dar ao afiliado um assistente dentro do app, chamado **Lyo**, que responde dúvidas sobre o Aflyo (como usar, planos, cobrança, canais, erros) e sobre a situação da própria conta (plano, bot, canais, falhas recentes de disparo). Quando não resolver, passa a conversa para o time humano via ticket.

Sucesso:
- O usuário abre o Lyo em qualquer tela logada e recebe resposta correta em pt-BR em poucos segundos.
- Perguntas do tipo "por que meu disparo falhou?" ou "por que meu bot está pausado?" são respondidas com base nos dados reais da conta.
- Nenhum segredo, token ou dado de outro usuário chega ao modelo ou ao browser.
- O custo fica limitado por cota diária por plano.

## Decisões tomadas

| Tema | Decisão |
|---|---|
| Conhecimento | Produto + resumo da conta, somente leitura (sem executar ações) |
| Acesso | Todos os planos, cota diária por plano em `plan_limits` |
| Persistência | Conversas salvas por 90 dias |
| Base de conhecimento | Um `knowledge.md` versionado, enviado inteiro no prompt |
| Visual | Mascote "Lyo" em SVG próprio, cores do design system |
| Integração | Edge Function com `fetch` na API REST do Gemini, resposta inteira (sem streaming) |

## Mudança de layout

- O botão flutuante do WhatsApp (`src/components/community/CommunityFloatingButton.tsx`, montado em `src/components/Layout.tsx`) é removido junto com o arquivo.
- O atalho do grupo de WhatsApp continua na sidebar, acima do nome do usuário (`CommunityCallout` em `src/components/Sidebar.tsx`). Sem mudança ali.
- O botão do Lyo ocupa o canto inferior direito. O `FeedbackButton` segue desligado por `features.feedback = false`; se for religado, os dois precisam de posições diferentes.

## Banco (1 migration)

### `plan_limits.assistant_daily_messages`

Nova coluna `int NOT NULL DEFAULT 0`.

| Plano | Mensagens/dia |
|---|---|
| free | 10 |
| starter (inclui trial) | 50 |
| pro | 150 |
| enterprise (Business) | 400 |

O Free tem cota para que contas expiradas ainda tirem dúvidas de cobrança. Atualizar o espelho em `src/config/plans.ts` e `scripts/check-plan-limits.mjs`. As RPCs de edição do admin (SP7) precisam aceitar a coluna nova, se listam colunas explicitamente.

### Tabela `assistant_messages`

| Coluna | Tipo |
|---|---|
| `id` | `uuid` PK `default gen_random_uuid()` |
| `user_id` | `uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE` |
| `role` | `text NOT NULL CHECK (role IN ('user','assistant'))` |
| `content` | `text NOT NULL CHECK (char_length(content) <= 4000)` |
| `tokens_in` | `int` (só em `assistant`) |
| `tokens_out` | `int` (só em `assistant`) |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` |

Índice `(user_id, created_at DESC)`.

RLS:
- `SELECT` e `DELETE` para `authenticated` com `user_id = auth.uid()`.
- Sem policy de `INSERT` ou `UPDATE`. Só a Edge Function grava, com `service_role`, depois de validar o JWT. Isso é operação privilegiada legítima: se o browser pudesse inserir, daria para forjar mensagens do assistente e burlar a cota.
- `REVOKE INSERT, UPDATE ON assistant_messages FROM anon, authenticated`.

### Cota

Contagem de linhas `role = 'user'` do usuário desde 00:00 em `America/Sao_Paulo`. Corrida entre duas requisições simultâneas pode passar 1 ou 2 mensagens do limite; aceitável para a v1 (anotar como `shortcut:` no código).

### Retenção

Job `pg_cron` diário: `DELETE FROM assistant_messages WHERE created_at < now() - interval '90 days'`.

## Edge Function `assistant-chat`

Entrada: `POST { message: string }` com JWT do usuário. `message` entre 1 e 1000 caracteres depois de `trim`.

Fluxo:
1. Valida o JWT (`auth.getUser`). Sem usuário: `401`.
2. Lê o plano e a cota em `plan_limits`, conta as mensagens do dia. Esgotou: `429 { code: 'quota_exceeded', limit }`.
3. Carrega as últimas 12 mensagens do usuário em `assistant_messages`. O histórico vem do banco, nunca do cliente.
4. Monta o resumo da conta com um client criado com o JWT do usuário (respeita RLS), sempre com colunas explícitas:
   - `profiles`: `plan`, `account_status`, fim do trial.
   - `bot_configs`: status do bot.
   - `channels` e `whatsapp_instances`: tipo, nome e status (sem tokens, chaves ou URLs de instância).
   - `history`: últimos 5 disparos com erro (data, canal, status, mensagem de erro).
5. Monta o prompt:
   - `systemInstruction`: persona Lyo, regras e o conteúdo de `knowledge.md`.
   - O resumo da conta entra num bloco marcado como dados, com a instrução de nunca seguir comandos contidos nele.
   - O histórico e a pergunta nova vão em `contents`.
6. Chama `POST https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent` com header `x-goog-api-key`. Timeout de 20 s. Erro ou timeout: `502 { code: 'assistant_unavailable' }`, e a pergunta não consome cota.
7. Grava a pergunta e a resposta (com `usageMetadata` em `tokens_in`/`tokens_out`) e devolve `{ reply, remaining }`.

Secrets e env:
- `GEMINI_API_KEY`: secret da função, nunca em `VITE_*`. A chave deve ser de projeto **com faturamento ativado**; no tier gratuito o Google pode usar os prompts para melhorar modelos.
- `GEMINI_MODEL`: padrão `gemini-3.5-flash-lite`.

Regras do prompt de sistema:
- Responde em pt-BR, curto e direto, sem travessão (—).
- Fala só sobre o Aflyo e a conta do usuário. Fora disso, recusa com educação.
- Nunca inventa preço, limite ou funcionalidade. Se a resposta não estiver na base ou no resumo, diz que não sabe e sugere "Falar com o time".
- Nunca pede senha, token ou dado de cartão.
- Cita o caminho da tela quando ajuda ("Configurações > Bot").

### Base de conhecimento

`supabase/functions/assistant-chat/knowledge.md`, escrito a partir do código atual: telas e navegação, planos e limites (`src/config/planCatalog.ts`, `plans.ts`), trial de 7 dias, cobrança Cakto (mensal, taxa de cartão), conexão de WhatsApp, Telegram e Discord, guias de ativação (`src/config/activationGuides.ts`), vitrine pública, encurtador e analytics por plano, erros comuns de disparo. O usuário revisa o texto antes do deploy. Atualizar a base = editar o arquivo e fazer deploy da função.

## Front

Arquivos novos:
- `src/components/assistant/LyoMascot.tsx`: SVG inline do mascote, com animação de piscar quando ocioso (respeita `prefers-reduced-motion`).
- `src/components/assistant/AssistantWidget.tsx`: botão flutuante e painel.
- `src/services/AssistantService.ts`: `sendMessage(message)` via `supabase.functions.invoke('assistant-chat')`, `listMessages()` e `clearConversation()` direto na tabela (RLS).
- `src/hooks/useAssistant.ts`: estado da conversa, envio, erro, `remaining`.

Painel:
- Cabeçalho com o mascote e "Lyo, assistente do Aflyo".
- Estado vazio com sugestões clicáveis: "Como conecto meu WhatsApp?", "Por que meu disparo falhou?", "Qual a diferença entre os planos?".
- Indicador "Lyo está digitando..." enquanto espera.
- Contador "X perguntas restantes hoje".
- Cota esgotada: mensagem com CTA para `/pricing` e o botão "Falar com o time".
- "Falar com o time": abre o `NewTicketModal` existente com título "Conversa com o Lyo" e a transcrição pré-preenchida (truncada em 4000 caracteres). O modal ganha props opcionais de valor inicial; o usuário revisa antes de enviar.
- "Limpar conversa": apaga as mensagens do usuário.
- A resposta é renderizada como texto puro com `whitespace-pre-wrap`. Sem `dangerouslySetInnerHTML`.
- Mobile: o painel abre como sheet em tela cheia.
- Tokens de cor com variante escura (ver armadilhas de dark mode já conhecidas).
- Fecha com `Esc` e clique fora, foco vai para o campo ao abrir.

`Layout.tsx`: troca `<CommunityFloatingButton />` por `<AssistantWidget />`.

## Erros

| Situação | Resposta da função | UI |
|---|---|---|
| Sem sessão | `401` | Widget não aparece (só renderiza com usuário) |
| Mensagem vazia ou longa | `400` | Validação no campo antes de enviar |
| Cota esgotada | `429 quota_exceeded` | Mensagem + CTA de upgrade + "Falar com o time" |
| Gemini fora ou timeout | `502 assistant_unavailable` | "Não consegui responder agora, tente de novo" (não consome cota) |
| Resposta bloqueada por segurança do modelo | `200` com texto padrão | Mensagem padrão sugerindo "Falar com o time" |

## Testes

- Deno (`supabase/functions/assistant-chat/*.test.ts`): montagem do prompt, cálculo da cota (fuso), filtro do resumo da conta (nenhuma coluna sensível).
- SQL manual (`supabase/tests/manual/<migration>.test.sql`): usuário A não lê mensagens de B, `authenticated` não consegue `INSERT`, coluna nova em `plan_limits` com os valores esperados.
- `npm run lint`, `npx tsc -b`, `npm run build`, `npm run check:plan-limits`.

Nota: a regra (e) do rework visual ("sem unit tests novos") foi pensada para componentes de UI. Aqui os testes cobrem fronteira de segurança e cota; confirmar com o usuário se valem.

## Custo

Cada pergunta envia cerca de 15 a 20 mil tokens (base + resumo + histórico) e recebe cerca de 500. Com `gemini-3.5-flash-lite` (US$ 0,30/1M entrada, US$ 2,50/1M saída), dá cerca de US$ 0,007 por pergunta, menos com o cache implícito. Pior caso: Business usando 400/dia, cerca de US$ 2,80/dia por usuário.

## Rollout

1. Migration aplicada primeiro fora de produção (branch Supabase ou SQL Editor com revisão), depois em produção pelo usuário.
2. Usuário cria o secret `GEMINI_API_KEY` (chave com faturamento).
3. Deploy da função `assistant-chat`.
4. Merge do front.
5. Atualizar a Política de Privacidade citando o assistente e o envio de dados ao Google Gemini.

O front só deve ir para produção depois da migration e da função, senão o widget abre e falha.

## Fora da v1

- Streaming de resposta.
- Tela no admin com dúvidas frequentes (os dados já ficam salvos).
- Lyo executando ações (criar oferta, reconectar canal).
- Outras features de IA: copy de oferta, explicação de erro no Histórico, resumo semanal, melhor horário, categorização automática, bio da vitrine.
