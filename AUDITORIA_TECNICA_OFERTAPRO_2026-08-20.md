# AUDITORIA TÉCNICA — OFERTAPRO (marca em rebrand: aflyo)

**Data:** 2026-08-20
**Auditor:** Claude (sessão Cowork) — papéis combinados de Software Engineer, Architect, QA, Security, DevOps e SaaS Product Engineer
**Escopo real coberto:** código-fonte + arquitetura + banco (via migrations/SQL versionados) + git + build/typecheck + integração CACTO + webhooks + segurança + RLS.
**Escopo NÃO coberto (declarado abertamente):** ver seção “Limitações desta auditoria”. Onde não pude validar em execução, marquei explicitamente `NÃO FOI POSSÍVEL VALIDAR` e diferenciei `ENCONTRADO NO CÓDIGO` de `VALIDADO EM EXECUÇÃO`, conforme regras 52/53 do seu prompt.

---

## Limitações desta auditoria (transparência antes de tudo)

Três coisas que você pediu e que **não** consegui executar neste ambiente — e por quê:

1. **Navegação real logada (Fase 3 / regra 7).** A senha da conta de teste veio como placeholder (`<INSERIR_SENHA_LOCALMENTE>`), então não tenho credencial. Além disso o dev server não sobe neste ambiente de nuvem (o binário nativo do `rolldown`/Vite 8 é específico da plataforma e o `npm install` foi bloqueado pelo sandbox). Resultado: os testes de clique/console/network **não foram validados em execução**. Tudo que digo sobre comportamento de UI está marcado como “inferido do código”.
2. **Teste ativo de IDOR/privilege-escalation contra o banco ao vivo (Fase 1.2).** Requer subir usuários de teste e bater no PostgREST com a service key/anon key. A chamada à Management API do Supabase foi bloqueada pelo sandbox desta sessão. Então as conclusões de RLS vêm da **leitura dos arquivos SQL versionados** (`supabase_schema.sql`, `supabase_final_setup.sql`, migrations) — que são a fonte de verdade do que foi aplicado — e não de um SELECT ao vivo em `pg_policies`.
3. **Compra real na CACTO.** Não executei (e não devo, sem sua autorização explícita — regra 21/36).

Apesar disso, os achados **P0** abaixo são de altíssima confiança porque estão inteiramente contidos em código/SQL versionado e não dependem de execução para serem verdadeiros. Cada um traz o caminho exato para você confirmar em 2 minutos.

---

## 1. Executive Summary

O OfertaPro/aflyo é um SaaS B2C de **automação de disparo de ofertas de afiliado** (WhatsApp via Evolution API, Telegram, Discord) com página pública de vitrine, construído em **React 19 + Vite + TypeScript** no front e **Supabase** (Auth + Postgres + 15 Edge Functions Deno) no back. Pagamento por **CACTO** (checkout hospedado + webhook + OAuth). Deploy alvo: Vercel.

**Estado macro:** o produto-núcleo (auth, ofertas, canais, disparo, vitrine pública) está maduro — há meses de correções incrementais documentadas. A frente **mais recente e ativa** é a integração de billing CACTO, que vive na branch `feat/checkout-cakto` (18 commits à frente de `main`), marcada como `READY_TO_MERGE` mas **ainda não mergeada**. Você parou exatamente no ponto de decisão “merge agora vs. rodar a fix-wave de segurança antes”.

**O que muda o jogo:** encontrei **dois problemas P0 de controle de acesso** que tornam o billing inteiro contornável e expõem PII de todos os usuários. Eles não são teóricos — estão nas políticas RLS versionadas:

- **P0-1 — Escalonamento de privilégio via `profiles.plan`.** A policy de UPDATE de `profiles` permite o usuário editar a própria linha **sem restrição de coluna e sem `WITH CHECK`**. Como o *entitlement* do plano é lido de `profiles.plan`, qualquer usuário autenticado pode dar `PATCH` direto no PostgREST e virar `enterprise` de graça. Todo o feature-gating e todo o esforço da integração CACTO ficam anulados por um request.
- **P0-2 — Vazamento de PII de toda a base.** A policy `Todos podem ver perfis (página pública) FOR SELECT USING (true)` expõe a **tabela `profiles` inteira, todas as colunas, para qualquer um** (inclusive anônimo): e-mail, telefone, URLs de grupos privados de WhatsApp/Telegram/Discord de todos os usuários.

Ambos têm correção pequena e de baixo risco. **Recomendação central: NÃO mergear a branch nem ir a produção antes de corrigir P0-1 e P0-2.** A “Opção B” (fix-wave antes do merge) que o seu próprio handoff já favorecia é a rota certa — só que ela precisa incluir estes dois itens, que são mais graves do que os dois “Important” já mapeados.

**Build/typecheck:** `tsc -b` passou limpo (exit 0). Bom sinal de saúde de tipos.

---

## 2. Arquitetura Encontrada

**Frontend (SPA):** React 19.2, React Router 7.15 (client-side routing puro, `BrowserRouter`), Vite 8, TailwindCSS 3.4, Recharts, lucide-react, axios. Sem SSR, sem Next. Estado via Context API (`UserContext`, `ToastContext`) + hooks. `dist/` é estático servido pelo Vercel com rewrite catch-all para `index.html` (`vercel.json`).

**Backend:** Supabase — Auth (PKCE, `@supabase/supabase-js` v2), Postgres com RLS, Storage (bucket `offers`), e **15 Edge Functions** em Deno:
- `cakto-webhook` (+ 7 handlers + libs de idempotência/secret/planMapping) — público, sem JWT.
- `cakto-cancel-subscription`, `cakto-claim-subscription`, `cakto-finalize-claim` — autenticados via JWT.
- `public-api` — API pública com API keys `lof_live_*` (hash SHA-256) ou JWT + escopos.
- `api-key-generate`, `api-key-revoke`.
- `enrich-product` (enriquecimento de produto — provável scraping/LLM de marketplaces).
- `evolution-*` (7 funções: create/delete/status de instância, sync/select de grupos, webhook) — integração WhatsApp.
- `test-helper`.

**Fonte de verdade do plano:** coluna `profiles.plan` (`free|starter|pro|enterprise`). A tabela `subscriptions` guarda o estado CACTO e um `pg_cron` diário rebaixa `profiles.plan` para `free` quando expira. Ou seja: **o backend confia em `profiles.plan`** para liberar recursos — e é justamente essa coluna que o usuário consegue escrever (P0-1).

