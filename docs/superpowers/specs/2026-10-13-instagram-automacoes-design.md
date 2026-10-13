# Automações de Instagram (comentário para DM)

Data: 2026-10-13
Status: aguardando revisão
Escopo: subsistema novo, spec guarda-chuva entregue em 6 fases (cada fase ganha o seu plano)
Nome de trabalho: "Instagram Automações" (nome comercial a definir)

## 1. Objetivo

O afiliado conecta o Instagram profissional dele ao Aflyo, escolhe um post (ou Reel, Story, ou
"qualquer post") e define uma palavra-chave. Quando alguém comenta a palavra, o Aflyo responde no
comentário e manda uma DM automática, com texto, botões, link da oferta e, se o afiliado quiser,
um fluxo de várias mensagens com condições. É o equivalente ao "comentou, recebeu" do ManyChat,
sem cobrança à parte: vem na assinatura do Aflyo e respeita o plano.

Critérios de sucesso:

- Do comentário à DM entregue em até 30 segundos em condições normais.
- Nenhuma DM é enviada duas vezes para o mesmo comentário (idempotência garantida pelo banco).
- Conta sem acesso ativo (`has_active_access`) ou sem plano que inclua o recurso não envia nada,
  mesmo que a UI esteja desatualizada.
- Token expirado ou revogado vira estado visível ("reconectar") e e-mail ao afiliado, não falha
  silenciosa.
- Nenhum token da Meta existe no cliente, em coluna legível ou em log.
- O afiliado configura tudo sozinho, sem ler documentação.

Fora de escopo (YAGNI): IA conversacional que responde livre, transmissão em massa (broadcast)
fora da janela permitida pela Meta, WhatsApp/Messenger/TikTok, builder em canvas livre com
arrastar e soltar (a v1 do editor é por lista de passos com ramificações), CRM completo.

## 2. Contexto do repositório (verificado)

- Multi-tenancy por `user_id` + RLS; operações privilegiadas em Edge Functions Deno
  (`supabase/functions`), nunca no browser.
- Acesso por assinatura: `public.has_active_access(uid)` (trial de 7 dias ou `active`) e
  `plan_limits` como fonte única dos limites, com espelho em `src/config/plans.ts` e checagem por
  `npm run check:plan-limits`.
- Padrão de segredo por tenant no Vault: `set_/get_bot_config_api_key`, SECURITY DEFINER,
  executável só por `service_role`, nome `bot_config_api_key:<user_id>`.
- Padrão de bloqueio quando o acesso é revogado: trigger em `bot_configs` com `paused_reason =
  'access_revoked'` e bloqueio de reativação (`bot_configs_block_reactivate`).
- `pg_net` e `pg_cron` já estão em uso (e-mails transacionais, expiração de assinatura).
- Webhooks existentes comparam segredo em tempo constante (`evolution-webhook`, `cakto-webhook`).
- Links curtos com contagem de cliques já existem (`go.aflyo.com.br/o/...`, tabela `clicks`).
- E-mails transacionais via Resend já estão em produção (reuso para "reconectar Instagram").
- Não existe fila (pgmq) no projeto. A fila será tabela com `FOR UPDATE SKIP LOCKED`.
- Existe a spec de alertas operacionais (`2026-10-13-ops-alerts-design.md`, ainda não
  implementada). Esta feature emite eventos para ela quando existir, sem depender dela.

## 3. Premissas da Meta (validar na Fase 0, antes de escrever código)

Estas são as premissas de que o desenho depende. Cada uma deve ser conferida na documentação
vigente da Meta e registrada com a data da conferência. Se alguma cair, a spec é revisada.

