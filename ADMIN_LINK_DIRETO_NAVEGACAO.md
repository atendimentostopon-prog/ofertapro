# Relatório Técnico — Painel Admin, Link de Afiliado Direto nos Canais e Roteamento SPA

Este relatório consolida todas as modificações arquiteturais, melhorias de UX e de segurança realizadas no SaaS **Link Oferta**.

---

## 1. Objetivo do Projeto e Descrição Geral

O projeto teve três objetivos fundamentais:
1. **Criar um Painel de Administrador (`/admin`)** seguro e responsivo para monitorar métricas do SaaS de forma global.
2. **Implementar o envio de Link de Afiliado Direto nos Canais** Telegram e Discord, contornando o redirecionador da Vercel quando a flag de feature toggle estiver habilitada.
3. **Corrigir a navegação SPA**, removendo o loading e remontagem global de componentes ao trocar de página no painel de controle do usuário.

---

## 2. Envio de Mensagens no Telegram com Link de Afiliado Direto

As mensagens disparadas para canais e grupos do Telegram foram adaptadas para usar diretamente o link de afiliado (`offer.affiliate_link`) cadastrado pelo usuário. 
- **Onde foi modificado**: No arquivo `src/lib/telegram.ts` através da função `sendTelegramOffer`.
- **Comportamento**: Quando a feature de link direto está ativa, a mensagem é montada com o link bruto de afiliado, sem o envoltório do link curto `linkoferta.vercel.app/o/...`.
- **Formatação**:
  ```text
  🔥 OFERTA ENCONTRADA

  [Nome do Produto]

  De: R$ XX,XX (se houver original)
  Por: R$ YY,YY
  Cupom: [CUPOM] (se houver)

  Comprar agora:
  [https://link-de-afiliado-direto.com/...]
  ```

---

## 3. Envio de Mensagens no Discord com Link de Afiliado Direto

O envio de ofertas no Discord através de Webhooks agora vincula o link de afiliado direto no título clicável e na URL do embed.
- **Onde foi modificado**: No método `sender.sendToDiscord` dentro de `src/lib/sender.ts`.
- **Comportamento**: A propriedade `url` do embed do Discord recebe o link de afiliado bruto (`offer.affiliateLink`) caso a feature toggle correspondente esteja ativa.
- **Visualização**: O botão/título da oferta no Discord redireciona o comprador diretamente para o link de afiliado da loja, preservando a experiência de clique limpa.

---

## 4. Configuração do Feature Toggle (`useDirectAffiliateLinkInChannels`)

Para dar flexibilidade à plataforma, o uso do link de afiliado direto nos canais foi centralizado sob uma flag de controle no arquivo de configuração do sistema.
- **Arquivo**: `src/config/features.ts`
- **Flag**: `useDirectAffiliateLinkInChannels: true`
- **Utilidade**: Caso no futuro seja necessário voltar a utilizar o redirecionamento interno por questões de auditoria ou analytics adicionais, basta mudar essa flag para `false` e recompilar o frontend.

---

## 5. Pré-visualizações de Nova Oferta (Modal e Página)

A experiência do usuário (UX) foi ajustada para refletir dinamicamente se o link direto está ou não ativado no preview de mensagem em tempo real.
- **Onde foi modificado**:
  - `src/components/modals/NewOfferModal.tsx` (Preview no modal de criação rápida)
  - `src/pages/NewOfferPage.tsx` (Preview na tela cheia de criação)
- **Comportamento**: O mockup simula a mensagem real que o usuário receberá nos canais. Se `useDirectAffiliateLinkInChannels` estiver ativado, o preview substitui a URL do link encurtado (`linkoferta.vercel.app/...`) pelo link de afiliado real digitado no formulário em tempo de digitação, acompanhado de uma nota informativa discreta.

---

## 6. Funcionamento Interno de Links Curtos