**Integração CACTO:** checkout hospedado (`https://pay.cakto.com.br/{offerId}`), OAuth em `POST /public_api/token/`, webhook assinado por secret compartilhado no corpo do payload (`{ secret, event, data }`), idempotência por `webhook_events.cakto_event_id`.

**Modelo de dados (entidades principais):** `profiles`, `subscriptions`, `pending_subscriptions`, `webhook_events`, `offers`, `channels`, `history`, `clicks`, `api_keys`, `admin_users`, `user_settings`, `bot_configs`, tabelas Evolution/WhatsApp, `message_templates`, `beta_feedback`, `user_consents`, short links.

---

## 3. Estado Atual do Projeto

Projeto **vivo e avançado**, em fase de “fechamento do billing + hardening de segurança pré-produção”. Evidências:
- 18 commits de billing prontos e revisados na branch `feat/checkout-cakto`.
- Handoff detalhado (`CONTINUAR_AMANHA.md`) marcando a branch `READY_TO_MERGE`.
- Um **design de auditoria de segurança** já redigido por você mesmo em `docs/superpowers/specs/2026-08-20-security-audit-hardening-design.md` — ou seja, você já sabia que faltava a camada de segurança e começou a planejá-la hoje. Esta auditoria valida e prioriza esse plano.
- Working tree com mudanças não commitadas apenas em arquivos de *skills* (`.agent/skills/ui-ux-pro-max/...`) e untracked docs — **nada de código de produto pendente**. O código do produto está commitado.

Há **3 branches**: `main` (base), `feat/checkout-cakto` (billing, atual, HEAD `18cc683`), `feat/rework-aflyo` (rework visual/rebrand, paralela).

---

## 4. Onde o Desenvolvimento Parou

**Última etapa funcional concluída:** commit `18cc683 fix(billing): RLS + NewOfferModal + minors do final review` (2026-08-20 09:57), que aplicou a fix-wave “Opção B” do handoff: habilitou RLS em `pending_subscriptions` e `webhook_events`, trocou a modal legada de upgrade por `PaywallModal`, e corrigiu os minors do review final.

**Ponto exato de parada:** você concluiu a fix-wave da branch de billing e ficou **na fronteira do merge → produção**, tendo aberto (literalmente no mesmo dia) o design de uma auditoria de segurança mais ampla porque intuiu que ainda faltava fechar a segurança antes de ir pra produção. É aí que esta auditoria entra.

**Próxima etapa natural (e a resposta à sua Pergunta Principal, seção 34):** executar a Fase 1 (“crown jewels”) dessa auditoria de segurança que você já desenhou — mas com **dois P0 novos que o seu design ainda não tinha capturado** (P0-1 escalonamento de plano e P0-2 vazamento de PII em `profiles`). Corrigir esses dois é o que destrava o merge com segurança.

---

## 5. O Que Já Funciona (`VALIDADO` onde indicado)

- **Build & type-check:** `tsc -b` → exit 0, sem erros de tipo. `VALIDADO EM EXECUÇÃO` (rodado na sua máquina).
- **Fluxo de webhook CACTO (lógica):** idempotência por `cakto_event_id` com unique-violation → duplicata vira no-op 200; validação de secret; unwrap `payload.data`; 7 handlers de ciclo de vida. `ENCONTRADO NO CÓDIGO` + o handoff registra E2E manual com HTTP 200 e subscription criada (histórico, não revalidado por mim).
- **Autenticação Supabase (arquitetura):** PKCE, só a `anon key` vai pro front, `service_role` só em Edge Functions. `ENCONTRADO NO CÓDIGO` — confirmei que o bundle `dist/` contém **apenas** a anon key (JWT `role:anon`) e **nenhuma** service key/PAT. Isso é correto.
- **Isolamento de dados de ofertas/canais/histórico:** policies `FOR ALL USING (auth.uid() = user_id)` — corretas para essas tabelas. `ENCONTRADO NO CÓDIGO`.
- **API pública (`public-api`):** autentica por API key hasheada (SHA-256) ou JWT, aplica escopos, filtra por `user_id`. Modelo sólido. `ENCONTRADO NO CÓDIGO`.
- **Produto-núcleo (ofertas, canais, disparo, vitrine, onboarding):** amadurecido por dezenas de correções documentadas (junho–agosto). Presume-se funcional, mas `NÃO FOI POSSÍVEL VALIDAR` em execução nesta sessão.

---

## 6. O Que Está Parcialmente Funcionando

- **Billing CACTO — só o plano STARTER existe de fato.** `pro` e `enterprise` têm `caktoOfferId: 'TBD-...'` em `planCatalog.ts` e `planMapping.ts`. A página `Pricing.tsx` mitiga isso mostrando só `starter` (`PLAN_ORDER = ["starter"]`), então o usuário não chega nos TBD. Mas: os **limites/recursos “pro/enterprise”** existem em `PLAN_CONFIGS` sem que ninguém consiga comprá-los. Efetivamente o catálogo comercial é `free` vs `starter`.
- **Claim de assinatura por e-mail divergente (magic link):** implementado (`cakto-claim-subscription` + `cakto-finalize-claim` + `AuthCallback`), mas o handoff diz que o fluxo completo por inbox real ficou **deferido para teste manual**. `NÃO FOI POSSÍVEL VALIDAR`.
- **Login “Continuar com Google”:** botão existe, mas o handoff registra que o OAuth do Google **não está configurado** no Google Cloud/Supabase → o botão não funciona até isso ser feito.
- **Painel admin:** guarda de acesso via RPC `is_current_user_admin` (SECURITY DEFINER) — correto. Mas várias listagens do painel leem tabelas direto sob RLS do usuário; para um admin “normal” isso pode retornar dados incompletos dependendo de como as policies admin foram aplicadas. `NÃO FOI POSSÍVEL VALIDAR` sem execução.

---

## 7. O Que Está Quebrado

- **Controle de acesso de plano (P0-1)** — descrito abaixo. Quebra o modelo de receita.
- **Confidencialidade de PII (P0-2)** — descrito abaixo. Quebra privacidade/LGPD.
- **Enforcement de limites de plano é só client-side (P1)** — `canCreateOffer`/`canConnectChannel` rodam no front; a inserção real em `offers`/`channels` vai direto ao PostgREST sob RLS de posse, **sem checar quantidade por plano no servidor**. Um usuário pode exceder os limites do plano via request direto.
- **Sem security headers em produção (P2)** — `vercel.json` só tem rewrite; nenhum `Content-Security-Policy`, `Strict-Transport-Security`, `X-Frame-Options`, etc.