| # | Premissa | Impacto se falsa |
|---|---|---|
| M1 | A "Instagram API com Instagram Login" permite conectar conta profissional (Business/Creator) sem exigir Página do Facebook | Cai para Facebook Login e o onboarding fica mais longo |
| M2 | Webhooks de `comments` e `messages` chegam para contas conectadas, assinados com `X-Hub-Signature-256` (HMAC SHA-256 do corpo com o App Secret) | Muda a validação |
| M3 | "Private reply" permite 1 DM por comentário, dentro de uma janela de dias após o comentário | Define o prazo máximo de fila e retentativa |
| M4 | Após o usuário responder à DM, abre-se janela de 24h para mensagens livres; fora dela, só tags permitidas | Define o limite de `wait` e de passos pós-resposta |
| M5 | A API de perfil do contato expõe se o usuário segue a conta (`is_user_follow_business`) | Sem isso, o "pedir pra seguir" vira apenas confiança no botão "Já segui" |
| M6 | Quick replies, botões e templates genéricos são suportados em DM do Instagram | Reduz o editor de mensagens a texto + link |
| M7 | Resposta pública a comentário é permitida via API | Remove a resposta pública (a DM continua) |
| M8 | Tokens de longa duração (~60 dias) são renováveis | Define o job de refresh |
| M9 | Limites de taxa por conta e por app (valores vigentes na documentação) | Calibra o token bucket por conta |
| M10 | Callbacks obrigatórios de exclusão de dados e de desautorização | Endpoints viram requisito de App Review |

Caminho crítico de calendário: o **App Review** da Meta (permissões de comentários e mensagens,
verificação de negócio, política de privacidade, vídeo de demonstração) leva de dias a semanas e
não depende do nosso código. Ele começa na Fase 0 em paralelo e é o que decide a data de
lançamento. Até a aprovação, o app só funciona com contas que têm papel no app (testadores).

## 4. Abordagens consideradas

**A. Tudo no Supabase (recomendada).** Webhook em Edge Function, fila em tabela Postgres, worker
em Edge Function acionado por `pg_net` + `pg_cron`, token no Vault. Reusa auth, RLS, billing e
e-mail. Sem infra nova. Limite: atrasos longos dependem do cron (granularidade de 1 minuto),
aceitável porque as janelas da Meta são de horas.

**B. Worker externo dedicado (Node em Fly/Railway).** Mais controle de throughput e delays
finos, mas é um serviço novo para operar, com deploy, segredos e monitoramento próprios. Só vale
se a A mostrar gargalo medido. A fila em tabela é a mesma, então migrar depois é trocar quem
consome.

**C. Plataforma terceira (ManyChat API, Make).** Descartada: dependência cara, dado do cliente
fora, não resolve "vem na assinatura".

Recomendação: **A**, com a fila desenhada para que o consumidor seja trocável.

## 5. Arquitetura

```
Instagram (Meta)
   | webhook (comments, messages, postbacks)
   v
ig-webhook (Edge Function)  -> valida HMAC, grava em ig_events (dedup), responde 200 rápido
   |  (trigger -> pg_net)        
   v
ig-worker (Edge Function)   <- pg_cron a cada minuto (retentativas, waits, refresh)
   | 1. resolve conta + automações ativas
   | 2. casa gatilho (palavra-chave, escopo)
   | 3. checa acesso + limites + janela + opt-out + idempotência
   | 4. executa o próximo passo do fluxo (reply público, DM, condição, espera)
   v
Graph API da Meta (com token do Vault)
```

### 5.1 Edge Functions

| Função | Papel |
|---|---|
| `ig-oauth-start` | Gera `state` assinado (user_id + nonce, expira em 10 min) e devolve a URL de autorização |
| `ig-oauth-callback` | Troca o code por token, busca perfil, grava `ig_accounts`, guarda token no Vault, assina webhooks da conta |
| `ig-webhook` | GET: verificação com `verify_token`. POST: HMAC, dedup, grava evento, responde 200 |
| `ig-worker` | Consome `ig_events` e `ig_jobs`, executa fluxos, envia, registra |
| `ig-media-list` | Lista posts/Reels/Stories recentes da conta do usuário (autenticada, para o seletor de post) |
| `ig-account-disconnect` | Revoga token, apaga segredo do Vault, pausa automações |
| `ig-token-refresh` | Cron diário: renova tokens que expiram em menos de 10 dias; marca `needs_reconnect` se falhar |
| `ig-data-deletion` / `ig-deauthorize` | Callbacks obrigatórios da Meta (apagam contatos e mensagens do titular, desconectam a conta) |
| `ig-test-send` | "Modo de teste": executa o fluxo para a própria conta do afiliado |

