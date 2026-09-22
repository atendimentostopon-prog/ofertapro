# PLANO DE CORREÇÃO — OFERTAPRO / aflyo

**Base:** Auditoria técnica de 2026-08-20 (`AUDITORIA_TECNICA_OFERTAPRO_2026-08-20.md`)
**Branch de trabalho:** `feat/checkout-cakto` (HEAD `18cc683`)
**Escopo:** completo, P0 → P3. **Formato:** pronto para aplicar (SQL/código). **Execução:** guiada — eu aplico as correções de código no seu repo e preparo o SQL; você aprova cada etapa e roda o SQL de banco.

---

## Como vamos trabalhar (leia primeiro)

**Divisão de execução (honesta sobre o que consigo fazer daqui):**

- **Código (arquivos do repo):** eu edito direto em `D:\ofertapro` pelo bridge e faço o commit. Você revisa o diff.
- **Banco (migrations SQL):** eu **preparo o SQL exato**; a aplicação em produção você roda no **SQL Editor do Supabase** (ou me autoriza a chamar a Management API — hoje ela está bloqueada no meu ambiente, então o caminho padrão é você colar no SQL Editor). Todo SQL aqui é idempotente e não-destrutivo.
- **Edge Functions (deploy):** eu edito o código; o `supabase functions deploy` roda na sua máquina/CI (o deploy precisa de rede + CLI autenticado).

**Regras invioláveis durante a correção:**
- Uma correção isolada por vez, com teste entre cada uma. Sem "mega-commit".
- Nada destrutivo em produção: sem `DROP TABLE`, sem reset, sem `--force`, sem cobrança real sem seu OK.
- Cada etapa tem um **gate de aprovação**: eu paro e te mostro o resultado antes de seguir.
- Se um fix puder deslogar usuários ou quebrar o webhook em voo, eu paro e pergunto antes.
- Commits pequenos: `fix(security): ...`, `fix(billing): ...` — um por correção.

**Ordem macro (por dependência, não pela ordem genérica):**
```
FASE 0  Confirmar estado real ao vivo (policies + schema)      [pré-requisito]
BLOCO A P0 — controle de acesso (2 fixes)                      [bloqueia merge]
BLOCO B P1 — robustez de billing/limites (3 fixes)            [antes de escalar]
GATE    E2E de billing + MERGE da branch                      [desbloqueio]
BLOCO C P2 — hardening de produção (6 itens)                  [antes de produção madura]
BLOCO D P3 — OAuth, testes, rebrand, higiene                 [pós-produção]
```

---

## FASE 0 — Confirmar o estado real ao vivo (30 min, pré-requisito)

Antes de corrigir, batemos o martelo de que o alvo aplicado bate com o SQL versionado. Rode no **SQL Editor do Supabase** e me mande o resultado:

```sql
-- 0.1 Policies atuais de profiles (alvo dos P0)
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY cmd, policyname;

-- 0.2 RLS ligado em todas as tabelas
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 0.3 Constraint atual do plan (P2-4: divergência starter)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.profiles'::regclass AND contype = 'c';

-- 0.4 Grants de coluna já existentes em profiles
SELECT grantee, privilege_type, column_name
FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'profiles'
ORDER BY grantee, column_name;
```

**Critério de saída da Fase 0:** confirmado que (a) existe a policy `USING (true)` de SELECT em `profiles`, (b) a policy de UPDATE não tem `with_check` restringindo `plan`, (c) qual constraint de `plan` está viva. Se algo já estiver corrigido, ajustamos o plano.

---

## BLOCO A — P0 (bloqueiam o merge e a produção)

### A1 — P0-1: travar escrita de `profiles.plan` (escalonamento de privilégio)

**Objetivo:** o usuário não pode mais alterar o próprio plano; só `service_role` (webhook + pg_cron) escreve `plan`.

**SQL (migration `supabase/migrations/20260820120000_lock_profiles_plan.sql`):**
```sql
-- P0-1: impedir que usuários escrevam profiles.plan (fonte de verdade do entitlement)
-- service_role IGNORA grants de coluna, então webhook e pg_cron continuam escrevendo plan.

REVOKE UPDATE (plan) ON public.profiles FROM authenticated, anon;

-- Defesa extra: se existirem colunas de privilégio, revogar também.
-- (rode só as linhas cujas colunas existirem — ver Fase 0.4)
-- REVOKE UPDATE (is_admin) ON public.profiles FROM authenticated, anon;
-- REVOKE UPDATE (role)     ON public.profiles FROM authenticated, anon;

-- Garantir que o dono ainda pode atualizar as demais colunas do próprio perfil.
-- A policy de UPDATE existente (auth.uid() = id) permanece; o REVOKE de coluna
-- atua ANTES da policy, bloqueando só a coluna plan.
```

