# SP1 — Direitos de plano no banco (fonte única) + Starter canônico + selo Aflyo na vitrine

Data: 2026-08-30
Status: aprovado (design), aguardando spec review

## Contexto

Os direitos de cada plano hoje vivem em dois lugares que se desalinham:

- **Front:** `src/config/plans.ts` (`PLAN_CONFIGS`) — usado por `getPlanLimits`, `canCreateOffer`, `canAddSourceGroup`, `hasFeature`, etc.
- **Banco:** triggers PL/pgSQL com os números escritos à mão em `CASE plan WHEN 'starter' THEN … END`, espalhados por 2 migrations (`20260821000000_enforce_plan_limits.sql` e `20260830000000_recalibrate_plan_limits_v2.sql`).

Sintomas do desalinhamento:

- O trigger `enforce_offer_limit` ainda barra ofertas em `starter → 20000`, enquanto a decisão de produto é **ofertas ilimitadas em todos os planos**.
- Cada recalibração de limite exige editar `CASE` em N funções + o `PLAN_CONFIGS`, sem nada que garanta que bateram.
- `advancedAnalytics` e `customTemplates` só existem no front; o banco não sabe o que o plano concede.

## Objetivo

1. Criar `public.plan_limits` — uma linha por plano — como **fonte da verdade do enforcement server-side**.
2. Refatorar os triggers de limite pra lerem dessa tabela em vez de `CASE` hardcoded.
3. Remover o limite de ofertas de vez (todos os planos ilimitado) e **toda menção a "20.000"** ou a qualquer teto de ofertas na UI.
4. Alinhar o espelho no front (`PLAN_CONFIGS`) e adicionar um script que avisa quando ele diverge do banco.
5. Ajustar os valores do plano **Starter** pro que foi definido com o usuário (abaixo).
6. Colocar o **selo "Aflyo"** na vitrine pública com gate: aparece pra free/Starter/Pro (sem opção de remover), some pro Business. Ver §9.

### Valores canônicos por plano

Valores fechados com o usuário em 2026-08-30 (tabela comparativa Starter / Profissional / Business). `pro` = plano "Profissional", `enterprise` = plano "Business".

| coluna | free | **starter** | **pro** | **enterprise** |
|---|---|---|---|---|
| `max_source_groups` (grupos de origem monitorados) | 0 | **2** | **6** | **15** |
| `max_whatsapp_instances` (números de WhatsApp) | 0 | **1** | **2** | **4** |
| `max_whatsapp_dest_groups` (grupos de destino WhatsApp) | 0 | **5** | **12** | **20** |
| `max_telegram_dest_groups` (grupos/canais de destino Telegram) | 0 | **5** | **12** | **20** |
| `allow_shortener` (encurtador automático próprio) | false | **false** | **true** | **true** |
| `allow_analytics` (painel de analytics / cliques visíveis) | false | **false** | **true** | **true** |
| `allow_scheduling` (agendamento de disparo) | false | **true** | **true** | **true** |
| `remove_branding` (remove marca Aflyo da vitrine) | false | **false** | **false** | **true** |

> `remove_branding` só no Business (`enterprise`). Free, Starter e Profissional exibem o selo "Aflyo" na vitrine pública **sem opção de remover** — não há toggle em lugar nenhum. Ver §9.

- **Ofertas:** ilimitado em todos os planos → sem coluna na tabela, sem trigger.
- **Templates:** editáveis em todos os planos (1 template padrão por canal, como já é hoje) → sem coluna na tabela; o conceito `customTemplates` some do front. A linha "Templates personalizados: 3 / 10 / 30" da tabela comparativa foi **descartada** pelo usuário.
- **Suporte prioritário** (só Business, na tabela comparativa): é diferenciação de marketing, sem comportamento no app → vira só um bullet em `FEATURES_BY_PLAN.enterprise`, **sem coluna** em `plan_limits`.
- `maxTelegramConnections` (só front, sem trigger): free 0 / starter 1 / pro 2 / enterprise 5 — herdado, a tabela comparativa não distingue "conexão" de "grupo de destino" Telegram.

### Não-objetivos (ficam pra SP2/SP3)

