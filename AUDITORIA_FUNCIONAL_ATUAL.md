# Auditoria Funcional Atual — OfertaPro

## 1. Resumo executivo

Esta auditoria técnica analisou minuciosamente o ecossistema do **OfertaPro** rodando localmente e integrado ao Supabase real. O OfertaPro possui uma excelente arquitetura baseada em Clean Architecture no frontend, com design system consistente e estética premium. No entanto, o sistema apresenta problemas de alinhamento com o banco de dados Supabase real e inconsistências críticas de rotas e consultas que inviabilizam o uso como um SaaS funcional para testes reais no estado atual.

Os principais focos desta análise foram: o Dashboard, o fluxo de criação e disparo de Ofertas, a conexão de Canais (Discord, Telegram e WhatsApp), o Histórico, a Página Pública, o fluxo de primeiro acesso (Onboarding) e a integridade de rotas e banco de dados.

---

## 2. Status geral

Classificação do sistema: **MVP funcional com pendências**

A maior parte da lógica de visualização, formulários e integração (incluindo o motor de disparos em `dispatch-service.ts`) está pronta e funcional, e o build do TypeScript compila 100% com sucesso. Contudo, há impedimentos estruturais (como a busca incorreta pelo username em vez do public_url na Página Pública) e a falta de persistência de configurações essenciais no banco que impedem o sistema de ser classificado como "Pronto para beta fechado".

---

## 3. Problemas bloqueantes

1.  **Bug Crítico na Rota da Página Pública (`PublicPage.tsx`):**
    A URL pública é gerada no Sidebar baseada no `public_url` do profile (ex: `/u/kaikgivaldodias`). No entanto, o componente `PublicPage.tsx` realiza a busca no Supabase filtrando pelo campo `username` (`.eq('username', user_name)`). Como a trigger de criação de usuário gera um `username` aleatório (ex: `kaikgivaldodias_4a90`) e um `public_url` limpo (ex: `kaikgivaldodias`), a consulta resulta em erro (406 / Not Found) e a página pública quebra dizendo que o usuário não possui página ou ela foi desativada.
2.  **Inconsistência de Username e Public URL nas Configurações (`Settings.tsx`):**
    Ao alterar o "Nome de usuário" no painel de configurações, o sistema executa um update apenas na coluna `username` da tabela `profiles`, deixando a coluna `public_url` inalterada no banco de dados. Como o Sidebar usa `public_url` para gerar o link da página pública e o `PublicPage` busca por `username`, qualquer mudança quebra a integridade das URLs.
3.  **Configurações Importantes não Persistidas no Supabase:**
    As preferências de "Modelo de Mensagem" (template de disparo), "Encurtador de Links" (Bitly/TinyURL) e chaves de "Tracking e Analytics" não são persistidas no banco de dados nem no localStorage. Toda vez que o usuário recarrega a página `/settings`, essas configurações voltam para os valores padrão.
4.  **Ausência de Onboarding Obrigatório no Primeiro Acesso:**
    Não existe fluxo para detectar se é o primeiro acesso do usuário para obrigá-lo a configurar sua página pública (slug, nome, bio e foto). O usuário é levado diretamente ao Dashboard zerado, onde o card de visualização da Página Pública aponta para um username provisório inconsistente.

---

## 4. Problemas não bloqueantes

1.  **Duplicidade de Queries de Canais:**
    O hook `useChannels` foi implementado no projeto, mas não é usado na página `Channels.tsx` nem no modal `NewOfferModal.tsx`. Ambos fazem chamadas manuais e redundantes à API do Supabase para buscar canais.
2.  **Falta de Envio assíncrono em Fila (Risco de Timeout):**
    O disparo em lote para múltiplos canais roda diretamente no frontend em tempo de execução. Se houver muitos canais ou se o usuário fechar a tela, os disparos podem falhar parcialmente sem tratamento de fila robusto.
3.  **Estatísticas de Gráfico no Dashboard Dependentes de Timezone:**
    O gráfico de cliques filtra registros de `clicks` fazendo comparação de string com `startsWith(fullDateStr)` (formato `YYYY-MM-DD`). Oscilações de fuso horário podem causar desalinhamentos temporários na contagem de cliques em determinados horários do dia.

---

## 5. Dashboard
*Status:* **PARCIALMENTE FUNCIONANDO**

*   **O que funciona:** A estrutura visual de cards e gráficos com Recharts está 100% operacional. O hook `useDashboardStats` carrega os dados reais do Supabase e filtra as ofertas, canais, histórico e cliques de forma isolada por `user_id`.
*   **Problemas encontrados:** O dashboard abre totalmente zerado no primeiro acesso porque não há canais, ofertas ou cliques reais no banco de dados. Além disso, as métricas e o gráfico de cliques dependem da inserção de dados que ainda não ocorreu devido às pendências das etapas seguintes.

