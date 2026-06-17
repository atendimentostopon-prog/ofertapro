# Guia de Teste Manual — OfertaPro

Este guia contém os roteiros de testes detalhados para execução de Garantia de Qualidade (QA) no OfertaPro antes de liberar o acesso a usuários reais.

---

### Teste 1 — Cadastro de usuário novo
*   **Objetivo:** Validar o fluxo de registro de novos usuários e a criação do respectivo perfil.
*   **Passos:**
    1. Acessar a página de login (`/login`).
    2. Clicar em "Criar conta" ou mudar para a aba de cadastro.
    3. Preencher e-mail e senha.
    4. Clicar em "Cadastrar".
*   **Resultado esperado:** Usuário é registrado no Supabase Auth, um perfil correspondente é inserido na tabela `profiles` com username amigável randômico, e o usuário é redirecionado ao dashboard.
*   **Status:** ✅ Pronto para teste.

---

### Teste 2 — Login/logout
*   **Objetivo:** Validar o fluxo de autenticação e encerramento de sessão.
*   **Passos:**
    1. Com a conta criada, ir à página `/login`.
    2. Preencher e-mail e senha e clicar em "Entrar".
    3. Após entrar, clicar no botão de "Sair" na barra lateral ou configurações.
*   **Resultado esperado:** O login redireciona com sucesso ao dashboard `/dashboard`. O logout limpa o token de sessão do local storage e redireciona de volta à tela de login.
*   **Status:** ✅ Pronto para teste.

---

### Teste 3 — Criar oferta com imagem
*   **Objetivo:** Validar o fluxo de criação de oferta com envio e otimização de imagem.
*   **Passos:**
    1. No menu lateral, ir para "Ofertas" (`/offers`).
    2. Clicar em "Nova Oferta" para abrir o modal.
    3. Preencher título, link de afiliado, marketplace, preço original, preço de venda e fazer o upload de uma imagem.
    4. Clicar em "Salvar".
*   **Resultado esperado:** A imagem é comprimida pelo utilitário frontend, salva no bucket `offers` do Supabase Storage, os dados são salvos na tabela `offers` e a nova oferta aparece listada na tela.
*   **Status:** ⚠️ Requer criação física do bucket `offers` no Supabase.

---

### Teste 4 — Criar oferta sem cupom
*   **Objetivo:** Validar que ofertas sem cupom de desconto são salvas e exibidas corretamente na UI sem campos em branco indesejados.
*   **Passos:**
    1. No painel de ofertas, abrir o modal "Nova Oferta".
    2. Preencher todos os dados obrigatórios, mas deixar o campo "Cupom" vazio.
    3. Salvar a oferta.
*   **Resultado esperado:** A oferta é salva com sucesso, e nos cards da listagem (e página pública) a seção ou etiqueta de "CUPOM" não é exibida.
*   **Status:** ✅ Pronto para teste.

---

### Teste 5 — Editar oferta
*   **Objetivo:** Validar a alteração de dados de uma oferta existente.
*   **Passos:**
    1. Na lista de ofertas (`/offers`), clicar no menu de opções de uma oferta e selecionar "Editar".
    2. Alterar o preço de venda e o título.
    3. Clicar em "Salvar Alterações".
*   **Resultado esperado:** Os dados são atualizados no banco e refletidos instantaneamente na listagem.
*   **Status:** ✅ Pronto para teste.

---

### Teste 6 — Arquivar oferta
*   **Objetivo:** Alterar o status da oferta para inativa e validar sua remoção automática da vitrine pública.
*   **Passos:**
    1. Ir ao painel de ofertas (`/offers`).
    2. Mudar o interruptor de status ou selecionar "Desativar" no menu da oferta.
    3. Acessar a página pública correspondente.
*   **Resultado esperado:** A oferta passa para o status `inactive` no banco e desaparece da vitrine pública do catálogo do afiliado.
*   **Status:** ✅ Pronto para teste.

---

### Teste 7 — Conectar Discord
*   **Objetivo:** Adicionar e validar um canal de disparo do tipo Discord.
*   **Passos:**
    1. Acessar a página "Canais" (`/channels`).
    2. Na seção "Adicionar Novo Canal", clicar em "Conectar Discord".
    3. Inserir um nome para identificação e a URL do Webhook do Discord.
    4. Salvar.
*   **Resultado esperado:** O canal é cadastrado com status "Conectado" na tabela `channels` de forma criptografada/privada para o usuário logado.
*   **Status:** ✅ Pronto para teste.

---

### Teste 8 — Enviar para Discord
*   **Objetivo:** Validar o envio de oferta para o Discord via webhook.
*   **Passos:**
    1. Criar uma nova oferta ou editar uma existente.
    2. No modal, selecionar o canal do Discord cadastrado no checklist de disparo.
    3. Salvar e disparar.
*   **Resultado esperado:** O webhook do Discord recebe a oferta e exibe um card com layout (embed) rico com títulos, preços, cupom e imagem. Um registro é gerado no histórico com status de sucesso.
*   **Status:** ✅ Pronto para teste.

---

### Teste 9 — Conectar WhatsApp
*   **Objetivo:** Conectar uma instância do WhatsApp via Evolution API.
*   **Passos:**
    1. Ir em "Canais" (`/channels`).
    2. Clicar em "Conectar WhatsApp".
    3. Preencher o identificador (número/nome).
    4. Ler o QR Code gerado na tela usando o celular.