---

## 8. O Que Ainda Não Foi Implementado

- Produtos/ofertas CACTO **pro** e **enterprise** (só placeholders TBD).
- Rate limiting em login/reset/webhook e na `public-api`.
- Google OAuth (config externa pendente).
- Item 7 do rework (Dashboard visual) — não iniciado (handoff).
- Testes automatizados de qualquer tipo (não há unit/integração/E2E; não há Vitest/Jest/Playwright/Cypress no `package.json`).
- Rebrand completo aflyo (strings `DisparoFlow`/`linkoferta`/`disparoflow.com.br` ainda espalhadas).

---

## 9. Bugs P0 — BLOQUEADORES

### P0-1 — Escalonamento de privilégio: usuário se auto-promove a qualquer plano

```
ID:                    P0-1
Prioridade:            P0 (bloqueia merge e produção)
Área:                  Autorização / RLS / Billing
Arquivo(s):            supabase_schema.sql:91  e  supabase_final_setup.sql:115
                       (policy "Usuários podem atualizar seu próprio perfil")
                       Consome: src/config/plans.ts (getPlanLimits lê profiles.plan)
                       Escreve o plano legítimo: supabase/functions/cakto-webhook/handlers/*
Problema:              A policy de UPDATE em profiles é
                         FOR UPDATE USING (auth.uid() = id)
                       — sem WITH CHECK e sem restrição de colunas. A coluna
                       profiles.plan é o entitlement do sistema. Logo, qualquer
                       usuário autenticado pode alterar o próprio plan.
Como reproduzir:       Logado como usuário comum, no console do navegador:
                         await supabase.from('profiles')
                           .update({ plan: 'enterprise' })
                           .eq('id', (await supabase.auth.getUser()).data.user.id)
                       (ou um PATCH direto em /rest/v1/profiles?id=eq.<self>)
Comportamento atual:   O update é aceito; profiles.plan vira 'enterprise';
                       getPlanLimits libera todos os recursos premium sem pagar.
Comportamento esperado: Usuário NÃO pode escrever profiles.plan. Só o webhook
                       CACTO (service_role) e o pg_cron alteram o plano.
Causa provável:        Policy criada cedo, no MVP, quando plan ainda não era
                       fonte de verdade de billing. A integração CACTO tornou
                       essa coluna sensível, mas a policy nunca foi restringida.
Impacto:               CRÍTICO — anula 100% do billing e do feature-gating.
                       Todo o trabalho da branch feat/checkout-cakto é
                       contornável por um request. Perda de receita direta.
Correção recomendada:  Trocar a policy de UPDATE por uma que impeça a mudança
                       de colunas sensíveis. Opção robusta:
                         - REVOGAR update de profiles.plan no PostgREST, e/ou
                         - policy com WITH CHECK que exige plan inalterado:
                           CREATE POLICY profiles_self_update ON profiles
                           FOR UPDATE USING (auth.uid() = id)
                           WITH CHECK (auth.uid() = id AND plan = (SELECT plan FROM profiles WHERE id = auth.uid()));
                         (subselect em WITH CHECK tem limitações; a rota mais
                          segura é GRANT/REVOKE de coluna:
                           REVOKE UPDATE (plan) ON public.profiles FROM authenticated, anon;
                          + garantir que o webhook usa service_role, que ignora
                          o grant. Também revogar UPDATE em qualquer coluna de
                          role/is_admin se existir.)
Dependências:          Nenhuma. É migration SQL isolada.
Risco da correção:     Baixo. Não desloga ninguém, não quebra webhook (service_role
                       bypassa grants/RLS). Só validar que nenhum fluxo legítimo
                       do FRONT escreve profiles.plan (não escreve — confirmei:
                       só o webhook/edge com service_role escreve).
Como testar depois:    Repetir o reproduzir acima → deve falhar (403/permission
                       denied). Comprar starter via webhook → plan sobe. pg_cron
                       de expiração → plan volta a free.
```

### P0-2 — Vazamento de PII: tabela `profiles` inteira legível por qualquer um

```
ID:                    P0-2
Prioridade:            P0 (bloqueia produção; risco LGPD)
Área:                  Autorização / RLS / Privacidade / LGPD
Arquivo(s):            supabase_schema.sql:92  e  supabase_final_setup.sql:118
                       (policy "Todos podem ver perfis (página pública)")
Problema:              A policy é FOR SELECT USING (true) na tabela profiles
                       inteira. Isso expõe TODAS as colunas de TODAS as linhas
                       para qualquer requisição (inclusive anônima com a anon
                       key, que está pública no bundle). Colunas incluem email,
                       phone, whatsapp_group_url, telegram_group_url,
                       discord_group_url, plan, etc.
Como reproduzir:       Sem login, com a anon key (pública), um GET em
                       /rest/v1/profiles?select=email,phone,whatsapp_group_url
                       retorna a base inteira. (A anon key está em dist/assets/*.js.)
Comportamento atual:   Enumeração completa de PII de todos os usuários.
Comportamento esperado: A vitrine pública precisa apenas de colunas públicas
                       (display name público, avatar público, tema, username)
                       e apenas de perfis com is_public_active = true.
Causa provável:        Atalho no MVP para a página pública ler perfis sem auth.
                       Aplicaram USING(true) na tabela toda em vez de expor só
                       as colunas/linhas públicas.
Impacto:               CRÍTICO — vazamento massivo de dados pessoais. Além do
                       dano a usuários, é exposição direta sob LGPD (art. 46/48).
Correção recomendada:  Remover a policy USING(true) da tabela. Expor os campos
                       públicos por uma VIEW/segurança de coluna:
                         - criar view public_profiles com SELECT só das colunas
                           públicas WHERE is_public_active = true; conceder SELECT
                           a anon nessa view; e
                         - restringir a policy SELECT de profiles a
                           auth.uid() = id (dono) apenas.
                       Ajustar PublicPage.tsx para ler a view em vez de profiles.
Dependências:          Toca PublicPage.tsx (e qualquer leitura pública de profile).
                       Precisa mapear quais colunas a vitrine realmente usa.
Risco da correção:     Médio — se a vitrine hoje lê colunas que a view não expõe,
                       a página pública quebra. Requer inventário das colunas
                       usadas por PublicPage e teste da vitrine após a mudança.
Como testar depois:    GET anônimo em /rest/v1/profiles?select=email → vazio/erro.
                       Abrir /u/<username> de um perfil público → carrega normal.
                       Abrir vitrine de perfil com is_public_active=false → não expõe.
```