- Ofuscar/bloquear analytics e cliques na UI para o Starter (SP2).
- Bloquear os toggles de encurtador na aba Templates + CTA de upgrade (SP2).
- Trocar o host do encurtador pra `go.aflyo.com.br` (SP2 — infra já pronta pelo usuário; falta só conferir a Edge Function de disparo).
- Repaginar o Dashboard (SP3). Este SP só **remove o card "Ofertas"** e faz um quick-fix no "Limite atingido" do card "Canais".
- Implementar a feature de agendamento em si (não existe; aqui só se registra o direito `allow_scheduling`).

## Arquitetura

**Fonte da verdade dupla, com o banco mandando no que importa:**

- `public.plan_limits` é a autoridade para o **enforcement** (triggers). É o que impede abuso via API/PostgREST direto.
- `src/config/plans.ts` (`PLAN_CONFIGS`) continua sendo o que o front lê para **UX** (mostrar limites, decidir CTA de upgrade, desabilitar botão). Não vale a pena um round-trip ao banco no boot só pra isso.
- Um script `npm run check:plan-limits` compara os dois e sai com código ≠ 0 se divergirem. Roda localmente antes de PR; não é unit test (respeita a regra "sem novos unit tests de componente").

```
enforcement real ──> public.plan_limits ──(SELECT nos triggers)──> INSERT/UPDATE barrado
UX / telas       ──> PLAN_CONFIGS (plans.ts)  ──(espelho, verificado por script)──┘
```

## Mudanças

### 1. Migration `supabase/migrations/20260831000000_plan_limits_table.sql`

```sql
-- Tabela lookup dos direitos por plano. Fonte da verdade do enforcement.
CREATE TABLE public.plan_limits (
  plan text PRIMARY KEY
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  max_source_groups        int  NOT NULL DEFAULT 0,
  max_whatsapp_instances   int  NOT NULL DEFAULT 0,
  max_whatsapp_dest_groups int  NOT NULL DEFAULT 0,
  max_telegram_dest_groups int  NOT NULL DEFAULT 0,
  allow_shortener  boolean NOT NULL DEFAULT false,
  allow_analytics  boolean NOT NULL DEFAULT false,
  allow_scheduling boolean NOT NULL DEFAULT false,
  remove_branding  boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;

-- Leitura liberada pra qualquer usuário autenticado (o front pode consultar).
CREATE POLICY "plan_limits leitura autenticada"
  ON public.plan_limits FOR SELECT
  TO authenticated
  USING (true);
-- Sem policy de INSERT/UPDATE/DELETE: só service_role (migrations/admin) escreve.

INSERT INTO public.plan_limits
  (plan, max_source_groups, max_whatsapp_instances, max_whatsapp_dest_groups,
   max_telegram_dest_groups, allow_shortener, allow_analytics, allow_scheduling, remove_branding)
VALUES
  ('free',       0,  0,  0,  0, false, false, false, false),
  ('starter',    2,  1,  5,  5, false, false, true,  false),
  ('pro',        6,  2, 12, 12, true,  true,  true,  false),
  ('enterprise',15,  4, 20, 20, true,  true,  true,  true)
ON CONFLICT (plan) DO UPDATE SET
  max_source_groups        = EXCLUDED.max_source_groups,
  max_whatsapp_instances   = EXCLUDED.max_whatsapp_instances,
  max_whatsapp_dest_groups = EXCLUDED.max_whatsapp_dest_groups,
  max_telegram_dest_groups = EXCLUDED.max_telegram_dest_groups,
  allow_shortener  = EXCLUDED.allow_shortener,
  allow_analytics  = EXCLUDED.allow_analytics,
  allow_scheduling = EXCLUDED.allow_scheduling,
  remove_branding  = EXCLUDED.remove_branding,
  updated_at = now();
```

A mesma migration recria a view `public.public_profiles` adicionando `hide_branding` (§9) — mantendo as 15 colunas atuais 1:1, `security_invoker = false` e o `GRANT SELECT … TO anon, authenticated`.

### 2. Migration `supabase/migrations/20260831000100_triggers_read_plan_limits.sql`

Reescreve as 3 funções de enforcement pra puxarem os caps de `plan_limits`. Padrão comum:

