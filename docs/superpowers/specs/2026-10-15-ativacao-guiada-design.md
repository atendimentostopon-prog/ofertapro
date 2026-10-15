# Ativação guiada (trial para bot funcionando)

Data: 2026-10-15. Status: Fase 1 implementada (aguardando migration `20261015000000_history_origin.sql` em ambiente dedicado e QA com conta real). Fases 2 e 3 pendentes.

## Contexto

Aflyo tem 15 cadastros em trial de 7 dias e zero venda. Não há visibilidade de onde cada usuário parou. O onboarding v2 (branch `feat/onboarding-v2-integration`, não commitado) bloqueia o app até concluir 4 etapas validadas no servidor, mas:

- as etapas 1 (sessão pessoal Telegram) e 3 (leitura do canal de origem) retornam `unavailable` neste repositório, pois dependem de endpoint do worker ainda não implantado;
- não há tutorial dentro das etapas (só um link para `my.telegram.org` em `BotTab.tsx`);
- o fluxo termina no disparo de teste, não no bot enviando a primeira oferta sozinho;
- o checklist do Dashboard (5 passos manuais da era "ofertas manuais") fica oculto até o wizard terminar e não guia ninguém.

## Objetivo e sucesso

Levar o usuário do cadastro até "o bot enviou a primeira oferta sozinho" antes do fim do trial, com instrução passo a passo em cada etapa.

Métricas: % de trials que chegam ao marco final; conversão trial para pago; etapa em que cada usuário parou.

## Decisões já tomadas

- **Modo guiado, não bloqueante.** O usuário navega livremente. O progresso fica sempre visível e sempre aponta a próxima ação.
- **Continuar o que existe** (onboarding v2, `onboarding_progress`, stepper, validações). Nada é reescrito do zero.

## Desenho

### 1. Marcos derivados de dados reais

Lista ordenada de marcos de ativação, calculada no cliente a partir de dados que já existem, sem depender de validação do worker:

| # | Marco | Sinal real |
|---|-------|-----------|
| 1 | Telegram conectado | `bot_configs` com api_id/api_hash e sessão/status conectado |
| 2 | Marketplaces configurados | tags Amazon/ML (e Shopee conforme modo) salvas |
| 3 | Canal de origem escolhido | origem definida em `bot_configs` |
| 4 | Destino conectado | `channels` com status `connected`/`active` |
| 5 | Teste de disparo OK | tentativa `succeeded` na etapa 4 de `onboarding_validation_attempts` ou `history` com sucesso |
| 6 | Primeira oferta automática | `history` de envio feito pelo bot (ver pendência abaixo) |

`onboarding_progress` continua existindo como camada de evidência. O guard de rotas (`OnboardingSetupShell`) e o modal bloqueante (`OnboardingWizardModal`) deixam de forçar navegação e viram o painel guiado.

### 2. Painel de ativação (substitui o checklist do Dashboard)

- Mesmo slot da imagem de referência (`OnboardingChecklist` em `Dashboard.tsx`), com lista de 6 marcos e card "Próxima melhor ação".
- Botão da próxima ação abre a tela certa já com o tutorial da etapa aberto.
- Faixa compacta persistente no topo do app enquanto houver marco pendente (dispensável por sessão), com dias restantes de trial.
- Estado final: card de parabéns e link para ver o bot em ação.

### 3. Tutoriais por etapa

Componente `StepGuide` (drawer lateral) com passos numerados, texto em pt-BR, link externo quando necessário e checagem "já fiz".

Conteúdo mínimo:
1. Obter api_id e api_hash em `my.telegram.org`.
2. Conectar a conta pessoal do Telegram (código/OTP).
3. Criar bot no BotFather e conectar.
4. Escolher o canal do Telegram a monitorar.
5. Conectar WhatsApp e escolher o grupo de disparo.
6. Configurar tags de afiliado dos marketplaces.
7. Ligar o bot e aguardar a primeira oferta automática.

Conteúdo em `src/config/activationGuides.ts` (dados, não JSX), para editar sem mexer em componente.

### 4. Funil de ativação (visão do admin)

- Registro do momento em que cada marco foi atingido (tabela `activation_events`, RLS por `user_id`, escrita só por função SECURITY DEFINER ou Edge Function).
- Consulta no painel admin: contagem por marco, lista de usuários parados e há quantos dias.
- Somente leitura no admin, sem permissão nova se o grupo existente de usuários cobrir.

### 5. Lembretes por e-mail (fase 2)

Via Resend e Edge Function agendada: D1, D3, D5 e último dia, citando a etapa em que a pessoa parou. Respeita opt-out. Sem travessão na copy.

## Fases

- **Fase 1**: marcos derivados, painel no Dashboard, faixa persistente, `StepGuide` com conteúdo, remoção do bloqueio.
- **Fase 2**: `activation_events` + visão no admin.
- **Fase 3**: e-mails de lembrete.

Cada fase é entregável e testável sozinha.

## Fora de escopo

- Implantar o worker do bot e o componente trusted de WhatsApp (pendências do relatório de 2026-10-01).
- Mudar preços, limites ou fluxo Cakto.
- Reativar plano anual.

## Riscos e pendências a confirmar na implementação

1. **Como distinguir disparo automático do bot em `history`.** Se não houver coluna, é preciso uma (migration) ou outro sinal.
2. **Sinal de "sessão Telegram conectada"** sem endpoint do worker: confirmar qual campo/status de `bot_configs` é confiável.
3. **Mudança de produto no v2**: usuários que hoje seriam bloqueados passam a navegar livremente; a regra de que `onboarded` libera o app deve ser revista em `Layout.tsx`.
4. Migrations não vão direto para produção (regra do projeto); aplicar primeiro em branch/ambiente dedicado.
5. Working tree atual tem mudanças não commitadas do v2 e de outras frentes (admin, bot-proxy, migrations). Fase 1 deve começar de um commit limpo dessas mudanças ou em worktree separado.

## Testes

- Unitários dos marcos (função pura entrada: dados do usuário, saída: lista de marcos e próxima ação), no estilo de `onboardingProgress.ts`.
- Teste de contrato migration/serviço, como já existe em `scripts/check-onboarding-contract.mjs`.
- RLS de `activation_events` validada com dois usuários.
- Lint, `npx tsc -b` e `npm run build` antes de entregar. Nota: `main` tinha build quebrado por TS2339 em `TemplatesTab.tsx` (anterior a esta frente).