> Observação de validação: P0-1 e P0-2 são `ENCONTRADO NO CÓDIGO` (SQL versionado). Recomendo fortemente rodar um `SELECT * FROM pg_policies WHERE tablename='profiles'` ao vivo para confirmar que a policy aplicada em produção bate com o arquivo — leva 1 minuto no SQL editor do Supabase. Se por acaso já houver uma migration posterior que restringiu isso (não encontrei nenhuma), o achado cai; caso contrário, é real.

---

## 10. Bugs P1 — CRÍTICOS

### P1-1 — Enforcement de limites de plano é apenas client-side
```
Área:        Feature gating / Autorização
Arquivos:    src/config/plans.ts (canCreateOffer/canConnectChannel/canAddSourceGroup),
             src/hooks/useOfferForm.ts:374, src/services/OfferService.ts (insert direto)
Problema:    A contagem de ofertas/canais por plano é checada no front. A criação
             real insere em offers/channels via PostgREST sob RLS de posse, sem
             checar a quantidade permitida pelo plano no servidor.
Reproduzir:  supabase.from('offers').insert({...}) repetidas vezes além do limite.
Impacto:     Usuário free/starter excede limites do plano. Não é escalonamento de
             plano, mas fura o modelo de limites. Menos grave que P0-1.
Correção:    Enforcement server-side: trigger BEFORE INSERT em offers/channels que
             consulta profiles.plan (após P0-1, plan é confiável) e conta linhas,
             OU rotear criação por uma edge function que valida. Trigger é o menor
             raio de impacto.
Risco:       Médio (trigger que bloqueia insert precisa de teste cuidadoso).
```

### P1-2 — `purchase_approved` de compra avulsa e eventos fora de ordem não têm tratamento explícito
```
Área:        Webhooks CACTO
Arquivo:     supabase/functions/cakto-webhook/handlers/purchase_approved.ts
Problema:    purchase_approved para compra NÃO-assinatura só faz console.log (noop).
             Se o produto STARTER for entregue por purchase_approved antes de
             subscription_created (ordem de eventos do gateway não garantida),
             pode haver janela sem liberação. Renewals/created dependem da ordem.
Impacto:     Possível assinatura paga sem liberação (ou atraso) em casos de corrida.
Validação:   NÃO FOI POSSÍVEL VALIDAR (sem compra real). Marcar para teste E2E.
Correção:    Confirmar com a doc CACTO a ordem/qual evento é autoritativo para
             assinatura recorrente; tornar created idempotente-tolerante a ordem
             (já é upsert por cakto_subscription_id, o que ajuda).
```

### P1-3 — Idempotência de webhook fraca quando `data.id` está ausente
```
Área:        Webhooks CACTO / idempotência
Arquivo:     supabase/functions/cakto-webhook/lib/idempotency.ts:15-19
Problema:    getEventId cai para `${event}-${sub}-${Date.now()}` quando não há
             data.id. Com Date.now(), dois envios do MESMO evento (retry do
             gateway) geram IDs diferentes → NÃO são detectados como duplicata →
             o handler roda 2x.
Impacto:     Reprocessamento duplicado em retries quando o payload não traz id.
             Para os handlers atuais (upserts idempotentes), o dano é limitado,
             mas o desenho de idempotência não é confiável.
Correção:    Derivar a chave de idempotência de campos estáveis do payload
             (event + subscription.id + período/timestamp do gateway), nunca
             Date.now(). Se CACTO fornece um event id estável, usar sempre.
```

---

## 11. Bugs P2 — IMPORTANTES

- **P2-1 Security headers ausentes** (`vercel.json`): sem CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy. Adicionar bloco `headers` no `vercel.json`.
- **P2-2 Sem rate limiting** em login/reset/`public-api`/webhook. Risco de brute force e abuso. Supabase Auth tem limites próprios, mas endpoints custom não.
- **P2-3 `console.log` de dados sensíveis no boot** (`src/lib/supabase.ts:6-7` loga presença/URL do Supabase; vários `[BOOT]`): 82 `console.log` no `src`. Não vaza secret, mas polui e pode logar e-mail/estado. Remover em produção (Vite `drop console`).
- **P2-4 Discrepância de schema `plan`**: `supabase_schema.sql` tem `CHECK (plan IN ('free','pro','enterprise'))` (sem `starter`), enquanto `supabase_final_setup.sql`/subscriptions usam `starter`. Se a constraint antiga estiver viva, o webhook falharia ao setar `starter`. Verificar qual constraint está aplicada.
- **P2-5 `public-api` CORS `*` com métodos de escrita**: aceitável porque exige Bearer, mas convém restringir origem quando possível.
- **P2-6 Perfil “em memória” mascarando falhas** (`UserContext.tsx:240-266/376-402`): quando o fetch de profile falha, cria um perfil fake com `plan:'free'` e `onboarded:true`. Bom p/ resiliência, mas pode esconder erros reais e confundir estado. Observabilidade fraca.

---

## 12. Bugs P3 — MELHORIAS

- Rebrand incompleto: `APP_NAME` e strings `DisparoFlow`, storageKey `sb-linkoferta-auth`, `disparoflow.checkout_intent`, fallback `https://disparoflow.com.br` (em `cakto-claim-subscription`) e `https://linkoferta.vercel.app` (em `public-api`).
- `~148` marcadores TODO/FIXME/MOCK/PLACEHOLDER/etc no `src` — inventariar e limpar os relevantes.
- ESLint não pôde ser concluído (timeout de 45s no ambiente do device; rodar localmente `npm run lint`).
- `getPlanLimits` retorna “Beta Ilimitado” quando `FEATURES.billing=false` — hoje `true`, mas é um interruptor que libera tudo; manter ciente.
- Muitos arquivos `.md` de correção na raiz (50+) — mover para `/docs` para higiene do repo.

---

## 13. Autenticação

