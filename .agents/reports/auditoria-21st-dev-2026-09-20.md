# Auditoria de componentes Aflyo × 21st.dev

Data: 20/09/2026
Escopo: análise e proposta; nenhuma alteração funcional ou visual aplicada ao produto.

## Resumo executivo

O Aflyo já possui um design system coerente (tokens próprios, claro/escuro, componentes-base, navegação e estados comuns). O melhor uso do 21st.dev não é substituir essa base, e sim absorver padrões de interação em pontos de alta alavancagem.

Prioridade recomendada:

1. Busca global / Command Menu no TopBar.
2. Wizard de criação de oferta com quatro etapas.
3. Empty states acionáveis e específicos por contexto.
4. Filtros compostos para Ofertas e Histórico.
5. Onboarding progressivo mais compacto.
6. Página de planos com comparação canônica de recursos.
7. Central de notificações com ações e filtros.

## Estado atual observado

- Stack compatível: React 19, Tailwind 3, Lucide, CVA e alguns primitives Radix.
- Design system próprio: superfícies, tinta, bordas, sombras, raios, mint e estados semânticos já centralizados.
- Boa fundação interna em `src/components/ui`, incluindo Button, Card, Modal, Tabs, inputs e estados.
- Shell consistente com Sidebar, TopBar, responsividade e temas.
- Há duplicação de padrões e componentes muito grandes: `Channels.tsx` (1.219 linhas), `BotTab.tsx` (1.140), `PublicPageSetupModal.tsx` (971), `NewOfferPage.tsx` (955) e `NewOfferModal.tsx` (897).
- A busca do TopBar só consulta ofertas, embora já anuncie Ctrl/Cmd+K.
- O onboarding ocupa cinco cards horizontais e convive com outros dois fluxos de modal.
- Alguns vazios são ricos, mas outros ainda são apenas uma frase sem ação.
- A página de planos já tem bons cards, mas as listas variam por plano e dificultam comparação direta.
- Ofertas e Histórico têm espaço claro para filtros reutilizáveis e persistentes.

## Recomendações

### P0 — implementar primeiro

#### 1. Command Menu with Global Search

- Referência: https://21st.dev/@ephraimduncan/components/command-menu-04
- Onde: `TopBar.tsx`, ativado pelo campo atual e por Ctrl/Cmd+K.
- Usos: buscar ofertas/canais; navegar para telas; criar oferta; disparar; abrir configurações.
- Ganho: reduz navegação e transforma uma busca limitada em lançador de ações.
- Adaptação: manter Lucide; trocar Tabler por ícones já existentes; usar o Modal/primitives internos; não importar outra base visual.
- Risco: baixo/médio. Exige índice de resultados, teclado e foco bem tratados.

#### 2. Stepper/Wizard para Nova oferta

- Referências: https://21st.dev/@dhileepkumargm/components/multi-step-wizard e https://21st.dev/community/components/nyxbui/stepper/default
- Onde: `/offers/new`; depois avaliar substituição do modal legado.
- Etapas propostas: Produto → Oferta → Canais → Revisar e publicar.
- Ganho: reduz carga cognitiva em uma tela de 955 linhas e cria validação por etapa.
- Adaptação: preservar `useOfferForm`; separar apresentação e estado antes da migração; salvar rascunho local.
- Risco: médio/alto por tocar o principal fluxo de receita. Deve sair atrás de feature flag.

#### 3. Interactive Empty State, sem Motion no primeiro corte

- Referência: https://21st.dev/@remcostoeten/components/interactive-empty-state
- Onde: Dashboard sem ofertas/disparos, Ofertas, Histórico, Canais, notificações e API Keys.
- Ganho: cada vazio explica o próximo passo em vez de apenas constatar ausência.
- Adaptação: criar variantes `first-use`, `no-results`, `error` e `permission`; reutilizar `EmptyState.tsx`; manter animação opcional para não adicionar Framer Motion só por isso.
- Risco: baixo.

### P1 — próxima rodada

#### 4. Advanced Data Table Filter Builder

- Referência: https://21st.dev/@laziekiki/components/advanced-data-table-filter-builder
- Onde: `/offers` e `/history`; versão mais completa no admin.
- Filtros Aflyo: status, marketplace, canal, período, faixa de preço, sucesso/falha.
- Ganho: melhora descoberta em catálogos e históricos crescentes.
- Adaptação: começar com AND simples e chips; não trazer AND/OR arbitrário para o usuário comum; refletir filtros na URL.
- Risco: médio. A referência adiciona Motion/Radix e é mais complexa que o necessário.

#### 5. Onboarding Stages compacto