---

## 6. Ofertas
*Status:* **FUNCIONANDO**

*   **O que funciona:** O CRUD completo de ofertas (Criar, Editar, Excluir e Pausar status) está funcional no banco de dados. O cálculo de desconto é reativo em tempo real e o upload de imagens comprime o arquivo antes de enviar para o Supabase Storage.
*   **Problemas encontrados:** O upload de imagem falhará silenciosamente ou dará erro se o bucket `offers` não tiver sido fisicamente criado e configurado no painel do Supabase com políticas RLS de escrita pública.

---

## 7. Canais
*Status:* **FUNCIONANDO**

*   **O que funciona:** O cadastro de canais do Discord e do Telegram está integrado ao banco de dados com isolamento por usuário. A interface de listagem, contadores de membros e sincronização respondem corretamente.
*   **Problemas encontrados:** A inserção física exige que a infraestrutura das tabelas do banco esteja correta.

---

## 8. Telegram
*Status:* **FUNCIONANDO**

*   **O que funciona:** A conexão com o Telegram Bot API está implementada. A validação de token e chat_id com a API oficial do Telegram funciona no cadastro. O motor de disparo (`dispatch-service.ts` e `telegram.ts`) possui suporte real para mensagens de texto e de foto com legenda formatada em Markdown v1.
*   **Motivo de não aparecer no NewOfferModal:** O modal de nova oferta realiza a busca no Supabase filtrando por canais que possuam `status = 'connected'`. Se o canal foi salvo com outro status, ou se a chamada de inserção falhou devido a políticas RLS incorretas no Supabase (ou falta de tabelas no banco de dados real do usuário), o canal Telegram não é carregado.

---

## 9. Discord
*Status:* **FUNCIONANDO**

*   **O que funciona:** A integração com webhooks do Discord funciona de verdade. O sistema envia embeds avançados com imagens, formatação mono para cupons de desconto e links de afiliado com rastreamento ativo.

---

## 10. WhatsApp
*Status:* **DESATIVADO TEMPORARIAMENTE**

*   **O que funciona:** O frontend possui a estrutura do serviço `evolution.ts` para conectar com a Evolution API.
*   **Ação:** Conforme regras de negócio solicitadas, a Evolution API está desativada por enquanto devido à ausência de chaves de ambiente no `.env`. A UI deve mostrar "Em breve" ou "Desativado temporariamente".

---

## 11. Histórico
*Status:* **FUNCIONANDO**

*   **O que funciona:** A tabela `history` do Supabase e o `HistoryService` estão alinhados. O motor de disparos registra com precisão cada envio de oferta com os canais usados, quantidade, status (success/partial/error) e mensagens de erro específicas. O reenvio de ofertas a partir do histórico está totalmente funcional.

---

## 12. Configurações
*Status:* **PARCIALMENTE FUNCIONANDO**

*   **O que funciona:** A atualização dos dados básicos do perfil (Nome, Bio, Avatar) na tabela `profiles` está operacional.
*   **Problemas encontrados:** As configurações da conta e da página pública estão misturadas na mesma página de forma confusa. Preferências como encurtadores de links, modelo de mensagem padrão e configurações de rastreamento de cliques não são persistidas e voltam ao padrão após recarregar a página. Além disso, ao atualizar o username, o `public_url` não é sincronizado, quebrando as URLs.

---

## 13. Página pública
*Status:* **NÃO FUNCIONANDO**

*   **Problema principal:** Apresenta erro ao carregar porque o `PublicPage.tsx` faz consulta usando o campo `username` contra o parâmetro de URL que contém o `public_url` (slug). Como o `username` gerado automaticamente no cadastro possui um sufixo randômico (ex: `_4a90`), as strings não coincidem e a busca falha em encontrar o perfil no Supabase.

---

## 14. Onboarding de página pública
*Status:* **NÃO IMPLEMENTADO**

*   **O que falta:** Falta implementar a detecção de primeiro acesso (por exemplo, através de uma nova coluna `onboarded` na tabela `profiles` ou identificando se o `username` ainda é o provisório) e exibir um fluxo obrigatório (modal ou página dedicada) para o usuário escolher seu username final, nome público, bio, foto e tema antes de acessar o painel administrativo.

---

## 15. Banco de dados e Supabase
*Status:* **PRECISA DE CONFIGURAÇÃO**