`ENCONTRADO NO CÓDIGO` (arquitetura sólida): Supabase Auth com **PKCE**, `persistSession`, `autoRefreshToken`, storage com wrapper defensivo. Só a **anon key** vai ao front (confirmado no bundle). Rotas protegidas via `ProtectedRoute` + gate no `App.tsx`. Detecção de sessão corrompida com auto-limpeza. Signup cria perfil mínimo. Recuperação/reset de senha implementados (`/forgot`, `/reset`).

Pontos de atenção:
- **Proteção de rota é client-side** (SPA). Isso é aceitável **porque** a segurança real está no RLS do banco — mas isso torna P0-1/P0-2 ainda mais críticos: sem RLS correto, não há segunda linha de defesa.
- **`NÃO FOI POSSÍVEL VALIDAR`**: expiração/single-use de token de reset, revogação de sessão no logout global, e o fluxo de e-mail de verificação (dependem de execução).
- Cookies/sessão: o JWT fica em `localStorage` (padrão supabase-js SPA), não em cookie HttpOnly — então **não** há flags Secure/HttpOnly/SameSite a auditar aqui; o trade-off (XSS pode ler o token) é inerente ao modelo SPA. Mitigar via CSP (P2-1) e higiene de XSS.

---

## 14. Banco de Dados

Entidades e relações centrais bem modeladas: FKs para `profiles(id)`/`auth.users`, `ON DELETE CASCADE` em `subscriptions.user_id`, uniques em `cakto_subscription_id`/`cakto_event_id`, índices em `user_id`, `(status, current_period_end)`, `lower(email)`. `updated_at` via trigger. `pg_cron` para expiração e retenção de `webhook_events` (90d). Migrations versionadas em `supabase/migrations/` **coexistindo** com dezenas de `.sql` soltos na raiz (aplicados manualmente historicamente) — isso é dívida de processo: **a fonte de verdade do schema está fragmentada**, dificultando saber o estado real aplicado.

Riscos:
- **Fragmentação de migrations** (raiz vs `supabase/migrations/`) → risco de drift entre ambientes.
- Discrepância de CHECK do `plan` (P2-4).
- `cascade` de `profiles`→`subscriptions` é intencional e ok.

---

## 15. Autorização / RLS / IDOR

| Tabela | Policy encontrada | Veredito |
|---|---|---|
| `profiles` SELECT | `USING (true)` (pública) + `USING (auth.uid()=id)` | **P0-2 — expõe tudo** |
| `profiles` UPDATE | `USING (auth.uid()=id)` sem WITH CHECK/coluna | **P0-1 — escala plano** |
| `offers` | `FOR ALL USING (auth.uid()=user_id)` + público vê `status='active'` | OK (público só ofertas ativas) |
| `channels` | `FOR ALL USING (auth.uid()=user_id)` | OK |
| `history` | `FOR ALL USING (auth.uid()=user_id)` | OK |
| `clicks` | INSERT `WITH CHECK(true)`, SELECT `auth.uid()=user_id` | OK (inserção pública p/ tracking é intencional) |
| `user_settings` | `FOR ALL USING (auth.uid()=user_id)` | OK |
| `subscriptions` | RLS on, SELECT owner `auth.uid()=user_id`, sem policy de write | OK (write só service_role) |
| `pending_subscriptions` | RLS habilitado sem policies (migration 2026-08-18) | OK (só service_role) |
| `webhook_events` | RLS habilitado sem policies (migration 2026-08-18) | OK (só service_role) |
| `admin_users` | policies via `is_current_user_admin()` | OK |

**IDOR clássico (por id na URL):** as rotas privadas são client-side e os dados vêm por RLS de posse — então trocar id no front não vaza dados de terceiros nas tabelas com policy `auth.uid()=user_id`. **A exceção é `profiles`** (P0-2), onde não há isolamento nenhum. `VALIDADO` a nível de policy; `NÃO FOI POSSÍVEL VALIDAR` por request ao vivo.

---

## 16. Planos

| Plano | Preço (código) | Ciclo | Limites (PLAN_CONFIGS) | ID interno | ID CACTO | Status |
|---|---|---|---|---|---|---|
| free | R$ 0 | — | 10 ofertas, 1 WA, 0 TG, 3 grupos | `free` | — | Ativo |
| starter | R$ 47,90 / R$ 479 | mensal/anual | 100 ofertas, 1 WA, 0 TG, 1 grupo, analytics+agendamento | `starter` | `oy56ftb` / `5523xh7` | **Ativo/vendável** |
| pro | R$ 167 / R$ 1670 | mensal/anual | ilimitado ofertas, 5 WA, 3 TG, 30 grupos, tudo | `pro` | `TBD-*` | **Não vendável (placeholder)** |
| enterprise | R$ 247 / R$ 2470 | mensal/anual | tudo ilimitado | `enterprise` | `TBD-*` | **Não vendável (placeholder)** |

**Fonte de verdade do entitlement:** `profiles.plan` (banco). **Fonte de verdade do catálogo/preço:** código (`planCatalog.ts` + `plans.ts`) + entidades CACTO. **Divergência crítica:** o entitlement é escrevível pelo usuário (P0-1). **Divergência de produto:** só `starter` é comprável; `pro`/`enterprise` existem como limites mas não como produto CACTO.

---

## 17. CACTO

Fluxo desenhado: `Usuário → Pricing (só starter) → checkout pay.cakto.com.br/oy56ftb → pagamento → webhook (secret+idempotência) → handler → subscriptions + profiles.plan → feature gate`. Claim por magic link cobre e-mail divergente. Cancelamento via edge autenticada chamando `POST /public_api/subscriptions/{id}/cancel/`. OAuth `POST /public_api/token/` (client_id+secret, sem grant_type — descoberto na sessão anterior). `ENCONTRADO NO CÓDIGO`, coerente e razoavelmente completo. E2E real `NÃO FOI POSSÍVEL VALIDAR` nesta sessão (o handoff registra um E2E manual anterior bem-sucedido para starter).

---

## 18. Webhooks

Endpoint público `cakto-webhook` (sem JWT — correto p/ webhook). Valida secret do corpo; grava em `webhook_events` antes de processar (idempotência por unique); em erro do handler, **desfaz** o registro para permitir retry. 7 eventos tratados: `subscription_created/renewed/canceled/renewal_refused`, `purchase_approved`, `refund`, `chargeback`. Eventos desconhecidos → 200 “unhandled” (não falha o gateway). **Pontos fracos:** idempotência com `Date.now()` fallback (P1-3); `purchase_approved` avulso é noop (P1-2); validação de secret é comparação de string simples (não HMAC/timing-safe, mas como o secret vem no corpo e é comparado por igualdade, o risco de timing é baixo — CACTO não usa assinatura HMAC de header aqui).