- Referência: https://21st.dev/@isaiahbjork/components/onboarding-stages
- Onde: Dashboard, substituindo a grade fixa de cinco cards; opcionalmente abrir como drawer.
- Ganho: ocupa menos altura e enfatiza somente a próxima melhor ação.
- Adaptação: manter os cinco marcos existentes e seus dados; mostrar um passo principal, com expansão para a lista.
- Risco: baixo/médio. Deve eliminar redundância com os modais atuais, não criar um quarto onboarding.

#### 6. Pricing with Comparison

- Referências: https://21st.dev/@Codehagen/components/pricing e coleção de comparação do 21st.dev.
- Onde: `/pricing` e paywall/upgrade.
- Ganho: comparação coerente entre planos e limites; reduz dúvida antes do checkout.
- Adaptação: usar uma lista canônica de recursos e mostrar o mesmo conjunto de linhas em todos os planos; destacar “Recomendado”, não alegar “Mais popular” sem dados.
- Evitar: confetti, animação de números e Framer Motion no checkout inicial.
- Risco: médio por impacto direto em conversão; requer instrumentação.

#### 7. Notifications with Actions / Notification Popover

- Referência de coleção: https://21st.dev/community/components/explore/react-notification
- Onde: dropdown existente no TopBar.
- Ações: abrir oferta, revisar falha, reconectar canal, ver cobrança.
- Ganho: transforma aviso em resolução e agrupa por `Operação`, `Conta` e `Sistema`.
- Adaptação: evoluir o componente existente; não instalar um centro paralelo.
- Risco: médio; depende da qualidade e do schema dos eventos.

### P2 — refinamentos

#### 8. Skeletons específicos por página

- Onde: Dashboard, Ofertas, Histórico e Canais.
- Ganho: reduz salto de layout e comunica estrutura durante consultas.
- Diretriz: skeleton deve espelhar o conteúdo final; não usar spinner de página inteira após boot.

#### 9. Number ticker discreto

- Onde: apenas nos KPIs do Dashboard quando uma atualização muda o valor.
- Ganho: feedback de atualização sem redesenho.
- Diretriz: respeitar `prefers-reduced-motion`, não animar no carregamento inicial.

#### 10. Activity feed/timeline

- Onde: substituir ou expandir “Disparos recentes”; possível aba no Histórico.
- Ganho: permite ler sucessos, falhas e reconexões como sequência operacional.
- Diretriz: manter densidade; não transformar o Dashboard em feed social.

## Componentes que não recomendo agora

- Heroes 3D, shaders, blobs, backgrounds animados e glassmorphism: destoam do produto operacional e aumentam custo/performance.
- Sidebar completa de terceiros: o shell atual já resolve desktop/mobile, tema e acesso expirado.
- Nova biblioteca de Button/Card/Input: criaria dois design systems e risco de sobrescrever componentes existentes.
- Confetti em pricing/checkout: distração em decisão financeira.
- Draggable widget grid: persistência, acessibilidade e layout móvel não justificam o ganho atual.
- Carrosséis para funcionalidades do app: escondem informação operacional importante.

## Regras para adoção segura

1. Tratar o 21st.dev como catálogo de padrões, não dependência visual.
2. Revisar licença na página de cada item antes da cópia.
3. Adaptar todos os tokens para a taxonomia Aflyo (`surface`, `ink`, `line`, `mint`).
4. Reutilizar Button/Card/Modal/Input internos e Lucide.
5. Evitar dependência nova quando o comportamento pode ser implementado com React/CSS já presentes.
6. Testar claro/escuro, 320/375/390/768/1280 px, teclado, leitor de tela e reduced motion.
7. Implementar um padrão por PR, com screenshots e teste de regressão.
8. Nos fluxos de receita, usar feature flag e eventos de funil antes/depois.

## Ordem de execução sugerida

- Sprint 1: Empty State v2 + Command Menu.
- Sprint 2: refatoração estrutural do formulário e Wizard de Nova oferta.
- Sprint 3: filtros de Ofertas/Histórico + notificações acionáveis.
- Sprint 4: onboarding compacto + pricing comparável.
- Depois: skeletons, activity feed e microanimações.

## Critérios de sucesso

- Busca: taxa de uso do Ctrl/Cmd+K, tempo até ação e navegação sem mouse.
- Nova oferta: abandono por etapa, erros de validação e tempo até publicação.
- Empty states: clique no CTA e ativação de primeira oferta/canal/disparo.
- Filtros: uso por sessão e tempo para localizar item.
- Onboarding: conclusão dos cinco marcos em 1, 3 e 7 dias.
- Pricing: clique em checkout, conversão e escolha de plano.