Funções públicas (webhook, callbacks) com `verify_jwt = false` e autenticação própria (HMAC ou
`state` assinado). As demais exigem JWT do usuário e checam `user_id` no servidor.

### 5.2 Fila

`ig_events` é a caixa de entrada bruta (idempotente). `ig_jobs` é a fila de trabalho (passos
agendados, retentativas, esperas). O worker reivindica lotes com:

```sql
update ig_jobs set status = 'running', locked_at = now(), attempts = attempts + 1
where id in (
  select id from ig_jobs
  where status = 'pending' and run_at <= now()
  order by run_at
  limit 20
  for update skip locked
) returning *;
```

Backoff exponencial com teto, e estado terminal `failed` com o código de erro da Meta. Job preso
(`running` há mais de 5 min) volta para `pending` pelo cron.

### 5.3 Limitação de taxa

Token bucket por conta (`ig_rate_state`), calibrado pelos limites da Meta (M9) e por um teto
conservador do Aflyo por hora, com jitter entre envios. Objetivo: nunca disparar uma rajada que
faça a Meta restringir a conta do afiliado. Estourou o bucket: o job volta para `pending` com
`run_at` futuro, sem perder o comentário.

## 6. Modelo de dados

Toda tabela tem `user_id`, RLS ligada e policy explícita (`user_id = auth.uid()`), exceto as de
sistema, que ficam sem policy para `anon`/`authenticated` (só `service_role`).

**`ig_accounts`**: `id`, `user_id`, `ig_user_id` (único), `username`, `account_type`,
`status` (`connected`, `needs_reconnect`, `disconnected`), `scopes text[]`, `token_expires_at`,
`last_webhook_at`, `last_error`, `connected_at`. O token fica no Vault como
`ig_access_token:<ig_accounts.id>`, com acessores `set_/get_ig_access_token` (SECURITY DEFINER,
só `service_role`), no mesmo molde do `bot_config_api_key`. Coluna de token não existe.

**`ig_automations`**: `id`, `user_id`, `ig_account_id`, `name`, `status`
(`draft`, `active`, `paused`), `paused_reason`, `trigger_type`, `target_scope`
(`specific_media`, `any_media`, `next_media`), `media_id`, `match_mode`
(`contains`, `exact`, `any`), `keywords text[]`, `exclude_keywords text[]`, `settings jsonb`
(respostas públicas rotativas, cooldown, janela de horário, uma-vez-por-contato, follow-gate),
`flow jsonb` (grafo versionado, seção 7), `flow_version`, `created_at`, `updated_at`.

**`ig_contacts`**: `id`, `user_id`, `ig_account_id`, `igsid` (único por conta), `username`,
`first_seen_at`, `last_interaction_at`, `window_expires_at`, `opted_out`, `tags text[]`,
`fields jsonb`. Mínimo de dado pessoal: sem foto, sem bio.

**`ig_events`**: `id`, `ig_account_id`, `kind` (`comment`, `message`, `postback`, `story_reply`,
`story_mention`), `external_id` (id do comentário/mensagem, único por conta), `payload jsonb`,
`received_at`, `processed_at`.

**`ig_flow_runs`**: `id`, `automation_id`, `contact_id`, `trigger_ref` (id do comentário),
`status` (`running`, `waiting`, `completed`, `failed`, `expired`), `cursor` (id do nó atual),
`vars jsonb`, `wake_at`, `started_at`, `finished_at`. Único em `(automation_id, trigger_ref)`.

**`ig_jobs`**: `id`, `run_id`, `kind`, `status`, `run_at`, `attempts`, `locked_at`, `last_error`.