**Por que `REVOKE` de coluna e não `WITH CHECK`:** `WITH CHECK` com subselect do valor antigo é frágil no PostgREST; o grant de coluna é a trava mais limpa e o `service_role` a ignora por design (não quebra webhook/cron).

**Aplicação:** você cola no SQL Editor. Eu crio o arquivo de migration no repo para manter o histórico sincronizado e registro em `supabase_migrations.schema_migrations`.

**Teste de validação (no console do navegador, logado como usuário comum):**
```js
const { data:{ user } } = await supabase.auth.getUser();
const r = await supabase.from('profiles').update({ plan:'enterprise' }).eq('id', user.id);
console.log(r.error ? 'BLOQUEADO ✅' : 'AINDA VULNERÁVEL ❌', r.error);
// Depois confirmar que edição legítima ainda funciona:
await supabase.from('profiles').update({ bio:'teste ok' }).eq('id', user.id); // deve passar
```
**Também:** simular um `subscription_created` de teste (payload starter) contra o webhook → `plan` deve subir para `starter` normalmente (service_role ignora o revoke).

**Risco:** baixo. Não desloga ninguém, não toca o webhook. Único cuidado: confirmar (Fase 0.4) que nenhum grant de coluna herdado dá `UPDATE(plan)` de outra forma.

---

### A2 — P0-2: fechar leitura de `profiles` + expor vitrine por view pública

**Objetivo:** parar o vazamento de PII (email, telefone, plan) de toda a base; a vitrine pública passa a ler só colunas públicas de perfis publicados.

**Colunas que a vitrine realmente usa** (levantado de `PublicPage.tsx`): `id, full_name, username, public_url, bio, avatar_url, public_avatar_url, public_cover_url, public_display_name, public_name, public_theme, public_page_active, public_page_created, whatsapp_group_url, telegram_group_url, discord_group_url`.
**Fora da view (sensível):** `email, phone, plan, joined_at, created_at, updated_at` e quaisquer campos internos.
**Único leitor anônimo de `profiles` no front:** `PublicPage.tsx` (confirmado; todos os outros leem o próprio `id` autenticado).

**SQL (migration `supabase/migrations/20260820121000_public_profiles_view.sql`):**
```sql
-- P0-2: remover leitura pública irrestrita de profiles e expor vitrine via view.

-- 1) Remover a policy que expõe a tabela inteira
DROP POLICY IF EXISTS "Todos podem ver perfis (página pública)" ON public.profiles;

-- 2) Garantir que sobra apenas a leitura do dono
--    (a policy "Usuários podem ver seu próprio perfil" USING (auth.uid()=id) permanece)

-- 3) View pública só com colunas públicas e só de perfis publicados
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true) AS
SELECT
  id, full_name, username, public_url, bio,
  avatar_url, public_avatar_url, public_cover_url,
  public_display_name, public_name, public_theme,
  public_page_active, public_page_created,
  whatsapp_group_url, telegram_group_url, discord_group_url
FROM public.profiles
WHERE public_page_active = true AND public_page_created = true;

-- 4) Conceder leitura da view a anônimos e autenticados
GRANT SELECT ON public.public_profiles TO anon, authenticated;
```
> Nota sobre `security_invoker`: mantém a view respeitando RLS. Como removemos a policy pública de `profiles`, a view precisa de leitura garantida — se `security_invoker=true` bloquear o anônimo (porque a policy do dono não casa), a alternativa é `security_invoker=false` (view roda como dono/definer) expondo **apenas** as colunas do SELECT acima. Definimos isso no teste; ambas as variantes só expõem as 16 colunas públicas.

**Mudança de código (eu aplico em `src/pages/PublicPage.tsx`):** trocar as duas queries `from('profiles').select('*')` (linhas ~220 e ~227) por `from('public_profiles').select('*')`. O restante da página não muda (os campos usados existem na view). A checagem `public_page_active/created` continua funcionando (a view já filtra; a página mostra "não encontrado" quando vier vazio).

**Teste de validação:**
```js
// Anônimo (sem login) — não deve vazar PII:
const a = await supabase.from('profiles').select('email,phone,plan').limit(5);
console.log(a.data?.length ? 'VAZANDO ❌' : 'FECHADO ✅', a.error);
// Vitrine pública de um perfil PUBLICADO deve continuar carregando:
// abrir /u/<username_publicado> no navegador → renderiza normal.
// Perfil NÃO publicado → página "não encontrado" (não expõe nada).
```
**Risco:** médio — se algum campo público faltasse na view, a vitrine quebraria; por isso a view foi montada exatamente com os 16 campos que a página usa. Testamos a vitrine logo após aplicar.

---

## BLOCO B — P1 (antes de escalar volume; podem entrar antes ou logo após o merge)

### B1 — P1-1: enforcement server-side dos limites de plano