---

## 19. Feature Gating

Todas as checagens (`hasFeature`, `canCreateOffer`, `canConnectChannel`, `PaywallModal`) rodam **no cliente**, lendo `profiles.plan`. **Não há autorização server-side de recurso premium** além do RLS de posse (que não distingue plano). Combinado com P0-1, o gating é duplamente contornável: (a) o usuário edita o próprio plano; (b) mesmo sem isso, insere direto além do limite. **Recomendação:** após corrigir P0-1 (plan confiável), mover o enforcement de limites para o servidor (trigger/edge) — P1-1.

---

## 20. APIs

| Método | Endpoint (edge) | Auth | Autorização | Função | Status |
|---|---|---|---|---|---|
| POST | `cakto-webhook` | secret no corpo | idempotência | eventos CACTO | OK (P1-2/P1-3 ressalvas) |
| POST | `cakto-cancel-subscription` | JWT | dono da sub | cancela na CACTO | OK |
| POST | `cakto-claim-subscription` | JWT | e-mail→magic link | reivindica sub | OK (fluxo e-mail não validado) |
| POST | `cakto-finalize-claim` | JWT | `as_user===user.id` | finaliza claim | OK (guard corrigido em `18cc683`) |
| GET/POST | `public-api/*` | API key SHA-256 ou JWT | escopos + user_id | API pública | OK (sem rate limit) |
| POST | `api-key-generate` / `-revoke` | JWT | próprio user | gerência de chaves | OK |
| POST | `enrich-product` | `NÃO FOI POSSÍVEL VALIDAR` | — | enriquecimento | revisar auth/limites |
| * | `evolution-*` (7) | `NÃO FOI POSSÍVEL VALIDAR` a fundo | service_role | WhatsApp | revisar na Fase 2 |
| * | `test-helper` | — | — | utilitário de teste | **remover antes de produção** |

`test-helper` em produção é risco — confirmar o que faz e retirar.

---

## 21. Segurança (resumo; matriz na seção 29)

Fortes: sem secrets no bundle; anon-key-only no front; RLS de posse nas tabelas de dados; API keys hasheadas; webhook idempotente; PKCE. Fracos: **P0-1/P0-2** (controle de acesso de `profiles`), sem security headers, sem rate limit, gating client-side, `test-helper` exposto, logs verbosos.

---

## 22. UX Funcional

`NÃO FOI POSSÍVEL VALIDAR` em execução (sem credencial/dev server). Do código, pontos de atenção herdados de handoffs/reviews: modal legada de upgrade **já corrigida** (`18cc683` trocou por `PaywallModal`); `Offers.tsx` Empty"Criar Primeira Oferta" podia furar o paywall page-level (fallback existe); bug do sino de notificações (hipótese `backdrop-blur-xl` criando stacking context) — pendente. Timeout de `CheckoutWaitingDialog` (60s) pode ser curto. Recomendo um passe manual de QA guiado (o repo tem vários roteiros: `MANUAL_QA_OFERTAPRO.md`, `QA_FINAL_*`).

---

## 23. Performance

`NÃO FOI POSSÍVEL VALIDAR` (sem runtime). Do código: bundle único de **~1,38 MB** JS (`dist/assets/index-*.js`) sem code-splitting por rota → primeiro carregamento pesado; considerar `React.lazy`/split por rota. `useSubscription` abre canal realtime por usuário (ok). Sem N+1 evidente no front. Classificar abaixo dos P0/P1 funcionais.

---

## 24. Testes

**Não há testes automatizados** (nenhum Vitest/Jest/Playwright/Cypress; sem script `test`). Toda verificação histórica é manual (roteiros `.md`). Para um SaaS com billing, isso é a maior lacuna de garantia. Prioridade de cobertura futura: RLS/authorization (P0), webhook handlers, feature gates, claim de assinatura.

---

## 25. Build e Deploy

`tsc -b` → **exit 0** (`VALIDADO`). `vite build` produz `dist/` (build recente presente; não reexecutável neste ambiente por binário nativo). Deploy Vercel com SPA rewrite. **Riscos de produção:** URLs hardcoded (`disparoflow.com.br`, `linkoferta.vercel.app`) que precisam bater com o domínio real; `APP_URL`/`VITE_PUBLIC_APP_URL` corretos nas env vars da Vercel e nos secrets do Supabase (o `redirectTo` do magic link depende disso); secrets CACTO/service_role só no Supabase (nunca `VITE_*`); `test-helper` fora; security headers no `vercel.json`.

---

## 26. Dívida Técnica

Migrations fragmentadas (raiz vs pasta oficial); 50+ `.md` na raiz; rebrand a meio; 148 marcadores TODO/etc; `console.log` abundante; ausência de testes; `any` frequente em contexto de auth (`session:any`, `authUser:any`); perfil-fake em memória mascarando falhas. Nada disso bloqueia, mas encarece manutenção.

---

## 27. Matriz de Funcionalidades

| Funcionalidade | Código existe? | Testado (execução)? | Funciona? | Problemas | Prioridade |
|---|---|---|---|---|---|
| Login/Signup/Reset | Sim | NÃO (sem cred.) | provável | rota client-side ok se RLS ok | — |
| Google OAuth | Sim | Não | **Não** | config externa pendente | P2 |
| Proteção de rotas | Sim | Não | parcial | client-side; depende de RLS | ligado a P0 |
| Ofertas (CRUD) | Sim | Não | provável | limite client-side (P1-1) | P1 |
| Canais/Disparo | Sim | Não | provável | limite client-side (P1-1) | P1 |
| Vitrine pública | Sim | Não | provável | **P0-2 vaza profiles** | P0 |
| Dashboard | Sim | Não | provável | edge cases WA=∞ | P3 |
| Admin | Sim | Não | parcial | leituras sob RLS | P2 |
| Pricing/Checkout starter | Sim | Não (E2E hist.) | provável | só starter | P2 |
| Checkout pro/enterprise | Placeholder | Não | **Não** | TBD | P2 |
| Webhook CACTO | Sim | Parcial (hist.) | provável | P1-2/P1-3 | P1 |
| Cancelamento | Sim | Não | provável | erro engolido (minor) | P2 |
| Claim por e-mail | Sim | **Não** | ? | fluxo e-mail não validado | P1 |
| Feature gating | Sim | Não | **contornável** | P0-1 + client-side | P0 |
| API pública | Sim | Não | provável | sem rate limit | P2 |

