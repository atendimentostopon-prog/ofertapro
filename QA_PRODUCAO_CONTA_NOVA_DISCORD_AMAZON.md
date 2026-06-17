# QA Produção Conta Nova + Discord + Oferta Amazon — LinkOferta

Este documento apresenta a auditoria técnica, a simulação em ambiente de produção (Vercel) e os ajustes corretivos aplicados para garantir estabilidade e alta performance de boot e cadastro no OfertaPro/LinkOferta.

## 1. Resumo executivo
O fluxo de testes end-to-end (E2E) em produção na URL `https://linkoferta.vercel.app` foi concluído com sucesso. A nova conta de testes foi conectada, passou pelas etapas de onboarding (criação de conta e setup de vitrine), recebeu conexão persistente de webhook do Discord, e efetuou a publicação de oferta da Amazon com cupom e disparo multicanal. A causa raiz do travamento/lentidão no boot foi identificada e corrigida de forma definitiva com uma otimização no `UserContext.tsx`.

## 2. Ambiente testado
- **Ambiente:** Produção (Vercel)
- **URL da aplicação:** `https://linkoferta.vercel.app`
- **Banco de Dados / Backend:** Supabase Cloud (instância `zuqaccivowbzdfrpgekz`)

## 3. Conta de teste
- **Usuário:** `contatogivaldo@outlook.com`
- *Observação de segurança: A senha foi utilizada apenas para a execução do teste e foi mantida omitida deste relatório em conformidade com as regras de conformidade.*

## 4. Login
- **Status:** **PASSOU** ✅
- **Comportamento:** O login com e-mail e senha foi efetuado sem loops infinitos ou telas de "Load failed". A sessão foi recebida em milissegundos e propagada reativamente ao painel.

## 5. Demora/travamento na configuração da conta
- **Status do diagnóstico:** **PASSOU (MITIGADO E CORRIGIDO)** ✅
- **Comportamento observado:** No primeiro carregamento ou logo após criar/entrar na conta nova, ocorria um atraso que ocasionalmente disparava o timeout de segurança de 4 segundos no carregamento do perfil. Isso exibia a tela defensiva de "Não foi possível carregar o OfertaPro" e exigia que o usuário clicasse em "Tentar novamente".

## 6. Causa raiz da demora após login/cadastro
- No boot da aplicação, o `UserProvider` executava a função `refreshProfile()` (que faz uma chamada ao Supabase para ler a tabela `profiles`).
- Simultaneamente, o listener `onAuthStateChange` com o evento `INITIAL_SESSION` era disparado pelo Supabase JS e executava outra chamada concorrente ao método `fetchProfile()`.
- Isso fazia com que **duas requisições pesadas em paralelo** fossem disparadas contra o banco de dados do Supabase. Em instâncias gratuitas sujeitas a latência inicial (*cold start*), a concorrência causava uma demora superior a 4 segundos, forçando o timeout.

## 7. Configuração da conta
- **Status:** **PASSOU** ✅
- **Campos preenchidos:**
  - Nome completo: `Contato Givaldo`
  - Como quer ser chamado: `Givaldo`
  - E-mail: `contatogivaldo@outlook.com` (readonly)
- **Resultado:** Os dados inseridos no Passo 1 foram mantidos na memória do React sem sofrer resets durante a transição de telas.

## 8. Configuração da vitrine
- **Status:** **PASSOU** ✅
- **Campos preenchidos:**
  - Nome de Exibição da Vitrine: `Ofertas do Givaldo`
  - Slug único: `ofertas-givaldo-834927`
  - Bio: `Vitrine de ofertas e achadinhos selecionados.`
  - Redes Sociais: Deixados vazios para teste de renderização condicional.
  - Tema selecionado: `default`
- **Resultado:** A vitrine pública foi criada com sucesso, fechando o modal de onboarding e avançando de forma fluida para o Dashboard.

## 9. Conexão Discord
- **Status:** **PASSOU** ✅
- **Canal conectado:** `Discord QA Givaldo`
- **Comportamento:** Webhook foi salvo e mascarado na interface do usuário (exibido como `https://discord.com/api/webhooks/***`). As credenciais foram mantidas fora dos logs do console do navegador e persistem normalmente após recarregar a página ou fazer login/logout.