**Objetivo:** impedir que o usuário fure os limites (ofertas/canais) por request direto ao PostgREST.

**Abordagem (menor raio de impacto):** trigger `BEFORE INSERT` que conta linhas do usuário e compara com o limite do plano (agora confiável, pós-A1).

**SQL (migration `20260820122000_enforce_plan_limits.sql`):**
```sql
-- P1-1: enforcement server-side de limite de ofertas por plano.
CREATE OR REPLACE FUNCTION public.enforce_offer_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_plan text;
  v_count int;
  v_max int;
BEGIN
  SELECT plan INTO v_plan FROM public.profiles WHERE id = NEW.user_id;
  v_max := CASE COALESCE(v_plan,'free')
    WHEN 'free' THEN 10
    WHEN 'starter' THEN 100
    ELSE 2147483647   -- pro/enterprise: ilimitado
  END;
  SELECT count(*) INTO v_count FROM public.offers
    WHERE user_id = NEW.user_id AND status = 'active';
  IF v_count >= v_max THEN
    RAISE EXCEPTION 'Limite de ofertas do plano % atingido (%).', v_plan, v_max
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS offers_plan_limit ON public.offers;
CREATE TRIGGER offers_plan_limit
BEFORE INSERT ON public.offers
FOR EACH ROW EXECUTE FUNCTION public.enforce_offer_limit();
```
> Um trigger análogo (`enforce_channel_limit`) para `channels`, separando WhatsApp/Telegram por `type` conforme `PLAN_CONFIGS`. Faço os dois juntos, testados. Os limites ficam espelhados do `src/config/plans.ts` — deixo um comentário no SQL apontando para a fonte para não divergirem.

**Teste:** inserir ofertas além do limite via `supabase.from('offers').insert(...)` repetido → a partir do limite retorna erro; o front (que já checa antes) continua mostrando o paywall.

**Risco:** médio — trigger que bloqueia INSERT precisa de teste (não pode barrar criação legítima dentro do limite, nem o webhook/admin). `SECURITY DEFINER` + contagem só do próprio `user_id`.

---

### B2 — P1-3: idempotência de webhook estável (remover `Date.now()`)

**Objetivo:** retries do mesmo evento não reprocessam.

**Código (eu edito `supabase/functions/cakto-webhook/lib/idempotency.ts`):** trocar o fallback com `Date.now()` por uma chave derivada de campos estáveis do payload:
```ts
export function getEventId(payload: Payload): string {
  const data = payload.data ?? {};
  if (data.id) return String(data.id);
  // fallback ESTÁVEL (sem Date.now): mesmo evento → mesma chave
  const sub = data.subscription?.id ?? "nosub";
  const stamp = (data as any).paidAt ?? (data as any).created_at ?? "nostamp";
  return `${payload.event ?? "unknown"}-${sub}-${stamp}`;
}
```
**Deploy:** `supabase functions deploy cakto-webhook` (você roda). **Teste:** enviar o mesmo payload 2x → segundo retorna `200 OK (duplicate)` e o handler não roda de novo.

**Risco:** baixo. Só melhora a detecção de duplicata.

---

### B3 — P1-2: confirmar evento autoritativo de assinatura (purchase_approved vs subscription_created)

**Objetivo:** garantir que não há janela de "pago sem liberação" por ordem de eventos.

**Ação:** confirmar na doc CACTO qual evento é autoritativo para assinatura recorrente. Como `subscription_created` já faz `upsert` idempotente por `cakto_subscription_id`, o ajuste provável é pequeno: se `purchase_approved` de assinatura chegar primeiro, ele deve disparar a mesma liberação (ou ser seguido garantidamente por `created`). Eu preparo o ajuste após a confirmação; **este item fica marcado como "requer 1 teste E2E real"** (compra starter + refund) antes do fechamento.

**Risco:** baixo no código; o valor está na validação E2E.

---

## GATE — E2E de billing + MERGE

Antes de mergear `feat/checkout-cakto → main`:
1. A1 e A2 aplicados e validados (exploit não funciona; vitrine ok).
2. Compra teste do **starter** libera o plano; **e** o exploit de auto-promoção falha.
3. Cancelamento → `pg_cron`/expiração rebaixa corretamente.
4. Build limpo (`npm run build`).

Passando: abrir PR `feat/checkout-cakto → main` e mergear. Sem `--force`, sem `--no-verify`.

---

## BLOCO C — P2 (hardening antes de operação madura)