*   **Resultado esperado:** A Evolution API gera o QR Code em base64, o frontend exibe o código para leitura e o status da conexão muda para "connected" no sucesso do pareamento.
*   **Status:** ⚠️ Requer as variáveis `VITE_EVOLUTION_URL` e `VITE_EVOLUTION_API_KEY` configuradas no arquivo `.env`.

---

### Teste 10 — Enviar para WhatsApp
*   **Objetivo:** Validar o disparo e formatação de ofertas em grupos ou chats do WhatsApp.
*   **Passos:**
    1. Criar/editar uma oferta e selecionar o canal de WhatsApp pareado.
    2. Enviar a oferta.
*   **Resultado esperado:** A mensagem de oferta é recebida no grupo/chat do WhatsApp contendo o título formatado em negrito, preços formatados e o link de tracking encurtado. Se houver imagem, ela é enviada junto da mensagem.
*   **Status:** ⚠️ Requer chaves Evolution e servidor pareado.

---

### Teste 11 — Conectar Telegram
*   **Objetivo:** Conectar um bot do Telegram a um canal ou grupo.
*   **Passos:**
    1. Ir em "Canais" (`/channels`).
    2. Selecionar "Conectar Telegram".
    3. Inserir o Bot Token (obtido com o @BotFather) e o Chat ID do grupo/canal (onde o bot é administrador).
    4. Salvar.
*   **Resultado esperado:** O sistema realiza a validação chamando `getMe` e `getChat` no Telegram Bot API. O canal é inserido com sucesso se a validação retornar OK.
*   **Status:** ✅ Pronto para teste.

---

### Teste 12 — Enviar para Telegram
*   **Objetivo:** Validar o disparo de mensagens estruturadas com imagem no canal do Telegram.
*   **Passos:**
    1. Disparar uma oferta contendo imagem, selecionando o canal Telegram correspondente.
*   **Resultado esperado:** O bot envia uma foto com a legenda formatada em Markdown v1 contendo título da oferta, preços riscado/cheio, cupom monoespaçado e link de afiliado. Caso o envio da foto falhe, realiza o fallback enviando por mensagem de texto com link da imagem.
*   **Status:** ✅ Pronto para teste.

---

### Teste 13 — Página pública
*   **Objetivo:** Garantir a funcionalidade e indexabilidade da vitrine pública de ofertas do afiliado.
*   **Passos:**
    1. Acessar a rota `/:username` correspondente ao username do usuário de teste.
    2. Testar os filtros de marketplaces e barra de buscas.
*   **Resultado esperado:** A página abre instantaneamente, exibe a bio e o nome do afiliado, lista suas ofertas ativas ordenadas por data e permite filtragem em tempo real. O título da aba e tags SEO refletem os dados do afiliado.
*   **Status:** ✅ Pronto para teste.

---

### Teste 14 — Clique e redirect
*   **Objetivo:** Rastrear o clique na oferta e redirecionar o usuário de forma ininterrupta.
*   **Passos:**
    1. Clicar no botão "Acessar Oferta" de uma oferta na página pública ou em um link de disparo (`/r/:id?src=telegram`).
*   **Resultado esperado:** O link direciona para a página `/r/:id`. Uma inserção assíncrona é feita na tabela `clicks` para registrar a métrica, e o visitante é redirecionado instantaneamente para a loja oficial do link de afiliado. Em caso de falha no banco de dados, o redirect ocorre normalmente.
*   **Status:** ✅ Pronto para teste.

---

### Teste 15 — Dashboard
*   **Objetivo:** Validar a integridade das métricas do painel administrativo.
*   **Passos:**
    1. Acessar o Dashboard (`/dashboard`).
    2. Verificar os cards de totalizador e o gráfico de cliques diários.
*   **Resultado esperado:** O dashboard exibe as somas corretas de cliques e disparos efetuados nos últimos 7 dias. O gráfico desenha as curvas de cliques reais com base nas inserções da tabela `clicks`.
*   **Status:** ✅ Pronto para teste.

---

### Teste 16 — Usuário A não vê dados do usuário B
*   **Objetivo:** Validar a segurança e isolamento multi-tenant das tabelas no Supabase.
*   **Passos:**
    1. Cadastrar e logar o Usuário A. Criar uma oferta.
    2. Cadastrar e logar o Usuário B. Acessar o painel de ofertas (`/offers`).
*   **Resultado esperado:** O Usuário B não vê a oferta criada pelo Usuário A. Caso tente fazer requisição direta no Supabase pelo ID da oferta do Usuário A, o banco retorna vazio ou erro devido à política RLS restritiva.
*   **Status:** ⚠️ Requer ativação física das regras de RLS no painel do Supabase.

---

### Teste 17 — Mobile
*   **Objetivo:** Testar usabilidade e quebra de layout em telas de smartphones.
*   **Passos:**
    1. Acessar a aplicação por um dispositivo móvel ou simular via Chrome DevTools (ex: iPhone 12/Pixel 7).
    2. Navegar pelo menu hambúrguer, abrir o modal de nova oferta e visualizar a página pública.
*   **Resultado esperado:** O menu lateral se adapta a gavetas (drawers) ou barras simplificadas, os textos e imagens se redimensionam sem criar rolagem horizontal indesejada e botões de ação ficam acessíveis ao toque.
*   **Status:** ✅ Pronto para teste.
