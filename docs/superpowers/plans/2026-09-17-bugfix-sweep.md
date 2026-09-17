# Varredura e Correção de Bugs (app aflyo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir os 11 bugs confirmados na auditoria de 2026-09-17 (`docs/superpowers/specs/2026-09-17-bugfix-sweep-design.md`) no app principal aflyo (`app.aflyo.com.br`), priorizando os que fazem o status de conexão do bot/canais mentir pro usuário.

**Architecture:** Nenhuma mudança arquitetural — cada task é uma correção pontual e isolada num arquivo (ou par de arquivos) já identificado, sem introduzir abstrações novas nem dependências novas.

**Tech Stack:** React 19 + TypeScript + Vite, TailwindCSS, Supabase (Postgres + Edge Functions Deno), React Router 7.

## Global Constraints

- Não criar nenhuma migration de banco (todos os fixes usam colunas/tabelas já existentes).
- Não adicionar dependências npm novas.
- `npm run build` precisa passar (tsc -b + vite build) depois de cada task.
- Nunca usar travessão (—) em texto voltado ao usuário (copy de UI/toast).
- Responder e comentar sempre em pt-BR.
- Projeto Supabase: `zuqaccivowbzdfrpgekz`. Use o comando `SUPABASE_ACCESS_TOKEN` que já está configurado no ambiente do worker (ou `mcp__claude_ai_Supabase__*` se disponível) para deploy de Edge Function na Task 2 — nunca hardcode um PAT no código ou em commits.
- Escopo é só o app principal (`app.aflyo.com.br`). Não tocar no painel admin (`admin.aflyo.com.br`).
- Validação de UI: usar Chrome via `superpowers-chrome` (perfil `browser-user`, já com sessão logada como `contatogivaldo@outlook.com`) contra `https://app.aflyo.com.br` em produção. Se a sessão tiver expirado, a senha é `986532Gv.` (conta de teste autorizada pelo dono do projeto).

---

## File Structure

| Arquivo | Bug(s) | Responsabilidade tocada |
|---|---|---|
| `src/hooks/useBotStatus.ts` | 1 | Nome de coluna errado no select |
| `src/components/settings/BotTab.tsx` | 1 | Campo de erro com nome errado (mascarava mensagem real) |
| `supabase/functions/evolution-webhook/index.ts` | 2 | Cascade de reconexão faltando |
| `src/pages/Channels.tsx` | 3 | Persistência do resultado do teste de conexão |
| `src/pages/Dashboard.tsx` | 4 | Fórmula errada do limite de canais |
| `src/components/Layout.tsx` | 5 | `overflow-x-hidden` no wrapper raiz quebra o sticky do header |
| `src/components/shared/ProductImage.tsx` | 6 | Classes de tamanho hardcoded conflitando com o chamador |
| `src/components/Sidebar.tsx` | 7 | Logo sem variante dark |
| `src/hooks/useOffers.ts` | 8 | Guard de refetch pode mascarar carga parcial |
| `src/hooks/useDashboardStats.ts` | 9 | Timeout de 4s curto demais + timer não limpo |
| `src/components/settings/ApiIntegrationsTab.tsx` | 10 | Badge de status não espera o `loading` |
| `src/components/dashboard/AnalyticsZone.tsx` | 11 | Texto sem truncamento estourando a largura do card |

Nenhuma task compartilha arquivo com outra — todas podem rodar em paralelo. A única ordem que importa é lógica de prioridade (críticos primeiro), não de dependência técnica.

---

## Task 1: Corrigir coluna errada no status do bot (CRÍTICO)

**Files:**
- Modify: `src/hooks/useBotStatus.ts:19,56,106`
- Modify: `src/components/settings/BotTab.tsx:38,607`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `useBotStatus()` continua retornando `{ view, groupsCount, errorMessage, loading, toggling, setMonitoring, refresh }` — assinatura inalterada, só o valor de `errorMessage` passa a vir correto.

- [ ] **Step 1: Confirmar a causa raiz no banco**

Rode (via MCP Supabase `execute_sql` ou `psql`, projeto `zuqaccivowbzdfrpgekz`):
```sql
select column_name from information_schema.columns where table_schema='public' and table_name='bot_configs' order by ordinal_position;
```
Expected: a lista contém `last_error` (não `error_message`).