---

## 28. Matriz CACTO

| Fluxo | Implementado | Testado (exec.) | Funcionando | Problema |
|---|---|---|---|---|
| Checkout (starter) | Sim | Não (E2E histórico) | provável | só starter existe |
| Checkout (pro/ent.) | Placeholder | Não | Não | offer_ids TBD |
| Pagamento aprovado | Sim | Parcial (hist.) | provável | purchase_approved avulso é noop (P1-2) |
| Assinatura criada | Sim | Parcial (hist.) | provável | upsert idempotente ok |
| Renovação | Sim | Parcial (hist.) | provável | ok |
| Cancelamento | Sim | Não | provável | downgrade via pg_cron; erro UI engolido |
| Renovação recusada | Sim | Parcial (hist.) | provável | grace 3d |
| Reembolso | Sim | Parcial (hist.) | provável | → free |
| Chargeback | Sim | Não | provável | → free |
| Webhook (entrega/idemp.) | Sim | Parcial (hist.) | provável | idempotência Date.now() (P1-3) |
| Upgrade | Parcial | Não | Não | só via novo checkout; sem prorata |
| Downgrade | Parcial | Não | Não | via cancel + expiração |

---

## 29. Matriz de Segurança

| Controle | Status | Risco | Correção |
|---|---|---|---|
| Autenticação | Implementado | Baixo | manter; validar reset single-use |
| Autorização (dados) | Implementado (posse) | Médio | ok p/ offers/channels; ver profiles |
| Autorização (plano) | **Falho** | **Crítico** | P0-1: revogar UPDATE(plan) |
| RLS profiles | **Falho** | **Crítico** | P0-2: remover USING(true), usar view |
| RLS billing tables | Implementado | Baixo | RLS on (migration 08-18) |
| IDOR | Implementado (exc. profiles) | Alto (via profiles) | corrigir P0-2 |
| Rate Limit | Ausente | Médio | login/reset/public-api/webhook |
| CSRF | N/A (Bearer, sem cookie de sessão) | Baixo | — |
| XSS | Parcial | Médio | CSP (P2-1); revisar dangerouslySetInnerHTML se houver |
| SQL Injection | Mitigado (PostgREST/params) | Baixo | manter |
| Uploads | Implementado (storage) | Médio | validar MIME/tamanho em `offers` bucket |
| Security Headers | **Ausente** | Médio | adicionar em vercel.json |
| Secrets | OK (não versionados/não no bundle) | Baixo | rotacionar PAT/secrets do handoff (estão em docs) |
| Sessions | localStorage (SPA) | Médio | mitigar via CSP |
| Endpoint de teste | `test-helper` exposto | Médio | remover antes de produção |

> **Ação de secrets:** o `CONTINUAR_AMANHA.md` versionado contém PAT do Supabase, Client ID CACTO e Webhook Secret em texto. Mesmo em repo privado, recomendo **rotacionar** esses valores e tirar de arquivos versionados.

```
Arquivo:            CONTINUAR_AMANHA.md (e docs de handoff)
Linha:              seções "Setup"/"Info geral"
Tipo de secret:     Supabase PAT (sbp_****), CACTO Client ID/Webhook Secret, EVOLUTION_WEBHOOK_SECRET (.env)
Risco:              Alto se o repo vazar/tornar-se público
Ação recomendada:   Rotacionar PAT e webhook secret; remover valores dos .md; manter só no gerenciador de secrets
```

---

## 30. Quick Wins

Baixo risco, alto valor, pouca dependência:
1. **P0-1** — `REVOKE UPDATE (plan) ON profiles FROM authenticated, anon;` (+ garantir webhook usa service_role). Migration de 1 linha, destrava a integridade do billing.
2. **P2-1** — bloco `headers` no `vercel.json` (CSP básica + HSTS + X-Content-Type-Options + X-Frame-Options + Referrer-Policy). Puramente aditivo.
3. **Remover `test-helper`** do deploy de produção.
4. **P2-3** — `esbuild drop:['console']` no build de produção.
5. **Rotacionar e remover secrets** dos `.md` versionados.

> Regra respeitada: quick wins não passam à frente de P0/P1 bloqueadores. P0-1 é ao mesmo tempo quick win e bloqueador — por isso é o item #1.

---

## 31. Dependências Entre Correções

```
P0-1 (revogar write de plan)
   └─ habilita → P1-1 (enforcement server-side de limites confia em plan)

P0-2 (fechar profiles + view pública)
   └─ depende de → inventário de colunas usadas por PublicPage.tsx

P1-3 (idempotência estável)  ─ independente
P1-2 (purchase_approved)     ─ depende de confirmação da doc CACTO

Merge da branch feat/checkout-cakto
   └─ BLOQUEADO por → P0-1 e P0-2 corrigidos + reconfirmação de policies ao vivo
```

---

## 32. Roadmap de Recuperação

Ordem definida pelo que foi encontrado (não a ordem genérica do prompt):

```
FASE 0 — Confirmar policies ao vivo (SELECT em pg_policies) e schema do plan   [30 min]
FASE 1 — P0-1: revogar UPDATE(plan) + validar webhook/cron ainda escrevem      [P0]
FASE 2 — P0-2: fechar SELECT de profiles + view pública + ajustar PublicPage    [P0]
FASE 3 — Reconfirmar E2E de billing (starter) sem escalonamento possível        [P0 gate]
FASE 4 — Merge feat/checkout-cakto → main                                       [desbloqueio]
FASE 5 — P1-1 enforcement server-side de limites de plano                       [P1]
FASE 6 — P1-2 / P1-3 robustez de webhook + idempotência                         [P1]
FASE 7 — Hardening deploy: headers, remover test-helper, rate limit, rotacionar secrets [P2]
FASE 8 — Google OAuth + validar claim por e-mail em inbox real                  [P2]
FASE 9 — Testes automatizados dos caminhos críticos (RLS/webhook/gates)         [P2/P3]
FASE 10 — Rebrand aflyo + higiene de repo/migrations                            [P3]
```

---

## 33. Ordem Exata Recomendada