```sql
CREATE OR REPLACE FUNCTION public.enforce_whatsapp_instance_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_plan text; v_count int; v_max int;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  SELECT max_whatsapp_instances INTO v_max
    FROM public.plan_limits WHERE plan = COALESCE(v_plan, 'free');
  v_max := COALESCE(v_max, 0);   -- plano desconhecido = trata como free

  SELECT count(*) INTO v_count FROM public.whatsapp_instances
    WHERE user_id = NEW.user_id AND status <> 'disconnected';

  IF v_count >= v_max
     AND (TG_OP = 'INSERT'
          OR (TG_OP = 'UPDATE' AND OLD.status = 'disconnected' AND NEW.status <> 'disconnected')) THEN
    RAISE EXCEPTION 'Limite de números de WhatsApp do plano % atingido (máximo: %).',
      COALESCE(v_plan, 'free'), v_max USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;
```

Mesma transformação para:

- `enforce_channel_limit` — lê `max_whatsapp_dest_groups` / `max_telegram_dest_groups` conforme `NEW.type`.
- `enforce_source_group_limit` — lê `max_source_groups`.

Os `CREATE TRIGGER` não mudam (só as funções). Nomes de trigger a manter exatamente: `whatsapp_instances_limit`, `channels_channel_limit`, `bot_configs_source_group_limit` (do `v2`).

### 3. Migration `supabase/migrations/20260831000200_drop_offer_limit.sql`

```sql
DROP TRIGGER IF EXISTS offers_plan_limit ON public.offers;
DROP TRIGGER IF EXISTS offers_channel_limit ON public.offers; -- nome antigo, defensivo
DROP FUNCTION IF EXISTS public.enforce_offer_limit();
```

Ofertas passam a ser ilimitadas em qualquer caminho de escrita (front, `public-api`, PostgREST direto).

### 4. `src/config/plans.ts`

- Comentário no topo do arquivo: `// ESPELHO de public.plan_limits (migration 20260831000000). Mudou aqui? Rode `npm run check:plan-limits` e crie a migration correspondente.`
- `PlanLimits`: remove `customTemplates`; adiciona `allowShortener: boolean`. `maxOffers` permanece no tipo (compat) mas todos os planos passam a `Infinity`.
- `PLAN_CONFIGS`:
  - `free`: `maxOffers: Infinity`, `allowShortener: false`, `advancedAnalytics: false`, `removeBranding: false`, `futureScheduling: false`.
  - `starter`: `maxOffers: Infinity`, `allowShortener: false`, `advancedAnalytics: false`, `futureScheduling: true`, `removeBranding: false`. Grupos: `maxSourceGroups: 2`, `maxWhatsappConnections: 1`, `maxTelegramConnections: 1`, `maxWhatsappGroups: 5`, `maxTelegramGroups: 5`.
  - `pro`: `maxOffers: Infinity`, `allowShortener: true`, `advancedAnalytics: true`, `futureScheduling: true`, `removeBranding: false`. Grupos (`maxSourceGroups / maxWhatsappConnections / maxTelegramConnections / maxWhatsappGroups / maxTelegramGroups`): `6 / 2 / 2 / 12 / 12`.
  - `enterprise`: `maxOffers: Infinity`, `allowShortener: true`, `advancedAnalytics: true`, `futureScheduling: true`, `removeBranding: true`. Grupos: `15 / 4 / 5 / 20 / 20`.
  - O branch `!FEATURES.billing` de `getPlanLimits` ganha `allowShortener: true` e perde `customTemplates`.
- `canCreateOffer`: passa a `return true;` (comentário: ofertas ilimitadas — mantida por compatibilidade com os callers). Callers em `useOfferForm.ts`, `Offers.tsx` não mudam.
- `hasFeature`: a assinatura já exclui as chaves numéricas; após remover `customTemplates`, as chaves válidas passam a ser `removeBranding | advancedAnalytics | futureScheduling | allowShortener`.

### 5. `src/config/planCatalog.ts`

`FEATURES_BY_PLAN.starter`:

- Remove `'Até 20.000 ofertas ativas'`.
- `'Templates de mensagem customizados'` → `'Personalize o template de mensagem'`.
- Sem menção a teto de ofertas em nenhum plano.

`FEATURES_BY_PLAN.pro` (números da tabela comparativa 2026-08-30):

- "Monitora até 5 grupos de origem" → "6"; "até 10 grupos de WhatsApp" → "12"; "até 10 grupos do Telegram" → "12".
- Linha de templates com número → `'Personalize o template de mensagem'`.

`FEATURES_BY_PLAN.enterprise`:

- "Conecta até 3 números de WhatsApp" → "4"; "até 15 grupos de WhatsApp" → "20"; "até 15 grupos do Telegram" → "20".
- Linha de templates com número → `'Personalize o template de mensagem'`.
- Adiciona `'Suporte prioritário'`.