- [ ] **Step 2: Corrigir `useBotStatus.ts`**

Em `src/hooks/useBotStatus.ts`, trocar as 3 ocorrências de `error_message` por `last_error`:

```typescript
// linha 19 — interface BotConfigRow
interface BotConfigRow {
  status?: string | null;
  ativo?: boolean | null;
  grupos_origem?: string[] | null;
  paused_reason?: string | null;
  last_error?: string | null;
}
```

```typescript
// linha 56 — select
        .select('status, ativo, grupos_origem, paused_reason, last_error')
```

```typescript
// linha 106 — retorno do hook
    errorMessage: row?.last_error ?? null,
```

- [ ] **Step 3: Corrigir `BotTab.tsx`**

Em `src/components/settings/BotTab.tsx` linha 38, a interface local também usa o nome errado. Trocar:

```typescript
  last_error?: string | null;
```

E na linha 607, trocar `config.error_message` por `config.last_error`:

```tsx
                  {config.last_error || 'Houve um problema de autenticação na sessão do Telegram.'}
```

Não mexer na linha 223 (`data.error_message`) — ali `data` vem da resposta de uma Edge Function (`bot_requests`/similar), que tem coluna `error_message` de verdade (confirmado: `bot_requests.error_message` existe no banco); é um objeto diferente de `bot_configs`.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0, sem erros TS.

- [ ] **Step 5: Validar em produção via query direta**

Depois do deploy (merge + Vercel), rode via `fetch` (pode ser no console do browser autenticado, ou via `curl` com o anon key + token de sessão):
```
GET {SUPABASE_URL}/rest/v1/bot_configs?select=status,ativo,grupos_origem,paused_reason,last_error&user_id=eq.{user_id}
```
Expected: `200 OK`, não mais `400 {"code":"42703"}`.

- [ ] **Step 6: Validar visualmente**

Via Chrome (`superpowers-chrome`, perfil `browser-user`): navegar pra `https://app.aflyo.com.br/dashboard`, aguardar carregar, tirar screenshot do card de status do bot.
Expected: card mostra "Bot ativo" (ou o estado real do bot), não mais "Não foi possível verificar o bot". Console (`get_console_messages`) sem `[useBotStatus] erro ao carregar`.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useBotStatus.ts src/components/settings/BotTab.tsx
git commit -m "fix(dashboard): corrige coluna error_message inexistente em bot_configs (usa last_error)"
```

---

## Task 2: Propagar reconexão de WhatsApp para `channels.status` (CRÍTICO)

**Files:**
- Modify: `supabase/functions/evolution-webhook/index.ts:90-106` (bloco `state === 'open'`)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: nenhuma interface nova — comportamento do webhook, sem mudar payload de entrada/saída (`{ success: true }` / erros como já existem).

- [ ] **Step 1: Ler o handler completo atual**

Confirmar em `supabase/functions/evolution-webhook/index.ts` que o bloco de `state === 'close'`/`'refused'` (linhas ~135-152) faz cascade pra `channels` via `whatsapp_groups.channel_id`, e que o bloco `state === 'open'` (linhas 90-105) não tem nada equivalente.

- [ ] **Step 2: Extrair o cascade pra uma função reutilizável**

No mesmo arquivo, acima do handler principal (antes do `Deno.serve` ou função exportada), adicionar:

```typescript
async function syncChannelsForInstance(
  supabaseAdmin: any,
  instanceId: string,
  status: 'connected' | 'disconnected',
) {
  const { data: localGroups } = await supabaseAdmin
    .from('whatsapp_groups')
    .select('channel_id')
    .eq('whatsapp_instance_id', instanceId)

  const channelIds = (localGroups || [])
    .map((g: { channel_id: string | null }) => g.channel_id)
    .filter((id: string | null): id is string => id !== null)

  if (channelIds.length > 0) {
    await supabaseAdmin
      .from('channels')
      .update({ status, last_sync: new Date().toISOString() })
      .in('id', channelIds)
    console.log(`[WEBHOOK] ${channelIds.length} canal(is) sincronizado(s) para status '${status}'.`)
  }
}
```

- [ ] **Step 3: Chamar o cascade também no reconnect**

Substituir o bloco existente das linhas ~134-152 (que só cascateava em `disconnected`/`error`) por chamadas explícitas nos dois sentidos, logo após o `update` de `whatsapp_instances` (depois do `if (updateErr) { ... }`):

```typescript
    // 4. Propagar o novo status pros canais de destino associados (nos dois
    // sentidos -- antes só desconectava em cascata, nunca reconectava).
    if (updatePayload.status === 'connected') {
      await syncChannelsForInstance(supabaseAdmin, instance.id, 'connected')
    } else if (updatePayload.status === 'disconnected' || updatePayload.status === 'error') {
      await syncChannelsForInstance(supabaseAdmin, instance.id, 'disconnected')
    }