1. **Confirmar policies ao vivo** — Objetivo: certificar que `profiles` em produção bate com o SQL versionado. Arquivos: SQL editor Supabase. Resolve: risco de auditar um alvo errado. Dependências: nenhuma. Conclusão: print do `pg_policies` de `profiles`.
2. **P0-1 revogar write de `plan`** — Objetivo: plano vira imutável pelo usuário. Arquivos: nova migration SQL; validar `cakto-webhook/*` e pg_cron. Resolve: escalonamento de plano. Dep.: item 1. Conclusão: reproduzir o exploit → 403.
3. **P0-2 fechar `profiles`** — Objetivo: parar vazamento de PII. Arquivos: nova migration + `src/pages/PublicPage.tsx`. Resolve: exposição de e-mail/telefone/grupos. Dep.: inventário de colunas da vitrine. Conclusão: GET anônimo em `profiles?select=email` vazio + vitrine pública ainda funciona.
4. **Reconfirmar E2E billing starter** — Objetivo: garantir que o fluxo pago segue ok após os P0. Dep.: 2,3. Conclusão: compra teste (starter) libera plano; exploit não funciona mais.
5. **Merge `feat/checkout-cakto`** — Dep.: 2,3,4 verdes. Conclusão: PR mergeado.
6. **P1-1 enforcement server-side de limites** — Dep.: 2. Conclusão: insert acima do limite → bloqueado no servidor.
7. **P1-2/P1-3 robustez de webhook** — Conclusão: retry duplicado é no-op; ordem de eventos tratada.
8. **P2 hardening** (headers, remover `test-helper`, rate limit, rotacionar secrets).
9. **Google OAuth + claim por e-mail real**.
10. **Testes automatizados + rebrand + migrations**.

---

## 34. Próxima Tarefa

Ver bloco “PRÓXIMA TAREFA RECOMENDADA” ao final.

**Resposta à Pergunta Principal (regra 44):**
- *Onde o desenvolvimento parou?* No commit `18cc683`, na fronteira entre concluir a fix-wave da branch de billing e o merge para produção — e você abriu, no mesmo dia, o design de uma auditoria de segurança porque sentiu que faltava fechar a segurança. **Evidência:** branch `READY_TO_MERGE` não mergeada + `docs/superpowers/specs/2026-08-20-security-audit-hardening-design.md` criado hoje + working tree sem código de produto pendente.
- *Qual deve ser a próxima etapa?* Executar a Fase 1 dessa auditoria, **corrigindo primeiro os dois P0 que o seu design ainda não tinha capturado** (P0-1 escalonamento de plano via `profiles.plan`, P0-2 vazamento de PII em `profiles`), reconfirmar o E2E de billing e só então mergear.

---

## 35. Critérios para Considerar o SaaS Pronto

Fluxo crítico validado ponta-a-ponta, **com os controles de acesso fechados**:
```
Signup → Login → Dashboard → uso do plano free → escolha do starter → checkout CACTO →
pagamento → webhook → subscriptions + profiles.plan (que o usuário NÃO consegue forjar) →
liberação de recursos → persistência após novo login → cancelamento → downgrade correto.
```
Mais: (a) usuário não consegue ler `profiles` de terceiros; (b) usuário não consegue se auto-promover; (c) usuário não fura limites por request direto; (d) headers de segurança presentes; (e) `test-helper` removido; (f) secrets rotacionados/fora do repo; (g) domínio/URLs de produção corretos; (h) ao menos smoke tests dos caminhos de auth/billing.

---

# PRÓXIMA TAREFA RECOMENDADA

```
Objetivo:        Fechar o escalonamento de privilégio de plano (P0-1) —
                 impedir que qualquer usuário autenticado altere profiles.plan.

Motivo:          É simultaneamente o bug mais grave (anula todo o billing CACTO
                 que você acabou de construir) e um quick win (migration curta,
                 risco de regressão baixo, não desloga ninguém). Corrigi-lo
                 primeiro protege todo o trabalho da branch antes do merge e é
                 pré-requisito para o enforcement server-side de limites (P1-1).

Prioridade:      P0 (bloqueador de merge e de produção).

Arquivos envolvidos:
                 - nova migration: supabase/migrations/2026XXXX_lock_profiles_plan.sql
                 - verificar (sem alterar): supabase/functions/cakto-webhook/handlers/*
                   e o pg_cron de expiração — ambos usam service_role e continuam
                   podendo escrever plan.
                 - referência do consumo: src/config/plans.ts (getPlanLimits lê plan)

Dependências:    Confirmar antes, ao vivo, a policy atual:
                   SELECT * FROM pg_policies WHERE tablename='profiles';
                 (garante que o alvo aplicado bate com o SQL versionado)

Passos:
                 1. Rodar o SELECT em pg_policies acima e guardar o resultado.
                 2. Criar migration que revoga a escrita da coluna plan:
                      REVOKE UPDATE (plan) ON public.profiles FROM authenticated, anon;
                    (opcionalmente também colunas de role/admin, se existirem)
                    Manter a policy de UPDATE de profiles para o dono nas demais
                    colunas (nome, avatar, público, etc.).
                 3. Garantir que o webhook e o pg_cron usam service_role (usam) —
                    logo continuam escrevendo plan normalmente.
                 4. Aplicar via Management API (mesmo padrão da Task 1) e registrar
                    em supabase_migrations + arquivo local para sync.

Critério de conclusão:
                 - profiles.plan não pode mais ser alterado por usuário comum.
                 - webhook de compra (starter) ainda promove o plano.
                 - pg_cron de expiração ainda rebaixa para free.

Como validar:
                 Logado como usuário comum, no console:
                   await supabase.from('profiles')
                     .update({ plan: 'enterprise' })
                     .eq('id', (await supabase.auth.getUser()).data.user.id)
                 → deve retornar erro de permissão (antes: sucesso).
                 Depois, atualizar nome/avatar do próprio perfil → deve continuar
                 funcionando (não quebrar edição legítima).
```

**Importante:** conforme a regra 3/36 do seu prompt, **não apliquei nenhuma alteração** — esta é a fase de diagnóstico. Os dois P0 são de código/SQL versionado e alta confiança, mas peço que você rode o `SELECT ... FROM pg_policies` ao vivo para bater o martelo antes de corrigir. Se você aprovar, começo pela Próxima Tarefa acima, uma correção isolada por vez, testando entre cada uma.
