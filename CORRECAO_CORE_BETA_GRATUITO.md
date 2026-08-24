# Correção Core Beta Gratuito — OfertaPro

## 1. Resumo executivo
Este documento resume as correções críticas aplicadas ao core operacional do **OfertaPro** para garantir que a plataforma funcione de forma totalmente gratuita e ilimitada durante sua fase de testes beta. Foram corrigidos travamentos de loading infinito, exibições incorretas de limites e planos, falhas no modal de envio multicanal, comportamento de rotas públicas sem autenticação e sincronizações com o Supabase.

## 2. Bugs encontrados
* **Dashboard em Loading Infinito:** Spinner infinito na inicialização quando a sessão do Supabase demorava a ser carregada ou quando ocorriam timeouts.
* **Canais no Modal "Nova Oferta" em Loading Infinito:** Ao clicar em "Nova Oferta", a seção de canais de disparo ficava travada em "Carregando canais..." caso as requisições ao Supabase sofressem delays.
* **Canais Conectados não Listados:** Canais conectados com status flexíveis ou variações de case-sensitive não apareciam na listagem.
* **Bloqueio por Plano / Upgrade Necessário:** Modais de cobrança e bloqueios de limite impediam o disparo para múltiplos canais e a criação de ofertas.
* **Erros de Sessão em Rotas Públicas:** O app quebrava na rota pública `/u/` devido a erros de getSession/verificação de sessão do usuário logado na inicialização global.
* **Saudação Genérica "Olá, Usuário!":** O dashboard não recuperava o primeiro nome real do usuário cadastrado na conta.
* **Métrica de Membros Confusa:** Exibição de "0 membros" que poluía a interface, visto que a contagem de membros não é requisitada no momento.
* **Tela de Feedbacks Incompleta:** Sem tratamento visual de erros de banco (como a ausência da tabela `beta_feedback`).

## 3. Loading infinito no Dashboard
* **Causa:** O hook `useDashboardStats` inicializava o estado de carregamento como `true` e retornava imediatamente se `user?.id` não estivesse presente na montagem inicial, nunca atualizando para `false`. Além disso, delays ou falhas nas requisições do Supabase travavam o loading indefinidamente.
* **Solução:** 
  * Se o usuário não estiver logado, o hook atualiza `loading` para `false` no retorno rápido.
  * Implementada uma função utilitária `withTimeout` que envelopa as requisições em paralelo (`Promise.all`) do Supabase com um limite de 5 segundos, abortando e lançando um erro amigável caso estoure o tempo limite.
  * O component `Dashboard.tsx` agora renderiza um `ErrorState` polido com botão de "Tentar novamente" caso as estatísticas falhem, em vez de reter o spinner infinito.

## 4. Loading infinito em Canais no Modal
* **Causa:** Ausência de timeout no carregamento de canais do hook `useOfferForm.ts` ao chamar o Supabase, travando o estado `channelsLoading` como `true` permanentemente em conexões instáveis.
* **Solução:**
  * Envelopada a consulta da tabela `channels` na função `withTimeout` (limite de 5 segundos) e convertido o query builder do Supabase em Promise nativa via `Promise.resolve(...)`.
  * Se a busca falhar ou estourar o timeout, ela cai no `catch`, define o erro correspondente no estado de canais e finaliza o loading no `finally`, garantindo que a seção destrave.

## 5. Desativação de planos e limites
* **Causa:** Bloqueios de uso baseados nos planos Free e Starter.
* **Solução:** 
  * Ajustada a feature flag em `src/config/features.ts` para que `billing: false` reflita que o faturamento está desativado no beta.
  * Modificadas as funções do core de planos em `src/config/plans.ts` (`getPlanLimits`, `canCreateOffer`, `canConnectChannel`, `hasFeature`) para que, sempre que `FEATURES.billing` for `false`, retornem permissões ilimitadas (como o plano PRO com limites em `Infinity`).
  * Ocultados os modais e alertas de "Upgrade Necessário" na criação de ofertas e conexão de canais adicionando validações condicionais da flag `FEATURES.billing`.
  * Ocultada a aba "Planos & Cobrança" nas Configurações e o banner de Upgrade na Sidebar quando a flag `FEATURES.billing` está desativada.