```

Remover o bloco antigo (linhas ~134-152 na versão original) que fazia a mesma coisa só pro caminho de desconexão, já que a função nova cobre os dois casos.

- [ ] **Step 4: Deploy da Edge Function**

Run: `SUPABASE_ACCESS_TOKEN=<token do ambiente> supabase functions deploy evolution-webhook --project-ref zuqaccivowbzdfrpgekz`
Expected: deploy sem erro.

- [ ] **Step 5: Validar o cascade via simulação de banco**

Não é viável simular um evento real da Evolution API sem hardware. Validar a lógica via teste manual controlado (com autorização já dada pelo dono do projeto pra usar a conta de teste):
1. Escolher um `whatsapp_instances.id` de teste com `whatsapp_groups.channel_id` associado.
2. Rodar `UPDATE channels SET status='disconnected' WHERE id IN (...)` manualmente (simulando o estado pré-reconexão).
3. Invocar a função com um payload de teste simulando `event: 'connection.update', data: { status: 'open' }` pro `instanceName` daquela instância (via `curl` direto na URL da function, com o secret de webhook correto).
4. Conferir com `SELECT status FROM channels WHERE id IN (...)` que voltou pra `'connected'`.

Expected: canais associados voltam a `status='connected'` depois do evento simulado de reconexão.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/evolution-webhook/index.ts
git commit -m "fix(evolution): propaga reconexao de whatsapp para channels.status (cascade faltava no sentido open)"
```

---

## Task 3: Persistir resultado do teste de conexão Telegram (ALTO)

**Files:**
- Modify: `src/pages/Channels.tsx` (função `handleTestTelegram`, linhas ~118-140, dentro do componente de card do canal)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: nenhuma prop nova exposta a outros componentes — mudança interna ao componente de card.

- [ ] **Step 1: Localizar o componente e confirmar as props disponíveis**

Em `src/pages/Channels.tsx`, o card de canal individual (função que contém `handleTestTelegram`, por volta da linha 60-140) recebe `channel` como prop. Confirmar se esse componente também recebe (ou precisa receber) uma função de callback tipo `onStatusChange(channelId, newStatus)` vinda do componente pai (que já tem `supabase` importado e o array `channels` em estado) — se não existir, será adicionado no Step 2.

- [ ] **Step 2: Persistir o resultado do teste em `channels.status`**

Modificar `handleTestTelegram` pra, depois do resultado do teste, gravar no banco e notificar o pai pra atualizar o estado local (em vez de só setar `testResult` local que expira em alguns segundos):

```typescript
  const handleTestTelegram = async () => {
    if (channel.type !== 'telegram') return;
    const botToken = channel.metadata?.bot_token;
    const chatId = channel.identifier;
    if (!botToken || !chatId) {
      setTestResult('error');
      setTestError('Configuração incompleta.');
      return;
    }
    setTesting(true);
    setTestResult('idle');
    setTestError(null);
    const result = await testTelegramConnection(botToken, chatId);
    setTesting(false);

    const newStatus = result.success ? 'connected' : 'error';
    if (channel.status !== newStatus) {
      const { error: updateErr } = await supabase
        .from('channels')
        .update({ status: newStatus, last_sync: new Date().toISOString() })
        .eq('id', channel.id);
      if (!updateErr) {
        onStatusChange(channel.id, newStatus);
      }
    }

    if (result.success) {
      setTestResult('success');
      setTimeout(() => setTestResult('idle'), 4000);
    } else {
      setTestResult('error');
      setTestError(result.error ?? 'Erro desconhecido.');
      setTimeout(() => { setTestResult('idle'); setTestError(null); }, 6000);
    }
  };
```