A geração de links curtos (`shortCode` e `/o/{code}`) e redirecionamentos no banco de dados não foi descontinuada:
- A plataforma continua gerando os registros de redirecionamento normalmente.
- As páginas públicas da vitrine de ofertas do usuário e o redirecionamento `/r/{id}` continuam funcionando perfeitamente.
- O analytics de cliques na página pública permanece íntegro, alterando apenas a origem direta nos disparos de canais para garantir cliques rápidos e limpos.

---

## 7. Ajuste de Roteamento SPA (Nested Routes)

O problema do carregamento global a cada navegação foi solucionado reorganizando a estrutura de roteamento do React Router.
- **Causa Raiz**: O arquivo `App.tsx` continha rotas individuais onde cada uma instanciada renderizava o `<ProtectedRoute>` isoladamente. Isso fazia com que o `<Layout>` (que contém a `Sidebar` e `TopBar`) fosse inteiramente desmontado e remontado a cada transição de rota, provocando cintilações na tela e carregamentos visuais.
- **Solução**: Implementação de rotas aninhadas (**Nested Routes**). O `App.tsx` foi reestruturado de modo que as rotas protegidas fiquem sob um único nó ancestral no React Router:
  ```tsx
  <Route element={<ProtectedRoute isLoggedIn={isLoggedIn} onLogout={handleLogout} />}>
    <Route path="/dashboard" element={<Dashboard />} />
    <Route path="/offers" element={<Offers />} />
    <Route path="/offers/new" element={<NewOfferPage />} />
    <Route path="/channels" element={<Channels />} />
    <Route path="/history" element={<History />} />
    <Route path="/settings" element={<Settings />} />
    <Route path="/feedbacks" element={<Feedbacks />} />
    <Route path="/admin" element={<AdminDashboard />} />
  </Route>
  ```
- **Papel do `ProtectedRoute.tsx`**: Agora atua como um wrapper layout container persistente, retornando o `<Layout><Outlet /></Layout>`. Com isso, a barra lateral e a navegação nunca são desmontadas, e a troca de páginas ocorre de maneira instantânea e fluida.

---

## 8. Correção no Fluxo de Loading do `UserContext`

Evitamos disparos desnecessários do estado de loading do usuário em background.
- **Onde foi modificado**: `src/context/UserContext.tsx`.
- **Implementação**: Adicionada uma referência persistente (`hasLoadedRef = useRef(false)`) e verificações que impedem o `loading` global de mudar para `true` se já houver um perfil de usuário carregado em memória. Desse modo, atualizações reativas do Supabase Auth (`onAuthStateChange` e `refreshProfile`) não travam mais a tela do usuário.

---

## 9. Criação do Painel de Administração (`/admin`)

O painel administrativo foi concebido para centralizar o controle operacional do SaaS.
- **Rota**: `/admin`
- **Estrutura**: Dividido em abas dinâmicas e responsivas:
  - **Visão Geral**: Painel de métricas e listas rápidas de últimos cadastros e erros.
  - **Usuários**: Tabela geral de criadores com contagem de canais e ofertas.
  - **Ofertas**: Histórico global de ofertas publicadas.
  - **Canais**: Canais conectados por tipo, com credenciais devidamente mascaradas.
  - **Disparos**: Histórico de logs de mensagens transmitidas com detalhes de erros de rede.
  - **API Keys**: Controle e visualização das chaves de integração.

---

## 10. Métricas do Admin

O painel de métricas realiza a coleta e exibição das seguintes estatísticas globais:
- **Total de Usuários**: Quantidade de perfis criados no SaaS.
- **Usuários Ativos (7d)**: Usuários que interagiram ou logaram nos últimos 7 dias.
- **Total de Ofertas**: Ofertas gerais adicionadas à base.
- **Ofertas Ativas**: Ofertas marcadas como ativas ou dentro da validade.
- **Canais Conectados**: Canais de Telegram e Discord configurados no sistema.
- **Disparos Totais / Sucesso**: Total de disparos executados.
- **Disparos com Erro**: Taxa de falhas para monitoramento de instabilidade de API externa.
- **API Keys Ativas**: Quantidade de tokens de API externos emitidos.

---

## 11. Segurança Aplicada

