# QA Beta Fechado — OfertaPro

Este documento contém o relatório técnico consolidado de auditoria de código, testes de QA de ponta a ponta de novos usuários, e a validação do sistema de telemetria (feedbacks e logs) implementado para a liberação do SaaS OfertaPro para a fase beta fechada.

## 1. Status geral

* **Status:** 🟢 **Pronto para beta fechado**

O sistema passou com sucesso no build final de produção (`tsc -b && vite build`) e nos testes de conformidade. Todas as dependências e o RLS estão íntegros e validados no Supabase.

---

## 2. Fluxos testados

Durante a auditoria rigorosa de QA, simulando a jornada de um novo usuário a partir do zero, os seguintes fluxos foram testados e validados:

1. **Jornada de Autenticação e Onboarding obrigatório**:
   - Criação de conta via e-mail e senha no formulário (`Login.tsx`).
   - Verificação de persistência automática da trigger de criação de profile na tabela `profiles`.
   - Impedimento de bypass de onboarding (usuário não acessa dashboard sem preencher os dados da vitrine pública).
   - Validação de unicidade do slug/username na tabela `profiles`.

2. **Configuração de Perfil e Vitrine (`Settings.tsx`)**:
   - Alteração e upload de foto de conta (privada) e foto de vitrine (pública) para o Supabase Storage.
   - Atualização de biografia, nome de exibição e status de visibilidade (`is_public_active`).
   - Verificação do aviso de "Página Inativa" no acesso público quando `is_public_active = false`.

3. **Canais de Disparo (`Channels.tsx`)**:
   - Conexão e teste real de credenciais do Telegram (Bot Token mascarado) e Discord (URL de Webhook).
   - Confirmação de que o canal de WhatsApp/Evolution API permanece desativado, sem impacto em canais ativos e com aviso "Em breve".

4. **Gerenciamento e Disparo de Ofertas (`Offers.tsx`, `NewOfferModal.tsx`, `dispatch-service.ts`)**:
   - Criação de ofertas completas (com imagem, cupons de desconto, marketplaces definidos).
   - Disparo síncrono e assíncrono para múltiplos destinos ativos (Telegram e Discord).
   - Rastreamento dinâmico de cliques via rota amigável de redirecionamento (`RedirectPage.tsx`) com salvamento resiliente na tabela `clicks`.

5. **Telemetria de Eventos e Feedback de Usuários (`FeedbackService.ts`, `FeedbackButton.tsx`, `Feedbacks.tsx`)**:
   - Envio de feedback beta (Bug, Sugestão, Dúvida, Elogio) com notas de 1 a 5.
   - Registro silencioso e higienizado de logs de eventos essenciais do sistema na tabela `app_events`.

---

## 3. Funcionalidades aprovadas

* **Autenticação**: Login e registro funcionais integrados ao Supabase Auth.
* **Onboarding**: Bloqueio de dashboard e forçamento de onboarding do perfil público aprovado.
* **Canais de Telegram & Discord**: Envio de mensagens de texto e fotos formatadas com markdown v1 aprovados.
* **Redirecionamento & Tracking**: Redirecionamento instantâneo para links de afiliado com salvamento atômico de clique e origem (`telegram` ou `discord`) aprovado.
* **Dashboard & Histórico**: Métricas de cliques totais, melhores marketplaces e canais atualizados atomaticamente e sem mocks.
* **Sistema de Telemetria (Beta)**: Botão flutuante de feedback e gravação resiliente de logs de erros/ações aprovados.
* **Segurança RLS**: Bloqueio de leitura de tokens/webhooks e dados privados de outros usuários aprovado.

---

## 4. Bugs encontrados

Durante a auditoria, identificamos os seguintes pontos de atenção estrutural:
1. **Risco de Vazamento de Credenciais em Frontend**: O envio de mensagens para Telegram Bot API e Discord Webhook é executado no frontend (`telegram.ts` e `sender.ts`). Um usuário técnico avançado que inspecione as requisições de rede no navegador (DevTools) consegue capturar o Bot Token do Telegram ou a URL de Webhook do Discord.
2. **Dependências em Hooks no React**: Lints de dependências ausentes nos hooks de efeito (`useEffect`) nas páginas `Feedbacks.tsx`, `PublicPage.tsx` e `UserContext.tsx`.

---

## 5. Bugs corrigidos

* **Estabilidade do Redirect**: Ajustada a rota `/r/:id` (`RedirectPage.tsx`) para garantir que o redirecionamento aconteça instantaneamente, mesmo se a chamada de inserção do clique falhar na rede.
* **Tratamento de Exceções de Upload**: Injetados blocos de captura de exceções nos fluxos de upload de imagens das ofertas e avatares para registrar logs do tipo `erro_upload_imagem` e `erro_upload_avatar` no banco e evitar travamentos na tela.
* **Tratamento de Disparos Parciais**: Ajustada a lógica do serviço de disparos (`dispatch-service.ts`) para registrar `status = 'partial'` na tabela de histórico se o envio falhar em um canal mas tiver sucesso no outro, mantendo o usuário informado visualmente.

---

## 6. Bugs pendentes

* **Warnings de Lint**: Os 3 warnings de dependências de hooks (`useEffect`) não causam mal funcionamento, mas serão limpos no início do beta fechado.

---

## 7. Riscos antes do beta

> [!WARNING]
> **Vulnerabilidade de Tokens**: Como o MVP executa os disparos direto no frontend, há o risco de usuários mal-intencionados inspecionarem o tráfego de rede e obterem o Token do bot de disparo.
> 
> **Mitigação**: Antes de abrir a aplicação para um público comercial amplo (pós-beta), os scripts `telegram.ts` e `sender.ts` devem ser movidos para uma **Supabase Edge Function** protegida no backend.

---

## 8. Checklist de liberação

- [x] Rodar migrações SQL de banco de dados para feedbacks e eventos.
- [x] Ativar feature flag de feedbacks (`feedback: true`).
- [x] Validar RLS das novas tabelas (`beta_feedback` e `app_events`).
- [x] Testar responsividade do botão flutuante e do modal no celular.
- [x] Garantir que o faturamento e faturamento/billing estejam invisíveis.
- [x] Rodar build de produção com sucesso (`npm run build`).

---

## 9. Recomendação final

A plataforma **OfertaPro** apresenta alto nível de polimento visual, responsividade impecável e resiliência de banco de dados. Com a adição do sistema de feedback e logs (telemetria), estamos plenamente equipados para monitorar os usuários de forma precisa e passiva.

**Recomendação:** **AUTORIZADA** a liberação para o grupo inicial de 10 a 20 usuários beta fechado.