- [ ] **Step 3: Fiar o callback `onStatusChange` do pai até o card**

No componente pai (que renderiza a lista de cards e tem `setChannels`), adicionar a prop `onStatusChange` no card e implementar:

```typescript
  const handleChannelStatusChange = (id: string, newStatus: string) => {
    setChannels(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
  };
```

E passar `onStatusChange={handleChannelStatusChange}` na renderização do card de canal (junto dos outros handlers já passados, como `onRemove`/`onToggleStatus`).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 5: Validar visualmente**

Via Chrome: navegar pra `/channels`, achar um canal Telegram, clicar em "Testar conexão".
Expected: se o teste falhar, o badge do card muda pra refletir o erro (não só o toast temporário) e isso persiste depois de recarregar a página (confirma que gravou no banco).

- [ ] **Step 6: Commit**

```bash
git add src/pages/Channels.tsx
git commit -m "fix(channels): persiste resultado do teste de conexao Telegram em channels.status"
```

---

## Task 4: Corrigir métrica do card "Canais" no Dashboard (CRÍTICO)

**Files:**
- Modify: `src/pages/Dashboard.tsx:59-61`

**Interfaces:**
- Consumes: `limits` (objeto `PlanLimits` de `getPlanLimits`, já importado) — usa os campos `maxWhatsappGroups`/`maxTelegramGroups` que já existem no tipo.
- Produces: nenhuma interface nova — `channelLimit`/`channelLimited`/`channelsAtLimit` continuam com os mesmos nomes e tipos passados pra `<OperationalMetrics>`.

- [ ] **Step 1: Corrigir a fórmula**

Em `src/pages/Dashboard.tsx`, trocar:

```typescript
  const channelLimit = limits.maxWhatsappConnections + limits.maxTelegramConnections;
  const channelLimited = limits.maxWhatsappConnections !== Infinity && channelLimit > 0;
  const channelsAtLimit = channelLimited && connectedChannels >= channelLimit;
```

por:

```typescript
  // Este card mostra CANAIS DE DESTINO conectados (grupos/chats/servidores
  // onde o bot dispara -- WhatsApp+Telegram+Discord), nao numeros/instancias.
  // O limite certo pra essa metrica e maxWhatsappGroups + maxTelegramGroups
  // (limite de instancias, maxWhatsappConnections/maxTelegramConnections, e
  // outra coisa e nao deve entrar aqui -- ver BUG-2 da auditoria 2026-09-17).
  const channelLimit = limits.maxWhatsappGroups + limits.maxTelegramGroups;
  const channelLimited = limits.maxWhatsappGroups !== Infinity && channelLimit > 0;
  const channelsAtLimit = channelLimited && connectedChannels >= channelLimit;
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Validar via query direta**

Confirmar no banco (projeto `zuqaccivowbzdfrpgekz`) que, pro plano `pro`, `max_whatsapp_dest_groups + max_telegram_dest_groups = 24` e que isso bate com `maxWhatsappGroups + maxTelegramGroups` em `src/config/plans.ts` pro plano `pro` (12+12=24).

- [ ] **Step 4: Validar visualmente**

Via Chrome: navegar pra `/dashboard` logado na conta de teste (plano Pro, 5 canais conectados).
Expected: card "CANAIS" mostra "5 / 24", sem o aviso "Limite atingido" (barra verde, não laranja).

- [ ] **Step 5: Commit**

```bash
git add src/pages/Dashboard.tsx
git commit -m "fix(dashboard): usa limite de canais de destino (nao de instancias) no card Canais"
```

---

## Task 5: Corrigir header que some ao rolar (ALTO)

**Files:**
- Modify: `src/components/Layout.tsx:34,90`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: nenhuma — só CSS/classes.

- [ ] **Step 1: Remover `overflow-x-hidden` do wrapper raiz**

Em `src/components/Layout.tsx` linha 34, trocar:

```tsx
    <div className="min-h-screen bg-surface-1 flex text-ink relative overflow-x-hidden">
```

por:

```tsx
    <div className="min-h-screen bg-surface-1 flex text-ink relative">
