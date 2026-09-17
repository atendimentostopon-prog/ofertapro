# Varredura e correção de bugs — app aflyo (app.aflyo.com.br)

**Data:** 2026-09-17
**Origem:** pedido direto do usuário ("resolva todos os bugs do sistema... botões, ações, onde mostra que o bot tá conectado mas não tá") + auditoria em produção (leitura de código, queries diretas no Postgres via Supabase MCP, e varredura visual com Chrome/`cacador-de-bugs` logado como usuário real).
**Escopo:** app principal do usuário (`app.aflyo.com.br`) — Dashboard, Ofertas, Canais, Integrações, Histórico, Configurações, Vitrine pública, layout/shell global. **Fora de escopo:** painel admin (`admin.aflyo.com.br`) — auditado e validado recentemente em outras sessões (SP1-SP7), e áreas não visitadas nesta auditoria (modal de edição de oferta, fluxo completo de QR real do WhatsApp, Templates de Mensagem, Planos e Cobrança) — essas ficam para uma segunda varredura se algo aparecer depois.

## Achados (11 bugs confirmados, causa raiz identificada em todos)

### Críticos (quebram a confiança no status mostrado — o foco #1 do pedido)

1. **`bot_configs.error_message` não existe no banco.** `useBotStatus.ts` seleciona essa coluna; a coluna real se chama `last_error`. Toda query falha com erro Postgres `42703`, e o Dashboard mostra sempre "Não foi possível verificar o bot" — mesmo com o bot funcionando (confirmado: `/integrations` mostra "Conectado" corretamente pro mesmo usuário, ao mesmo tempo). Fix: trocar `error_message` por `last_error` no select e no mapeamento — sem migration, a coluna certa já existe.

2. **Reconexão de WhatsApp não propaga pra `channels.status`.** Em `supabase/functions/evolution-webhook/index.ts`, o handler de `connection.update` atualiza `channels.status = 'disconnected'` em cascata quando o WhatsApp cai (`state === 'close'`), mas **não** faz o cascade inverso quando reconecta (`state === 'open'`). Resultado: depois de reconectar de verdade, o canal (e a contagem "conectados" em Dashboard/Ofertas) continua mostrando desconectado até alguém mexer manualmente. Esse é o caso exato de "mostra desconectado mas tá conectado".

3. **Status de Telegram/Discord nunca se autocorrige.** `Channels.tsx` grava `channels.status = 'connected'` uma única vez ao cadastrar o canal. O botão "Testar conexão" (Telegram) só atualiza estado local temporário (`testResult`, some em 4-6s) e nunca persiste o resultado em `channels.status`. Se o token/webhook morrer depois, a UI segue dizendo "Conectado" indefinidamente. Fix: persistir o resultado do teste em `channels.status`, e rodar uma verificação leve ao carregar `/channels` (não só sob demanda).

4. **Card "CANAIS" do Dashboard compara métricas diferentes.** `Dashboard.tsx:59` soma `maxWhatsappConnections + maxTelegramConnections` (limite de *números/instâncias*, 2+2=4 no Pro) e compara contra a contagem de *canais de destino conectados* (`channels` — WhatsApp+Telegram+Discord, hoje 5). O limite certo pra canais de destino é `maxWhatsappGroups + maxTelegramGroups` (12+12=24 no Pro). Resultado: aviso falso de "Limite atingido" pra um usuário Pro usando só 5 de 24 canais disponíveis. Fix: usar a métrica certa nos dois lados (decidir com o card se a intenção é "canais de destino" — mais provável dado o rótulo "Canais" — e trocar o denominador).

### Altos

5. **Header (TopBar) some ao rolar em qualquer página.** `Layout.tsx` tem `overflow-x-hidden` no `<div>` raiz, que força `overflow-y: auto` implícito nesse elemento — ele vira o "ancestral de scroll" usado pro cálculo do `position: sticky` do header, mas quem rola de verdade é a janela. O header nunca gruda. Fix: remover o `overflow-x-hidden` do wrapper raiz (o comentário já no código admite que era supressão de sintoma) e manter só o que já existe em `<main>`.