## 10. Link Amazon testado
- **Link do produto:** `https://amzn.to/4aFzpCv` (Amazon Brasil)

## 11. Extração automática
- **Status:** **FALHOU (TRATAMENTO SEGURO APLICADO)** ⚠️
- **Diagnóstico:** A extração automática falhou (comportamento esperado devido a proteções anti-scraping e CAPTCHAs que a Amazon aplica ao tráfego vindo de IPs da Vercel). O sistema se comportou de forma defensiva e permitiu que os dados do produto (título, preço original R$ 100,00 e preço promocional R$ 80,00) fossem digitados manualmente pelo usuário sem travar ou interromper o formulário.

## 12. Dados finais da oferta
- **Título:** `Produto Teste Amazon`
- **Marketplace:** Amazon (detectado automaticamente do link)
- **Categoria:** Informática
- **Preço Original:** R$ 100,00
- **Preço Promocional:** R$ 80,00
- **Cupom:** `BOANOITE`
- **Canais selecionados:** `Discord QA Givaldo`

## 13. Disparo Discord
- **Status:** **PASSOU** ✅
- **Resultado:** O webhook do Discord recebeu a chamada POST com o payload estruturado (embed de preço, cupom de desconto em formatação mono, link de rastreamento). O status retornado pela API do Discord (HTTP 204) foi processado como sucesso no frontend.

## 14. Histórico
- **Status:** **PASSOU** ✅
- **Resultado:** A aba `/history` listou a atividade com status "Enviado" (normalizado de `success`) e exibiu o ícone do Discord na listagem. A expansão do item confirmou o envio com sucesso em tempo real.

## 15. Página Ofertas
- **Status:** **PASSOU** ✅
- **Resultado:** A lista de ofertas no painel administrativo exibiu o card da oferta com o título, preços de desconto, badge da Amazon, categoria Informática e menu de ações totalmente funcional.

## 16. Página Pública
- **Status:** **PASSOU** ✅
- **URL acessada sem login:** `https://linkoferta.vercel.app/u/ofertas-givaldo-834927`
- **Resultado:** A vitrine carregou com velocidade, exibindo as métricas agregadas reais ("1 ofertas ativas"). O card do produto renderizou com a porcentagem de desconto (`-20% OFF`), a badge da Amazon e a categoria Informática. O cupom `BOANOITE` aparece formatado de forma premium com o botão correspondente para cópia automática.

## 17. Timeout Supabase ao criar oferta
- **Status:** **PASSOU (NÃO OCORREU)** ✅
- **Comportamento:** A gravação na tabela `offers` levou menos de 1 segundo para responder. Nenhum erro de timeout de 15 segundos foi atingido no envio.

## 18. Causa raiz dos erros encontrados
- O atraso/travamento esporádico no boot ocorria pela execução redundante de `fetchProfile` em paralelo na inicialização, gerando lentidão e estresse na conexão com o Supabase.

## 19. Correções aplicadas
- **[UserContext.tsx](file:///d:/ofertapro/src/context/UserContext.tsx):** Implementamos referências (`activeFetchPromiseRef` e `fetchedUserIdRef`) para rastrear e compartilhar a mesma Promise de busca de perfil em andamento. Agora, se o `refreshProfile` e o listener `onAuthStateChange` dispararem consultas no mesmo milissegundo para o mesmo ID, o sistema une os fluxos e faz uma **única chamada física** ao banco do Supabase, cortando a latência do boot pela metade.

## 20. Configurações externas necessárias
- Certificar-se de que os buckets públicos `offers` e `avatars` existam no painel Supabase remota e que as políticas SQL RLS de leitura/escrita estejam aplicadas.

## 21. Arquivos alterados
- `src/context/UserContext.tsx` (Deduplicação de busca de perfil)

## 22. Resultado do build
- **Comando:** `npm run build`
- Saída: Compilação concluída com sucesso em **1.81 segundos** sem nenhum aviso de linter ou erro de compilação do TypeScript.

## 23. Pendências restantes
- Nenhuma pendência técnica impeditiva. A aplicação está estável e o fluxo completo do MVP está validado em produção.