```

O `overflow-x-hidden` que sobra em `<main>` (linha 90, já existente: `className="flex-1 min-w-0 p-4 md:p-6 overflow-x-hidden"`) é suficiente pra conter overflow horizontal sem interferir no sticky do header, porque `<main>` não é ancestral do `<TopBar>` (são irmãos dentro do mesmo `<div className="flex-1 ...">`).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Validar visualmente que o header gruda**

Via Chrome: navegar pra `/channels` (página com bastante conteúdo), rolar pra baixo ~600px, e checar:
```javascript
JSON.stringify(document.querySelector('header').getBoundingClientRect())
```
Expected: `top` deve ser `0` (ou muito próximo, considerando a faixa de acesso expirado se existir), não um valor negativo grande.

- [ ] **Step 4: Validar que não voltou overflow horizontal**

Testar em viewport 375px (`set_viewport` ou `eval` com `window.resizeTo`) em `/dashboard`, `/channels`, `/history`.
Expected: sem barra de scroll horizontal na página (checar `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2` via eval).

- [ ] **Step 5: Commit**

```bash
git add src/components/Layout.tsx
git commit -m "fix(layout): remove overflow-x-hidden do wrapper raiz que quebrava o sticky do header"
```

---

## Task 6: Corrigir imagens gigantes no Histórico (ALTO)

**Files:**
- Modify: `src/components/shared/ProductImage.tsx:48`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `<ProductImage className="...">` continua aceitando `className` normalmente — só passa a exigir que o chamador defina largura/altura (todos os 4 chamadores atuais já fazem isso, confirmado).

- [ ] **Step 1: Remover as classes de tamanho hardcoded da base**

Em `src/components/shared/ProductImage.tsx` linha 48, trocar:

```tsx
      className={`block w-full h-full object-cover ${className}`}
```

por:

```tsx
      className={`block ${className}`}
```

(`object-cover` já vem incluído em todas as chamadas atuais via `className`, então não perde comportamento; quem passar uma className sem `object-cover`/sem tamanho no futuro precisa incluir, isso já é esperado do componente.)

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Validar visualmente nos 3 lugares que usam o componente com tamanho fixo/variável**

Via Chrome: verificar `/history` (thumbnails 48x48), `/offers` ou `/dashboard` (cards com `w-full h-full`), e a vitrine pública (`PublicPage.tsx`).
Expected: em `/history`, `getComputedStyle(img).width` e `.height` devem ser `48px` (não ~800px); nos outros lugares, imagens continuam preenchendo o card normalmente (sem regressão).

- [ ] **Step 4: Commit**

```bash
git add src/components/shared/ProductImage.tsx
git commit -m "fix(product-image): remove classes de tamanho hardcoded que conflitavam com o chamador"
```

---

## Task 7: Logo invisível em dark mode (ALTO)

**Files:**
- Modify: `src/components/Sidebar.tsx:52-57`

**Interfaces:**
- Consumes: `useTheme` de `next-themes` (já usado em outros componentes do app, ex. `AnalyticsZone.tsx:4,47`).
- Produces: nenhuma — troca só a `src` da imagem.

- [ ] **Step 1: Importar `useTheme` e trocar a logo condicionalmente**

Em `src/components/Sidebar.tsx`, adicionar o import:

```typescript
import { useTheme } from 'next-themes';
```

Dentro do componente `Sidebar`, antes do `return`:

```typescript
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? '/brand/logo-white.png' : '/brand/logo-primary.png';
```

E trocar a linha 53 (`src="/brand/logo-primary.png"`) por:

```tsx
          src={logoSrc}
```

- [ ] **Step 2: Confirmar que `/brand/logo-white.png` existe e está legível**

Run: `ls -la public/brand/logo-white.png` (ou `Get-ChildItem` no PowerShell)
Expected: arquivo existe.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Validar visualmente nos dois temas**

Via Chrome: em `/dashboard`, alternar o toggle de tema no TopBar (claro → escuro → claro), tirando screenshot da sidebar em cada estado.
Expected: a wordmark "aflyo" completa (texto + símbolo) aparece legível nos dois temas.

- [ ] **Step 5: Commit**

```bash
git add src/components/Sidebar.tsx
git commit -m "fix(sidebar): usa logo-white.png no tema escuro (wordmark ficava invisivel)"
```

---

## Task 8: Investigar e corrigir divergência na contagem de ofertas (ALTO)

**Files:**
- Modify: `src/hooks/useOffers.ts`
- Modify: `src/services/OfferService.ts` (se a causa raiz estiver ali)

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `useOffers()` continua retornando `{ offers, loading, error, refresh, deleteOffer, deleteAllOffers, toggleStatus }` — assinatura inalterada.

- [ ] **Step 1: Reproduzir e instrumentar**

Antes de mudar qualquer lógica, adicionar um log temporário em `OfferService.getOffers` (`src/services/OfferService.ts`, dentro do método, logo após o `await`):

```typescript
    if (error) throw error;
    console.log(`[OfferService.getOffers] retornou ${data?.length ?? 0} registros para user ${userId}`);
    return data;