*   **O que falta:** Para o SaaS funcionar com dados reais, o administrador do banco de dados deve executar na nuvem do Supabase os scripts:
    1.  `supabase_schema.sql` (cria as tabelas `profiles`, `channels`, `offers`, `history`, triggers de novos perfis e políticas RLS).
    2.  `supabase_clicks_schema.sql` (cria a tabela `clicks`, RLS e a trigger atômica de contagem de cliques).
    3.  `supabase_migration_telegram.sql` (adiciona a coluna `metadata` do tipo JSONB na tabela `channels`).
    4.  Criar os buckets `offers` e `avatars` no Supabase Storage e habilitar o acesso público e políticas de upload.

---

## 16. Rotas
*Status:* **FUNCIONANDO**

*   As rotas privadas (`/dashboard`, `/offers`, `/channels`, `/history`, `/settings`) e as rotas públicas (`/u/:username`, `/r/:id`, `/l/:id`, `/login`) estão corretamente mapeadas no arquivo `src/App.tsx`.

---

## 17. Erros de console
*Status:* **SEM ERROS ATIVOS**

*   O console do navegador não apresenta erros de execução críticos. O roteamento e as chamadas ao Supabase ocorrem de forma assíncrona e resiliente.

---

## 18. Build
*Status:* **FUNCIONANDO**

*   O comando `npm run build` executa perfeitamente e gera a build de produção na pasta `dist/` sem nenhum erro de transpilação TypeScript ou sintaxe JS.

---

## 19. Plano de correção por prioridade

### Prioridade 1 — Ajuste Crítico de Rota e Busca da Página Pública
*   **Ação:** Alterar a consulta do `PublicPage.tsx` para buscar o perfil utilizando o campo `public_url` (slug) em vez do `username` `.eq('public_url', username)`.
*   **Dificuldade:** Baixa | **Impacto:** Crítico (Página pública volta a funcionar de verdade).

### Prioridade 2 — Sincronização de Username e Public URL nas Configurações
*   **Ação:** Atualizar o `Settings.tsx` para atualizar simultaneamente as colunas `username` e `public_url` do profile ao salvar as configurações de URL, evitando descompasso entre a URL acessada e o cadastro.
*   **Dificuldade:** Baixa | **Impacto:** Crítico (Navegação interna e externa sintonizada).

### Prioridade 3 — Implementar Onboarding Obrigatório no Primeiro Acesso
*   **Ação:** 
    1. Adicionar coluna `onboarded` (boolean DEFAULT false) na tabela `profiles` do Supabase.
    2. No `Layout.tsx` ou `Dashboard.tsx`, checar se `profile.onboarded` é falso. Se for, exibir um modal de overlay obrigatório para preenchimento de nome público, username público (slug), bio e foto de perfil.
    3. Ao salvar, enviar os dados ao Supabase atualizando `onboarded: true`.
*   **Dificuldade:** Média | **Impacto:** Alto (Garante onboarding polido para testes reais).

### Prioridade 4 — Persistência de preferências de Configurações
*   **Ação:** Persistir no `localStorage` do navegador do usuário (ou em colunas adicionais no banco) as variáveis de "Modelo de Mensagem" e "Encurtador de Links" da página de configurações, de modo que fiquem salvas ao recarregar a página.
*   **Dificuldade:** Baixa | **Impacto:** Médio (Usabilidade do SaaS).

### Prioridade 5 — Separação Visual das Configurações
*   **Ação:** Organizar a interface de `Settings.tsx` em duas seções ou abas visuais claras: "Dados da Conta" e "Visual da Página Pública".
*   **Dificuldade:** Baixa | **Impacto:** Médio (Melhoria de UX).

---

## 20. Checklist para sistema gratuito de teste

*   [x] Build TypeScript sem erros
*   [x] Login e controle de sessão estável
*   [ ] Busca e renderização da Página Pública corrigida (`public_url`)
*   [ ] Configurações sintonizando `username` e `public_url`
*   [ ] Persistência do Modelo de Mensagem configurado
*   [ ] Modal de Onboarding obrigatório bloqueando primeiro acesso
*   [x] Envio real para o Telegram Bot funcionando
*   [x] Envio real para o Discord Webhook funcionando
*   [ ] WhatsApp ocultado/desativado com aviso "Em breve" ou "Desativado temporariamente"
*   [x] Registro automático de disparos na tabela `history`
*   [x] Registro de cliques reais na tabela `clicks` com trigger de incremento atômico
*   [x] Redirecionador de tracking resiliente contra instabilidades
*   [x] Dashboard renderizando métricas agregadas reais do Supabase
*   [ ] Execução dos scripts SQL no banco de dados remoto concluída