"Ofertas ilimitadas", se já for bullet de `pro`/`enterprise`, mantém.

### 6. `src/components/settings/TemplatesTab.tsx`

Remove a dependência de `limits.customTemplates` (o editor de template fica sempre liberado):

- Bloco `{!limits.customTemplates && (…)}` (linha ~464): remover o aviso de "recurso não disponível no seu plano".
- Todos os `!limits.customTemplates ? …` nas `className` / `disabled` / `onClick` (linhas ~527–621): simplificar removendo essa condição (mantendo as outras: `loadingTemplates`, `savingTemplates`, validação, etc.).
- `getPlanLimits(user?.plan)` continua importado — será reaproveitado no SP2 para `limits.allowShortener` nos toggles do encurtador. Neste SP não se mexe nos toggles ainda.

### 7. `src/pages/Dashboard.tsx`

- **Remover o card "Ofertas"** inteiro (o `<Card>` de "Ofertas Ativas vs Limites", ~linhas 190–210) e as variáveis `offersLimited` / `offersAtLimit`. Ofertas não têm teto → nada a mostrar.
- Card "Canais": manter, mas o quick-fix no "Limite atingido":
  - `channelsAtLimit` só é `true` quando `channelLimit > 0 && connectedChannels >= channelLimit`. Com `channelLimit <= 0` (plano desconhecido / ainda carregando), nunca mostra "Limite atingido" nem a barra âmbar.
  - `getPlanLimits(stats.profile?.plan || user?.plan || 'free')` — sem mudança de fonte, mas o guard `channelLimit > 0` cobre o estado transiente que gera o "0/0 · Limite atingido" da foto reportada.
- A repaginação real do Dashboard (KPIs, semântica do card Canais, seção de cliques) é o SP3.

### 8. `package.json` + `scripts/check-plan-limits.mjs`

- Novo script Node (sem dependência nova): lê `PLAN_CONFIGS` de `src/config/plans.ts` (via import dinâmico ou parse) e a última migration `2026*plan_limits*.sql`, compara os campos equivalentes, imprime as divergências e `process.exit(1)` se houver.
- `package.json`: `"check:plan-limits": "node scripts/check-plan-limits.mjs"`.
- Mapa de equivalência front↔banco:
  - `maxSourceGroups` ↔ `max_source_groups`
  - `maxWhatsappConnections` ↔ `max_whatsapp_instances`
  - `maxWhatsappGroups` ↔ `max_whatsapp_dest_groups`
  - `maxTelegramGroups` ↔ `max_telegram_dest_groups`
  - `advancedAnalytics` ↔ `allow_analytics`
  - `allowShortener` ↔ `allow_shortener`
  - `futureScheduling` ↔ `allow_scheduling`
  - `removeBranding` ↔ `remove_branding`
  - `maxTelegramConnections` — só front (não há trigger de instância Telegram hoje); script ignora.

### 9. Selo "Aflyo" na vitrine pública (branding)

Hoje o `PublicPage.tsx` tem um "Powered by Aflyo" fixo no rodapé (linha ~723), **sem gate de plano** — aparece em toda vitrine. `removeBranding` está no `PLAN_CONFIGS` mas nunca é consumido.

**Gate sem vazar o plano.** A view `public.public_profiles` **não expõe `plan`** (removido por segurança na migration `20260820121000`). Adicionar à view um booleano derivado:

```sql
-- Na migration 20260831000000 (ou 000100), recriar a view public_profiles
-- adicionando a coluna:
  , EXISTS (
      SELECT 1 FROM public.plan_limits pl
      WHERE pl.plan = p.plan AND pl.remove_branding
    ) AS hide_branding
-- (renomear o FROM pra `public.profiles p` e prefixar as colunas existentes)
```

A vitrine passa a saber só "mostra ou não o selo", nunca o plano.

**Front — `src/pages/PublicPage.tsx`:**

- O tipo do profile público (`useSettingsProfile` / o shape lido de `public_profiles`) ganha `hide_branding?: boolean`.
- **Rodapé:** o bloco "Powered by Aflyo" (`<div className="text-center md:text-right">…`) só renderiza quando `!profile.hide_branding`.
- **Badge fixo no canto** (novo): quando `!profile.hide_branding`, renderizar um selo `position: fixed` no canto inferior direito — pill discreto com sombra, `bg-surface-0`, `z` alto, texto "Feito com Aflyo" + link pra `https://aflyo.com.br` (`target="_blank"`). Não cobre conteúdo (`bottom-3 right-3`, tamanho pequeno, `pointer-events-auto` só no link). Some junto com o rodapé pro Business.
- **Nenhum toggle de "remover branding"** em `/settings` nem em lugar nenhum. Business já vem sem o selo automaticamente (a view devolve `hide_branding = true`).