A arquitetura do painel de administração preza pela confidencialidade absoluta:
- **Acesso no Banco**: Criada a tabela `public.admin_users` protegida por políticas de RLS rigorosas.
- **RPCs Seguras (`SECURITY DEFINER`)**: As consultas aos dados administrativos são resolvidas no banco através de RPCs contendo `SECURITY DEFINER` e `SET search_path = public`. A validação se o usuário atual é de fato admin é feita a nível de banco de dados (`public.is_current_user_admin()`), impedindo burla no frontend.
- **Mascaramento de Credenciais Sensíveis**: Tokens de bot do Telegram (`xoxb-...`), URLs de webhooks do Discord (`https://discord.com/api/webhooks/...`) e chaves de API têm suas partes críticas substituídas por asteriscos no nível de banco de dados (dentro do Postgres). Assim, se um invasor interceptar as respostas HTTP usando o DevTools do navegador, ele visualizará apenas strings sem segredos brutos (ex: `https://discord.com/api/webhooks/12345/**********`).

---

## 12. Arquivos Alterados

### Criados
1. [supabase_admin_setup.sql](file:///d:/ofertapro/supabase_admin_setup.sql) — Configuração estrutural do banco de dados (tabelas, RPCs, políticas e promoção de admins de teste).
2. [AdminDashboard.tsx](file:///d:/ofertapro/src/pages/AdminDashboard.tsx) — Componente React do painel de administração geral.

### Modificados
1. [features.ts](file:///d:/ofertapro/src/config/features.ts) — Inclusão do toggle `useDirectAffiliateLinkInChannels`.
2. [dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts) — Envio do link direto para os wrappers de disparo do Telegram e Discord.
3. [sender.ts](file:///d:/ofertapro/src/lib/sender.ts) — Atualização do link direto nos campos de URL do embed do Discord.
4. [telegram.ts](file:///d:/ofertapro/src/lib/telegram.ts) — Formatação de link de afiliado direto no texto das mensagens.
5. [NewOfferModal.tsx](file:///d:/ofertapro/src/components/modals/NewOfferModal.tsx) — Ajuste dinâmico no Mockup lateral do modal.
6. [NewOfferPage.tsx](file:///d:/ofertapro/src/pages/NewOfferPage.tsx) — Ajuste dinâmico no Mockup de página inteira.
7. [App.tsx](file:///d:/ofertapro/src/App.tsx) — Reorganização das rotas no React Router com Nested Routes e inclusão da rota `/admin`.
8. [ProtectedRoute.tsx](file:///d:/ofertapro/src/components/ProtectedRoute.tsx) — Ajuste para agir como Nested Route Layout Container.
9. [UserContext.tsx](file:///d:/ofertapro/src/context/UserContext.tsx) — Supressão de loadings globais redundantes e disponibilização do estado `isAdmin`.
10. [Sidebar.tsx](file:///d:/ofertapro/src/components/Sidebar.tsx) — Exibição condicional do link "Painel Admin" para usuários elegíveis.

---

## 13. Testes Realizados

1. **Validação de Links Diretos**:
   - Criação de ofertas com links brutos e validação de disparos via API local no simulador.
   - Constatação de que as mensagens e embeds carregam os links corretos e rastreáveis.
2. **Navegação SPA**:
   - Transição repetida entre as abas do painel lateral (`Dashboard`, `Ofertas`, `Canais`, etc.) monitorando a estabilidade da árvore DOM.
   - Nenhuma cintilação ou exibição de spinner global detectada durante a troca.
3. **Restrições de Admin**:
   - Tentativa de acesso manual à rota `/admin` por usuário não administrador (bloqueado com redirecionamento de segurança).
   - Acesso com usuário administrativo autenticado (carregamento imediato das abas de auditoria).

---

## 14. Resultado do Build e Linter

- **Lint**: Executado localmente via `npm run lint` obtendo **0 erros** ou inconsistências de código.
- **Build**: Compilação concluída com sucesso via `npm run build` gerando todos os arquivos estáticos de produção na pasta `dist`.

---
*Relatório emitido pela Engenharia de Software Antigravity.*