**`ig_message_log`**: `id`, `user_id`, `run_id`, `ig_account_id`, `direction`, `kind`
(`public_reply`, `dm`), `status` (`sent`, `failed`, `blocked`), `meta_error_code`, `sent_at`.
Base das métricas. Retenção: 180 dias, depois agregado.

**`ig_usage_monthly`**: `(user_id, period)` único, `dms_sent`, `public_replies_sent`.

**`ig_rate_state`**: `ig_account_id`, `tokens`, `refilled_at`.

Idempotência em três camadas: `ig_events(ig_account_id, external_id)` único,
`ig_flow_runs(automation_id, trigger_ref)` único, e a regra "uma private reply por comentário"
conferida em `ig_message_log` antes do envio.

## 7. Motor de fluxos

O fluxo é um grafo JSON (`nodes`, `edges`) validado por schema no front e no worker. Tipos de nó:

| Nó | Função |
|---|---|
| `message` | Texto, imagem opcional, até N botões ou quick replies. Variáveis: `{{nome}}`, `{{usuario}}` |
| `offer_link` | Escolhe uma oferta do Aflyo e gera o link curto com atribuição `src=ig_automation` e `automation_id` (cliques entram nas métricas existentes) |
| `wait` | Espera X minutos/horas, sempre limitada pela janela de 24h (M4); fora dela o nó falha de forma explícita na validação |
| `condition` | `follows_me`, `has_tag`, `replied_with` (palavra), `within_hours`, `opted_out` |
| `action` | `add_tag`, `remove_tag`, `set_field`, `opt_out`, `notify_owner` (e-mail/push ao afiliado) |
| `end` | Encerra o fluxo |

Regras de execução:

- O primeiro nó executa como private reply (único envio permitido sem interação do usuário).
- Todo nó seguinte só executa depois de uma interação do contato (clique em botão, resposta,
  postback) ou dentro de uma janela aberta.
- Cada execução de nó é um job; falha de um nó não corrompe o run (estado `failed` com causa).
- O editor valida o grafo antes de ativar: sem ciclo sem espera, sem nó órfão, sem `wait` além da
  janela, todo caminho termina em `end`.

Follow-gate (pedir pra seguir): o nó `condition(follows_me)` consulta o perfil do contato (M5). Se
não segue, manda a mensagem "segue a gente e toque em Já segui", com botão que reenvia o
postback; a checagem repete. Se M5 falhar, cai para modo confiança (libera ao tocar no botão).

Gatilhos suportados ao longo das fases: comentário com palavra-chave em post/Reel (F1), vários
gatilhos por post e escopos "qualquer post" e "próximo post" (F2), resposta a Story, menção em
Story e palavra-chave em DM direta (F3), ice breakers e menu persistente (F3).

## 8. Acesso, planos e limites

Novas colunas em `plan_limits`, com espelho em `src/config/plans.ts` e checagem em
`scripts/check-plan-limits.mjs` (regra do repositório: banco + espelho + check, nunca só o front):

| Coluna | Significado |
|---|---|
| `allow_instagram` | O plano inclui o módulo |
| `max_ig_accounts` | Contas de Instagram conectadas |
| `max_ig_automations` | Automações ativas |
| `max_ig_dms_month` | DMs automáticas por mês |

Proposta inicial (a validar por você, é decisão de negócio):

| Plano | allow | contas | automações ativas | DMs/mês |
|---|---|---|---|---|
| free | não | 0 | 0 | 0 |
| starter | sim | 1 | 3 | 1.000 |
| pro | sim | 2 | 15 | 10.000 |
| enterprise (Business) | sim | 5 | ilimitado | 50.000 |

Aplicação em dois pontos: ao salvar/ativar (erro amigável com CTA de upgrade) e **no worker, no
momento do envio** (`has_active_access` + limites + uso mensal). Quando o acesso é revogado
(reembolso, cancelamento, expiração), trigger pausa as automações com
`paused_reason = 'access_revoked'` e bloqueia a reativação, no molde de `bot_configs`.