6. **Imagens gigantes no Histórico de Disparos.** `ProductImage.tsx` monta a className como `` `block w-full h-full object-cover ${className}` `` — as classes de tamanho fixo (`w-12 h-12`) que `History.tsx` passa perdem pra `w-full h-full` no CSS compilado do Tailwind (ordem de utilitário, não de atributo). Imagens renderizam em ~800×1268px em vez de 48×48px, quebrando o layout do card. Fix: usar merge de classes que resolve conflito (`tailwind-merge`) ou tirar `w-full h-full` do template base.

7. **Wordmark "aflyo" invisível em dark mode.** `Sidebar.tsx` usa sempre `/brand/logo-primary.png` (pensada pra fundo claro). Existe `/brand/logo-white.png` no repo, não referenciado em lugar nenhum. Fix: trocar a `src` condicionalmente pelo tema ativo.

8. **Contagem de ofertas ativas diverge entre telas.** Banco tem 28 ofertas `active` pro usuário testado; a Vitrine pública mostra 28 corretamente; `/offers` e o card do Dashboard mostram 25. Causa exata ainda não fechada — meu candidato principal é o guard `lastLoadedUserIdRef` em `useOffers.ts` pulando um refetch completo, ou um erro engolido silenciosamente. Fix: instrumentar e corrigir a causa raiz real (task de investigação + fix).

### Médios

9. **Timeouts intermitentes de 4s no Dashboard** (`useDashboardStats.ts`, queries de `history`/`history_count`) mesmo a query rodando em ~5-226ms isolada — indício de contenção ao disparar 5 queries em paralelo no mount, não de query mal otimizada (índice já existe e foi confirmado via `EXPLAIN ANALYZE`). Fix: aumentar a margem do timeout e/ou reduzir paralelismo; não há índice faltando pra criar.

10. **Flash de "API não configurada"** na aba "API & Integrações" antes dos dados reais chegarem — falta um loading state explícito, o componente assume vazio como padrão inicial.

### Baixo

11. **Texto cortado no card "Origem de Tráfego"** (`AnalyticsZone.tsx`) — rótulos "MARKETPLACE"/"DESTAQUE" e seus valores vazam a borda do card em 1280px por falta de `min-w-0`/truncamento controlado.

## Abordagem

Cada bug acima é uma correção pontual e isolada (arquivo(s) e causa raiz já identificados) — não há necessidade de redesenho de arquitetura. Onde a causa raiz não está 100% fechada (bug 8, e parcialmente o 9), a task inclui um passo de instrumentação/confirmação antes do fix.

**Ordem de execução:** críticos primeiro (1-4, são o núcleo do pedido do usuário sobre status do bot/canais), depois altos (5-8), depois médios/baixo (9-11). Bugs sem dependência de arquivo entre si podem ser feitos em paralelo por agentes diferentes; `Dashboard.tsx` é tocado por dois bugs (4 e indiretamente 9) — tratar em sequência dentro do mesmo agente pra evitar conflito de merge.

**Validação:** depois de cada fix (ou grupo de fixes no mesmo arquivo), build (`npm run build`) precisa passar. Bugs visuais/de dados (1, 2, 4, 5, 6, 7, 11) precisam de verificação visual real no navegador (Chrome via `superpowers-chrome`, perfil `browser-user`, logado com a conta de teste já usada nesta auditoria) antes de considerar concluído — não vale só "o código parece certo". Bugs 2 e 3 (Edge Functions / Evolution) são mais difíceis de testar via UI sem hardware real de WhatsApp/Telegram; validação ali é por leitura cuidadosa do diff + teste do cascade via update direto no banco simulando os dois eventos (`open`/`close`).

**Deploy:** fixes de frontend vão pra produção via merge na `main` (deploy automático Vercel, conforme padrão do projeto). Fix de Edge Function (`evolution-webhook`) precisa de `supabase functions deploy` depois do merge. Nenhuma migration de banco é necessária (bug 1 usa coluna já existente).

## Não-objetivos

- Não cobre o painel admin.
- Não expande a varredura pra áreas fora do escopo already definido (modal de edição de oferta, QR real, Templates, Planos/Cobrança) — se o usuário quiser, é uma segunda rodada.
- Não é uma reescrita do sistema de limites de plano (bug 4 é um fix pontual de métrica errada, não uma migração de `config/plans.ts` pra ler `plan_limits` ao vivo — esse mirror já é um padrão intencional e sincronizado no projeto).