### C1 — Security headers no `vercel.json` (eu edito)
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; img-src 'self' data: https:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.supabase.co https://pay.cakto.com.br; frame-ancestors 'none'" }
      ]
    }
  ]
}
```
> A CSP é o item mais delicado: precisa liberar Supabase e CACTO em `connect-src` e o que o app realmente carrega. Aplico em modo permissivo primeiro, testo o app com o console aberto, e aperto. **Risco:** médio — CSP errada quebra chamadas; por isso testamos com Network/Console.

### C2 — Remover `test-helper` do deploy de produção
Confirmar o que a função faz; se for utilitário de teste, remover do deploy (ou proteger por env de ambiente). **Risco:** baixo.

### C3 — Rate limiting em login/reset/`public-api`/webhook
Login/reset: usar limites nativos do Supabase Auth + captcha se necessário. `public-api`/webhook: contador simples por IP/API-key numa tabela ou KV. **Risco:** baixo/médio.

### C4 — Rotacionar e remover secrets dos `.md` versionados
`CONTINUAR_AMANHA.md` e handoffs contêm PAT Supabase, Client ID CACTO e Webhook Secret; `.env` tem `EVOLUTION_WEBHOOK_SECRET`. **Ações:** (1) rotacionar PAT no Supabase, (2) rotacionar webhook secret na CACTO + atualizar secret no Supabase, (3) remover os valores dos `.md` (deixar `REDACTED`), (4) manter só no gerenciador de secrets. **Risco:** baixo — só reconfigurar; fazer webhook secret com janela curta.

### C5 — `drop console` no build de produção (eu edito `vite.config.ts`)
```ts
export default defineConfig({
  plugins: [react()],
  esbuild: { drop: ['console', 'debugger'] },
});
```
**Risco:** baixo.

### C6 — Resolver divergência da constraint `plan` (P2-4)
Conforme Fase 0.3: se a constraint viva não tiver `starter`, aplicar
```sql
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free','starter','pro','enterprise'));
```
**Risco:** baixo (só se a constraint antiga estiver ativa).

---

## BLOCO D — P3 (pós-produção / qualidade)

- **D1 Google OAuth:** configurar no Google Cloud + Supabase (Redirect URLs) → destrava o botão "Continuar com Google".
- **D2 Validar claim por e-mail** em inbox real (magic link) ponta-a-ponta.
- **D3 Testes automatizados** dos caminhos críticos: RLS/autorização (os P0), handlers de webhook, feature gates, claim. Começar com Vitest + um E2E leve (Playwright) de login→checkout.
- **D4 Rebrand aflyo:** `APP_NAME`, storageKey `sb-linkoferta-auth`, `disparoflow.checkout_intent`, URLs `disparoflow.com.br`/`linkoferta.vercel.app` → domínio real. Coordenar com a branch `feat/rework-aflyo`.
- **D5 Higiene de repo:** consolidar migrations (raiz → `supabase/migrations/`), mover os 50+ `.md` para `/docs`, limpar TODOs relevantes, resolver `lint`.

---

## Sequência exata recomendada (com gates de aprovação)

| # | Etapa | Tipo | Quem aplica | Gate |
|---|---|---|---|---|
| 0 | Confirmar policies/schema ao vivo | SQL leitura | você roda, me manda | resultado confere |
| 1 | **A1** revogar write de `plan` | migration | você (SQL editor) | exploit → bloqueado; edição legítima ok; webhook promove |
| 2 | **A2** view pública + fechar `profiles` | migration + código | eu (código) / você (SQL) | PII fechada; vitrine publicada carrega |
| 3 | E2E billing starter + exploit falha | teste | juntos | verde |
| 4 | **Merge** `feat/checkout-cakto` | git | você aprova | PR mergeado |
| 5 | **B1** limites server-side | migration | você (SQL) | insert acima do limite bloqueia |
| 6 | **B2** idempotência estável | código+deploy | eu / você deploy | retry duplicado = no-op |
| 7 | **B3** evento autoritativo | verificação+E2E | juntos | compra real ok |
| 8 | **C1–C6** hardening | código+SQL | eu / você | app ok com headers; secrets rotacionados |
| 9 | **D1–D5** | vários | juntos | por item |

**Dependências-chave:** B1 depende de A1 (plan confiável). A2 depende do inventário de colunas (já feito). Merge depende de A1+A2+E2E. Nada em C/D antes do merge.

---

## O que eu preciso de você para começar

1. Rodar os 4 SELECTs da **Fase 0** e me mandar o resultado (assim eu confirmo o alvo antes de qualquer alteração).
2. Confirmar que posso **editar o código no repo** (`PublicPage.tsx`, `idempotency.ts`, `vercel.json`, `vite.config.ts`) e commitar na branch `feat/checkout-cakto`.
3. Dizer se você prefere **aplicar o SQL você mesmo** no SQL Editor (recomendado) ou me autorizar a chamar a Management API do Supabase.

Assim que você me passar o resultado da Fase 0, começo pela **etapa 1 (A1)** — a correção mais crítica e de menor risco — e paro para você validar antes de seguir.