## 9. Frontend

Segue as convenções do repo: `src/pages`, `src/components/instagram`, hooks `use*`, services para
CRUD Supabase (RLS), operações privilegiadas via `supabase.functions.invoke`. Tema claro/escuro e
tokens existentes; sem travessão na copy.

| Rota | Conteúdo |
|---|---|
| `/instagram` | Visão geral: conta conectada, saúde (webhook ok, token válido), métricas do período, atalhos |
| `/instagram/conectar` | Passo a passo de conexão e do que ajustar na conta (profissional, mensagens permitidas) |
| `/instagram/automacoes` | Lista com status, gatilho, DMs enviadas, ativar/pausar |
| `/instagram/automacoes/:id` | Editor: 1) gatilho e post, 2) palavras-chave, 3) fluxo por passos, 4) configurações, 5) testar |
| `/instagram/contatos` | Contatos, tags, opt-out, exportação CSV |
| `/instagram/analytics` | Funil: comentários, DMs, aberturas, cliques, conversão por automação (respeita `advancedAnalytics`) |

Pontos de UX que importam: seletor visual de post (miniaturas via `ig-media-list`), pré-visualização
da DM como no celular, botão "Testar na minha conta", aviso claro quando a janela da Meta limita o
fluxo, estado vazio com modelo pronto ("Enviar link da oferta por comentário").

## 10. Segurança e conformidade

- HMAC `X-Hub-Signature-256` sobre o corpo cru, comparação em tempo constante, rejeição sem
  detalhar o motivo.
- `state` do OAuth assinado, com expiração e uso único (anti-CSRF e anti-troca de conta).
- Token só no Vault, acessor restrito a `service_role`, nunca logado; logs com `ig_account_id`,
  não com token nem texto de mensagem.
- RLS em todas as tabelas de tenant; tabelas de sistema sem policy para `anon`/`authenticated`.
- Entrada de webhook não confiável: payload validado por schema, tamanho limitado, nenhum campo
  interpolado em SQL ou em URL sem codificação.
- Cooldown e "uma vez por contato" por padrão para evitar abuso e spam; opt-out por palavra
  ("sair", "parar") sempre honrado, em qualquer fluxo.
- LGPD: o afiliado é o controlador do dado dos comentaristas, o Aflyo é operador. Coleta mínima,
  retenção definida, endpoint de exclusão (M10), política de privacidade e termos atualizados,
  texto de consentimento no aviso da conexão.
- Conformidade com as políticas da Meta: só enviar em resposta a uma ação explícita do usuário,
  sem conteúdo proibido, sem promessa enganosa. Termos do Aflyo proíbem uso fora disso.

## 11. Observabilidade e falhas

| Falha | Comportamento |
|---|---|
| Token expirado/revogado | `needs_reconnect`, automações pausadas com motivo, e-mail Resend, banner no painel |
| Erro de rate limit da Meta | Job volta para `pending` com backoff, sem perda |
| Comentário apagado ou usuário bloqueado | Run `failed` com causa; não retenta |
| Janela expirada | Run `expired`, registrado; nenhum envio |
| Webhook duplicado ou fora de ordem | Dedup por `external_id`; nó reexecutado é no-op |
| Worker caiu no meio | Job `running` preso volta para `pending` pelo cron; idempotência impede reenvio |
| Conta sem acesso | Evento descartado com `blocked`, contado nas métricas |

Métricas internas: taxa de erro por código da Meta, latência comentário-para-DM, fila pendente,
contas em `needs_reconnect`. Painel admin (leitura, no padrão dos SPs existentes) e eventos para a
central de alertas operacionais quando ela existir. Sem permissão nova no RBAC: reuso do grupo de
integrações/monitoramento.

## 12. Testes

- **Unidade (Deno):** casamento de palavra-chave (acento, caixa, `contains`/`exact`/exclusões),
  validação de HMAC, validador de grafo, interpolação de variáveis, token bucket.