## 6. Página pública como rota pública
* **Causa:** O fluxo de inicialização global do app em `App.tsx` e o timeout de perfil em `UserContext.tsx` barravam e exibiam erros fatais na tela do app ("Não foi possível carregar o OfertaPro. Falha ao verificar sessão.") caso a verificação de sessão/perfil falhasse na montagem global, prejudicando o acesso anônimo às páginas públicas.
* **Solução:**
  * Implementada a função utilitária `isPublicRoute()` para checar se o caminho atual do navegador corresponde a uma rota de acesso público (como `/u/`, `/r/`, `/l/`, `/login`, etc.).
  * Modificada a inicialização em `App.tsx` e `UserContext.tsx` para que, caso o usuário esteja em uma rota pública, timeouts ou falhas na sessão local não gerem erros fatais nem barrem a montagem das rotas, permitindo que a `PublicPage` carregue de forma 100% anônima usando a anon key do Supabase.

## 7. Canais conectados
* **Causa:** A filtragem de canais listados no modal esperava estritamente o status `'connected'` (case-sensitive) e exibia dados de membros inexistentes.
* **Solução:**
  * O filtro de `connectedChannels` em `useOfferForm.ts` agora tolera e normaliza status como `'connected'`, `'active'` ou `'conectado'` de forma insensível à capitalização de caixa alta/baixa.
  * Ocultados/removidos todos os dados e contagens de membros no modal de envio da oferta (substituído por indicador `{type} • Ativo`) e na página de canais.
  * Ajustado o painel de estatísticas da página `Channels.tsx` para exibir 2 colunas ("Canais Conectados" e "Desconectados") em vez das 3 colunas originais que incluíam membros.

## 8. Feedbacks
* **Causa:** Falta de tratamento visual para erros de banco, deixando a página em branco caso a tabela de logs e feedbacks não existisse.
* **Solução:**
  * Adicionado estado `error` ao componente `Feedbacks.tsx`.
  * Se a tabela `beta_feedback` não existir ou a query falhar, a página exibe uma interface de erro personalizada no tema escuro explicando que a tabela pode estar ausente e recomendando a execução do script `supabase_beta_feedback.sql` que está na raiz do projeto.

## 9. Arquivos alterados
* [src/config/features.ts](file:///d:/ofertapro/src/config/features.ts) — Ajustada a feature flag.
* [src/config/plans.ts](file:///d:/ofertapro/src/config/plans.ts) — Removidos limites de planos globalmente quando faturamento estiver inativo.
* [src/hooks/useDashboardStats.ts](file:///d:/ofertapro/src/hooks/useDashboardStats.ts) — Tratados timeouts de queries e loading silencioso na ausência de sessão.
* [src/pages/Dashboard.tsx](file:///d:/ofertapro/src/pages/Dashboard.tsx) — Saudação dinâmica via hook de autenticação e tratamento de erros do Supabase.
* [src/hooks/useOfferForm.ts](file:///d:/ofertapro/src/hooks/useOfferForm.ts) — Tratados timeouts na listagem de canais, flexibilização de status de canal e bypass de limites de plano.
* [src/components/modals/NewOfferModal.tsx](file:///d:/ofertapro/src/components/modals/NewOfferModal.tsx) — Escondido membros de canais e adicionado bypass no render do modal de upgrade.
* [src/pages/Channels.tsx](file:///d:/ofertapro/src/pages/Channels.tsx) — Ocultados membros, reestruturado painel de estatísticas em 2 colunas e bypass de limites de faturamento.
* [src/pages/Feedbacks.tsx](file:///d:/ofertapro/src/pages/Feedbacks.tsx) — Tratamento do estado de erro e instrução de script SQL de banco de dados.
* [src/App.tsx](file:///d:/ofertapro/src/App.tsx) — Roteamento resiliente para páginas públicas mesmo em caso de falha de autenticação inicial.
* [src/context/UserContext.tsx](file:///d:/ofertapro/src/context/UserContext.tsx) — Desativado erro fatal de timeout de autenticação se o usuário estiver em rotas públicas.

## 10. Testes realizados
1. **Verificação de compilação:** O build do Vite foi rodado e compilou todo o código sem erros de TypeScript ou bundle.
2. **Resiliência do Dashboard:** Se o usuário estiver deslogado ou se a conexão demorar, a página não trava mais em spinner eterno.
3. **Resiliência do Roteamento:** O acesso a URLs anônimas (como `/u/` ou `/r/`) não exibe mais a tela de erro de sessão travada.

## 11. Resultado do build
* O comando `npm run build` foi executado com **sucesso**:
  ```bash
  vite v8.0.11 building client environment for production...
  transforming...✓ 2440 modules transformed.
  rendering chunks...
  dist/assets/index-DlmvbY9N.css             71.57 kB │ gzip:  12.32 kB
  dist/assets/index-CZQXavYr.js           1,116.17 kB │ gzip: 323.45 kB
  ✓ built in 2.01s
  ```

## 12. Pendências restantes
* Não existem pendências críticas do core beta gratuito identificadas. O sistema está pronto para testes de envio real nos canais integrados.