## Riscos e edge cases

- **Contas Starter grandfathered acima do novo cap.** A migration `20260821` cita 4 contas Starter que rodavam automação com até ~10k ofertas e 2 WA / 2 TG. Ofertas: agora ilimitado, sem risco. Canais: o novo cap Starter é `1 WA instance` e `5` grupos de destino — quem já tiver `2` instâncias ou `>5` grupos **não é desconectado** (o trigger só barra novas ativações; `IF TG_OP='UPDATE' AND OLD.status IN ('connected','active') THEN RETURN NEW`). Fica "acima do limite" até desconectar algo. Aceitável; documentar.
- **`plan` NULL ou valor inesperado em `profiles`.** `COALESCE(v_plan,'free')` + `COALESCE(v_max,0)` → trata como free (bloqueia). Igual ao comportamento atual.
- **Ordem das migrations.** `20260831000000` (tabela+seed) tem que rodar antes de `…000100` (triggers que fazem `SELECT` dela). Timestamps garantem a ordem.
- **`check:plan-limits` no CI.** Não vamos plugar no CI neste SP (evita quebrar build de terceiros que não rodaram a migration). Fica como comando manual + linha no checklist de PR.
- **Trial.** Conta em trial tem `plan='starter'` → puxa a linha `starter` de `plan_limits` automaticamente. Nada especial a fazer. No 8º dia `expire_*` cron muda `plan` pra `free` → puxa a linha `free` (tudo 0). Já coberto pelo sistema de trial existente.
- **View `public_profiles` com `hide_branding`.** Recriar a view (`DROP VIEW` + `CREATE VIEW`) — as 15 colunas atuais têm que ser mantidas 1:1 (qualquer coluna a menos quebra a vitrine). `security_invoker = false` e o `GRANT SELECT … TO anon, authenticated` precisam ser reaplicados. O sub-SELECT em `plan_limits` roda com os privilégios do dono da view (definer-like), então funciona pra visitante anônimo mesmo com a policy de `plan_limits` sendo só `TO authenticated`.
- **Contas Enterprise/Business existentes.** Passam a não ver o selo automaticamente assim que a view for recriada. Sem ação do usuário, sem migração de dados.

## Verificação (sem novos unit tests, regra do projeto)

1. `tsc -b && vite build` — sem erro.
2. `npm run check:plan-limits` — sai 0 (front e banco batem).
3. QA manual em staging/local com o dev server:
   - Conta Starter: card "Ofertas" some do Dashboard; card "Canais" não mostra "Limite atingido" com 0/0; aba Templates edita normalmente.
   - Tentar conectar 2º número de WhatsApp numa conta Starter → erro `check_violation` do trigger.
   - Tentar adicionar 3º grupo de origem numa conta Starter → erro do trigger.
   - Criar 30+ ofertas ativas em qualquer plano → sem erro (trigger de ofertas removido).
   - `/pricing` e a aba "Planos & Cobrança": sem menção a "20.000 ofertas"; Starter lista "Personalize o template de mensagem".
   - Vitrine pública de conta Starter/Pro: selo "Aflyo" no rodapé **e** badge fixo no canto. Vitrine de conta Business/Enterprise: sem selo, sem badge.

## Ordem de implementação (resumo pro plano)

1. Migrations `20260831000000` (tabela `plan_limits` + seed + recria a view `public_profiles` com `hide_branding`) / `000100` (triggers leem da tabela) / `000200` (drop do trigger de ofertas).
2. `scripts/check-plan-limits.mjs` + `package.json`.
3. `src/config/plans.ts` + `src/config/planCatalog.ts`.
4. `src/components/settings/TemplatesTab.tsx` (limpeza de `customTemplates`).
5. `src/pages/Dashboard.tsx` (remove card Ofertas + quick-fix Canais).
6. `src/pages/PublicPage.tsx` (+ tipo do profile público): gate do rodapé + badge fixo no canto por `hide_branding`.
7. Rodar `check:plan-limits`, build, QA manual.