- **Integração:** webhook falso assinado, worker com Graph API simulada (sucesso, 429, token
  inválido, comentário apagado), duplicidade e ordem trocada.
- **SQL manual** em `supabase/tests/manual`: RLS por tabela (um tenant nunca lê outro), gate de
  acesso, trigger de pausa, idempotência.
- **Front (vitest):** editor de fluxo (validação), hooks de status, estados de plano bloqueado.
- **Contrato:** `scripts/check-ig-contract.mjs` (no estilo `check-onboarding-contract.mjs`) para
  garantir espelho de limites, nomes de colunas e que nenhum segredo vaza para `VITE_*`.
- **Ponta a ponta na Meta:** conta de teste com papel no app, antes e depois do App Review.

## 13. Fases (cada uma vira um plano e uma entrega em produção)

| Fase | Entrega | Saída verificável |
|---|---|---|
| **F0 Fundação e Meta** | App da Meta, verificação de negócio, política de privacidade/termos, domínio, **submissão do App Review**, validação das premissas M1-M10, spike de webhook com conta de teste | Premissas conferidas e documentadas; review submetido |
| **F1 Mínimo** | Migrations + Vault, OAuth, webhook, worker, 1 gatilho de comentário por post com palavra-chave, resposta pública + 1 DM com link, gating por plano, log e saúde da conta | Comentou na conta de teste, recebeu DM, sem duplicar, bloqueado sem acesso |
| **F2 Fluxos** | Editor por passos, botões/quick replies, follow-gate, `wait`, condições, link de oferta com atribuição, múltiplos gatilhos, escopos "qualquer"/"próximo" | Fluxo de 3 passos com condição rodando ponta a ponta |
| **F3 Canais extras** | Resposta e menção em Story, palavra-chave em DM, ice breakers, menu persistente, tags e opt-out | Cada gatilho novo coberto por teste e por conta de teste |
| **F4 Dados** | Contatos, analytics por automação, CSV, painel admin, alertas operacionais | Métricas batem com `ig_message_log` e `clicks` |
| **F5 Endurecimento e GA** | Teste de carga, calibragem de taxa, runbook, beta fechado com afiliados reais, documentação, lançamento | Beta sem incidentes P1 por 2 semanas |

Observação de sequência: F1 só pode ir a produção para clientes depois da aprovação da Meta. Até
lá roda em modo restrito (contas com papel no app), o que já permite validar F1 a F3 com
afiliados convidados como testadores.

## 14. Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| App Review atrasar ou ser reprovado | Média | Começar na F0, vídeo e textos caprichados, escopos mínimos pedidos |
| Mudança de política/API da Meta | Média | Camada fina `_shared/instagram/graph.ts`, versão da API fixada, premissas documentadas |
| Meta restringir contas por volume | Média | Bucket conservador, jitter, uma vez por contato, opt-out, orientar o afiliado |
| Custo/volume de Edge Functions | Baixa | Worker em lote, dedup cedo, caminho aberto para a abordagem B |
| Janela de 24h frustrar fluxos longos | Alta | Validador do editor impede e explica; desenho em cima de interações do usuário |
| Dado pessoal de terceiros (LGPD) | Média | Coleta mínima, retenção curta, exclusão por callback, termos claros |

## 15. Decisões pendentes (suas)

1. Nome comercial do módulo e onde aparece no menu.
2. Limites por plano da seção 8 (valores são proposta).
3. Instagram Login (recomendado, sem Página do Facebook) como padrão, conforme M1.
4. Se o trial de 7 dias inclui o módulo (proposta: sim, no limite do Starter).
5. Quem assume a verificação de negócio da Meta (precisa de CNPJ/documentos da empresa dona do app).

## 16. Próximo passo

Revisão desta spec. Aprovada, o passo seguinte é o plano de implementação da **Fase 0 + Fase 1**
(escrito com a skill de planos), porque as demais dependem do que a F0 confirmar sobre a Meta.