```

Fazer o build, subir pra um preview do Vercel OU rodar local (`npm run dev`) logado na conta de teste, abrir `/offers`, e comparar o número logado no console com:
```sql
select count(*) from offers where user_id = '<user_id>';
```
(via MCP Supabase `execute_sql`, projeto `zuqaccivowbzdfrpgekz`)

- [ ] **Step 2: Diagnosticar com base no resultado do Step 1**

Dois cenários possíveis:

**Cenário A** — o log mostra 28 (o fetch já traz tudo certo), e o problema é client-side depois disso (ex: algum filtro aplicado incorretamente no componente `Offers.tsx`, ou um segundo `loadOffers()` disparado com `force=false` que reusa um estado parcial de uma renderização anterior por causa do guard `lastLoadedUserIdRef.current === user.id && offers.length > 0` em `useOffers.ts:19`). Se for isso, corrigir removendo esse guard prematuro (ele existe pra evitar loop de refetch, mas usar só a dependência do `useEffect` — `[user, loadOffers]` — já é suficiente, já que `loadOffers` só muda quando `user` muda; o guard extra é redundante e mascara recargas legítimas):

```typescript
  const loadOffers = useCallback(async (force = false) => {
    if (!user || !user.id) {
      setLoading(false);
      return;
    }

    if (!force && lastLoadedUserIdRef.current === user.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await OfferService.getOffers(user.id);
      setOffers(data || []);
      lastLoadedUserIdRef.current = user.id;
    } catch (err) {
      console.error('[useOffers] Erro ao carregar ofertas:', err);
      setError(err);
      lastLoadedUserIdRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [user]);
```

(Removida a condição `&& offers.length > 0` do guard, e `offers.length` das dependências do `useCallback` — a versão antiga permitia, em teoria, um retorno antecipado enganoso logo após um `setOffers([])` de uma corrida anterior deixar `offers.length === 0`, forçando um novo fetch redundante; mas o inverso -- pular um refetch necessário -- não deveria acontecer com esse guard tirado. Sem mais essa dependência, `loadOffers` deixa de ser recriado a cada mudança em `offers`, eliminando qualquer race de re-subscrição do `useEffect`.)

**Cenário B** — o log já mostra 25 (o `.select('*')` do backend já retorna 25). Nesse caso, o problema é RLS ou algum estado real dos 3 registros faltando (`status` diferente do esperado, coluna `user_id` nula/errada nesses 3, etc). Rodar:
```sql
select id, name, status, user_id from offers where user_id = '<user_id>' order by created_at desc;
```
e comparar manualmente com o que a vitrine pública mostra, pra achar quais 3 registros somem e por quê. Corrigir a causa específica encontrada (pode ser um bug de dado, não de código — nesse caso, documentar o achado real em vez de forçar um fix de código que não se aplica).

- [ ] **Step 2b: Remover a instrumentação temporária**

Depois de identificar e corrigir a causa raiz, remover o `console.log` adicionado no Step 1 (ou trocar por um log condicional a uma flag de debug, se fizer sentido manter permanentemente — decisão do implementador com base no que foi achado).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Validar visualmente**

Via Chrome: `/offers`, `/dashboard`, e a vitrine pública do mesmo usuário — comparar as 3 contagens.
Expected: as 3 telas mostram o mesmo número de ofertas ativas.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useOffers.ts src/services/OfferService.ts
git commit -m "fix(offers): corrige divergencia de contagem entre /offers, dashboard e vitrine publica"
```

---

## Task 9: Aumentar timeout e corrigir vazamento de timer no Dashboard (MÉDIO)

**Files:**
- Modify: `src/hooks/useDashboardStats.ts:58-84`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: `useDashboardStats()` continua retornando o mesmo shape de `stats` — sem mudança de interface.

- [ ] **Step 1: Aumentar o timeout e limpar o timer corretamente**

Em `src/hooks/useDashboardStats.ts`, trocar o `fetchWithFallback` (linhas 58-73) por uma versão que limpa o `setTimeout` quando a query resolve antes do timeout (evita timer pendente rodando desnecessariamente em background) e usa um timeout maior:

```typescript
      const fetchWithFallback = async (queryPromise: any, tableName: string, timeoutMs = 10000) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        try {
          const res = await Promise.race([
            Promise.resolve(queryPromise),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error(`Timeout ao obter dados da tabela ${tableName}`)), timeoutMs);
            }),
          ]);
          clearTimeout(timeoutId!);
          if (res.error) {
            console.error(`[DASHBOARD_STATS_ERROR] Erro ao buscar dados da tabela ${tableName}:`, res.error);
            return { data: [], error: res.error, isFallback: true, count: 0 };
          }
          return { data: res.data || [], error: null, isFallback: false, count: res.count ?? 0 };
        } catch (e: any) {
          clearTimeout(timeoutId!);
          console.error(`[DASHBOARD_STATS_ERROR] Exceção ou timeout na busca da tabela ${tableName}:`, e);
          return { data: [], error: e, isFallback: true, count: 0 };
        }
      };
```

E atualizar as 5 chamadas (linhas 77-84) pra usar o novo default (remover o `4000` explícito de cada uma, já que o default do parâmetro já sobe pra `10000`):

```typescript
      const [offersRes, channelsRes, historyRes, dispatchCountRes, clicksRes] = await Promise.all([
        fetchWithFallback(supabase.from('offers').select('*').eq('user_id', user.id), 'offers'),
        fetchWithFallback(supabase.from('channels').select('*').eq('user_id', user.id), 'channels'),
        fetchWithFallback(supabase.from('history').select('*').eq('user_id', user.id).order('sent_at', { ascending: false }).limit(5), 'history'),
        fetchWithFallback(supabase.from('history').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('sent_at', thirtyDaysAgo.toISOString()), 'history_count'),
        fetchWithFallback(supabase.from('clicks').select('created_at, source, offer_id').eq('user_id', user.id).gte('created_at', thirtyDaysAgo.toISOString()), 'clicks'),
      ]);
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Validar visualmente**

Via Chrome: `/dashboard`, aguardar carregar, checar console (`get_console_messages`).
Expected: sem `[DASHBOARD_STATS_ERROR]` na carga normal; se aparecer, precisa ser um erro real (não timeout), já que 10s é folga generosa pra uma query que roda em <300ms isolada.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useDashboardStats.ts
git commit -m "fix(dashboard): aumenta timeout de queries e limpa timer pendente no fetchWithFallback"
```

---

## Task 10: Corrigir flash de "Não configurado" na aba API (MÉDIO)

**Files:**
- Modify: `src/components/settings/ApiIntegrationsTab.tsx` (bloco do badge, por volta da linha 177-211)

**Interfaces:**
- Consumes: `loading` (state já existente no componente, linha 22).
- Produces: nenhuma — só ajusta a condição de render.

- [ ] **Step 1: Ler o bloco atual do badge**

Confirmar em `src/components/settings/ApiIntegrationsTab.tsx` que `activeKey = keys.find(k => k.status === 'active')` (linha 177) roda incondicionalmente, e que o JSX do badge (linhas ~197-211) usa `activeKey` sem checar `loading`.

- [ ] **Step 2: Gatear o badge pelo `loading`**

Envolver o bloco do badge (o `<div>`/ícone com o texto "Ativo"/"Não configurado", linhas ~195-215) numa condicional: enquanto `loading` for `true`, renderizar um skeleton neutro em vez do badge real. Exemplo de estrutura (adaptar aos nomes exatos de classe já usados no arquivo pra manter o visual consistente):

```tsx
{loading ? (
  <div className="w-11 h-11 rounded-xl bg-surface-2 animate-pulse flex-shrink-0" />
) : (
  <div className={/* classe condicional existente baseada em activeKey */}>
    {/* ícone existente */}
  </div>
)}
```

E o texto do status ao lado (que hoje mostra `{activeKey ? 'Ativo' : 'Não configurado'}`) deve virar, enquanto `loading`:

```tsx
{loading ? (
  <div className="h-4 w-24 bg-surface-2 rounded animate-pulse" />
) : (
  <span>{activeKey ? 'Ativo' : 'Não configurado'}</span>
)}
```

Manter o resto do bloco (botões de ação, etc.) igual, só adicionando o guard de `loading` nos elementos que mostram o status/badge antes dos dados chegarem.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 4: Validar visualmente**

Via Chrome: `/integrations`, clicar na aba "API & Integrações", observar os primeiros ~1-2 segundos (pode ser necessário throttling de rede ou apenas observar rápido com screenshots em sequência).
Expected: skeleton neutro aparece primeiro, badge "Ativo"/"Não configurado" só aparece depois que os dados reais chegam — nunca mostra "Não configurado" incorretamente antes de resolver.

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/ApiIntegrationsTab.tsx
git commit -m "fix(api-integrations): adiciona skeleton de loading pro badge de status (evita flash de nao configurado)"
```

---

## Task 11: Corrigir texto cortado no card "Origem de Tráfego" (BAIXO)

**Files:**
- Modify: `src/components/dashboard/AnalyticsZone.tsx:161-172`

**Interfaces:**
- Consumes: nada de outra task.
- Produces: nenhuma — só CSS.

- [ ] **Step 1: Adicionar `min-w-0` e `truncate`**

Em `src/components/dashboard/AnalyticsZone.tsx`, trocar o bloco (linhas 161-172):

```tsx
            <div className="pt-3 border-t border-line flex items-center justify-between">
              <div className="text-left">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Destaque</p>
                <p className="text-xs font-semibold text-mint-800 capitalize mt-0.5">
                  {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider">Marketplace</p>
                <p className="text-xs font-semibold text-ink capitalize mt-0.5">{topMarketplace.toUpperCase()}</p>
              </div>
            </div>
```

por:

```tsx
            <div className="pt-3 border-t border-line flex items-center justify-between gap-2">
              <div className="text-left min-w-0">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider truncate">Destaque</p>
                <p className="text-xs font-semibold text-mint-800 capitalize mt-0.5 truncate" title={topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}>
                  {topSource === 'direct' ? 'Página Pública' : topSource.toUpperCase()}
                </p>
              </div>
              <div className="text-right min-w-0">
                <p className="text-[10px] text-ink-tertiary font-semibold uppercase tracking-wider truncate">Marketplace</p>
                <p className="text-xs font-semibold text-ink capitalize mt-0.5 truncate" title={topMarketplace.toUpperCase()}>{topMarketplace.toUpperCase()}</p>
              </div>
            </div>
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Validar visualmente em 1280px**

Via Chrome: `/dashboard` em 1280px, com dados de cliques existentes (conta de teste já tem), screenshot do card "Origem de Tráfego".
Expected: "MARKETPLACE" e o valor não cortam mais na borda do card (truncam com `...` só se realmente não couber, com `title` mostrando o texto completo no hover).

- [ ] **Step 4: Commit**

```bash
git add src/components/dashboard/AnalyticsZone.tsx
git commit -m "fix(dashboard): evita texto cortado no card Origem de Trafego em telas estreitas"
```

---

## Ordem de execução recomendada

**Onda 1 (paralelo, críticos):** Tasks 1, 2, 4 — nenhuma compartilha arquivo.
**Onda 2 (paralelo, críticos/altos restantes):** Task 3, 5, 6, 7, 8 — nenhuma compartilha arquivo entre si nem com a Onda 1.
**Onda 3 (paralelo, médios/baixo):** Tasks 9, 10, 11.

Como nenhuma task toca o mesmo arquivo que outra, as 3 ondas podem, na prática, ser dispatchadas quase todas de uma vez — a separação em ondas é só por prioridade de review (críticos primeiro), não por dependência técnica real.

Depois de todas as tasks mergeadas: rodar `npm run build` na `main` uma última vez, e fazer uma passada final de QA visual (Chrome, conta de teste) pelas rotas: `/dashboard`, `/channels`, `/integrations`, `/history`, `/offers`, `/settings`, vitrine pública — confirmando que os 11 bugs não reaparecem e que nenhuma correção introduziu regressão visual.
