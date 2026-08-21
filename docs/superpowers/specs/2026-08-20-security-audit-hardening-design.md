# Design — Auditoria de Segurança, Privacidade, LGPD e Hardening de Produção

**Projeto:** ofertapro (marca em rebrand para aflyo)
**Branch de trabalho:** `feat/checkout-cakto`
**Data:** 2026-08-20
**Escopo:** auditoria técnica completa em 10 camadas + implementação das correções P0/P1 tecnicamente aplicáveis + prontidão para produção.
**Origem:** prompt mestre do usuário (auditoria completa OWASP/ASVS/LGPD).

---

## 1. Contexto

### 1.1 Stack real descoberta

- **Frontend:** React 19 + Vite + TypeScript + TailwindCSS (SPA).
- **Backend:** Supabase (Auth + Postgres + 15 Edge Functions).
- **Pagamento:** Cakto (checkout hospedado + webhook + OAuth `/public_api/token/`).
- **Integrações externas:** Evolution API (WhatsApp), provável LLM em `enrich-product`.
- **Deploy:** hosting a confirmar durante a auditoria.
- **Ambiente Supabase:** projeto `zuqaccivowbzdfrpgekz`, dono `zapsaas@proton.me`.

### 1.2 Modelo de negócio confirmado

- SaaS **B2C individual**: cada `profiles.id` corresponde a 1 usuário com 1 assinatura Cakto.
- Sem organizações, workspaces, teams ou multi-tenant complexo.
- Cada usuário só vê seus próprios dados (ofertas, canais, WhatsApp).
- Existe painel administrativo — quem acessa ainda não decidido (isso vira P0/P1 da auditoria).
- Sem trackers/analytics/marketing instalados hoje.

### 1.3 Estado da branch `feat/checkout-cakto`

- 18 commits acima de `main`, HEAD `0be8fdc`.
- Plano Cakto STARTER live, `FEATURES.billing=true`.
- Handoff completo em `CONTINUAR_AMANHA.md` marca a branch `READY_TO_MERGE` com 2 "Important" já mapeados: RLS ausente em `pending_subscriptions` + `webhook_events`, e `NewOfferModal` renderizando modal legacy.
- **Merge está bloqueado até esta auditoria concluir a Fase 1 verde e você aprovar explicitamente.**

### 1.4 Fora de escopo definitivo

- **Rebrand Aflyo** (strings `APP_NAME`, `disparoflow.checkout_intent`, URLs hardcoded) — de outro chat/workspace.
- **Execução em DNS/SPF/DKIM/DMARC/WAF/CDN** — só recomendação; execução depende do painel do domínio/hospedagem.
- **Teste de restore de backup em produção** — recomendo caminho seguro; execução é sua.
- **Trackers/consent banner** — nenhum tracker instalado hoje, então cookie/consent vira só recomendação preventiva para o futuro.
- **Decisões jurídicas** (razão social, DPO, prazos, jurisdição) — rascunhos gerados com placeholders `[DEFINIR COM RESPONSÁVEL JURÍDICO/NEGÓCIO]`.

---

## 2. Abordagem escolhida

**Fases com checkpoint (Opção B da conversa de brainstorming).** Cada fase entrega valor independente e tem approval gate no fim.

| Fase | Escopo | Entregável | Desbloqueia |
|------|--------|------------|-------------|
| **1 – Crown jewels** | Auth + authz + RLS + billing Cakto + secrets bundle + cookies | Findings + fix wave dos P0 | **Merge da branch** se sair verde |
| **2 – Superfície pública** | 14 edge functions restantes + CORS + headers + rate limit | Findings + fixes P0/P1 | Confiança em endpoints públicos |
| **3 – Dados e LGPD** | Inventário de dados + terceiros + rascunhos jurídicos | Matriz LGPD + `docs/legal/*.md` | Prontidão jurídica |
| **4 – Hardening e relatório final** | Logs, monitoring, backup rec, supply chain, tratamento de erros | Relatório consolidado + checklist de produção | Prontidão pra produção |

**Estimativa total:** 4-6 sessões de trabalho concentradas. Fase 1 é a mais densa; Fase 4 é a menor.

---

## 3. Arquitetura da auditoria

### 3.1 Ciclo interno de cada fase

1. **Inventário** — mapear a superfície da fase (tabelas + policies, edge functions, rotas, deps).
2. **Auditoria com evidência** — cada finding tem: arquivo/linha ou tabela/policy, cenário de exploração, severidade, mapeamento OWASP.
3. **Teste real onde couber** — SQL contra `pg_policies`, curl contra edge functions com JWT de user de teste, inspeção do `dist/` buildado, teste ativo de webhook Cakto.
4. **Sinalização inline de P0 crítico** — se achado no meio da fase, paro e reporto imediatamente antes de continuar.
5. **Fix wave da fase** — P0 + P1 tecnicamente aplicáveis e de baixo risco de regressão. P2/P3 ficam no relatório.
6. **Checkpoint com o usuário** — achados + fixes aplicados + pendências. Aprovação → próxima fase.

### 3.2 Artefatos produzidos

- `docs/superpowers/specs/2026-08-20-security-audit-hardening-design.md` — este documento.
- `docs/superpowers/plans/2026-08-20-security-audit-hardening.md` — plano de execução (writing-plans).
- `.superpowers/sdd/2026-08-20-security-audit/findings/faseN.md` — 1 arquivo por fase, IDs `FASEN-NNN`.
- `.superpowers/sdd/2026-08-20-security-audit/report-final.md` — relatório consolidado ao fim da Fase 4.
- `docs/legal/*.md` — rascunhos jurídicos com placeholders (Fase 3).
- Commits em `feat/checkout-cakto`: `fix(security): <tema>` ou `feat(security): <tema>`, um por fix isolado ou por cluster correlacionado.

### 3.3 Regras invioláveis

- Sem `--no-verify`, sem `git push --force`, sem operação destrutiva em produção.
- Secrets sempre mascarados nos relatórios: `sk_live_************1234`.
- Users de teste sempre prefixados `sectest_*` com cleanup no fim de cada fase.
- PAT Supabase sempre inline (`SUPABASE_ACCESS_TOKEN=... comando`) e REDACT em qualquer log.
- Merge da branch só depois de Fase 1 verde + aprovação explícita.
- Se um fix mexer em auth/DB/webhook de forma que possa deslogar usuários existentes ou quebrar webhook em voo, PAUSO e pergunto.

---

## 4. Fase 1 — Crown jewels (detalhada)

### 4.1 Subáreas

**1.1 Auth Supabase**

- Ler `src/lib/supabase.ts` e todas as chamadas de `createClient`/`signIn*`/`signUp` — confirmar que só `anon` key vai pro frontend, nunca `service_role`.
- Fluxos: signup, login, password reset, email confirmation, logout — verificar construção de redirects (open redirect via `redirectTo`?), expiração de OTP/magic link, single-use de tokens de reset.
- `.env` + `dist/` buildado: grep por `service_role`, `sbp_`, `sk_`, `SUPABASE_SERVICE`, chaves conhecidas do handoff.

**1.2 Autorização + RLS**

- Via PAT: `SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public'` — listar TODAS as tabelas + status RLS.
- Para cada tabela com dados de usuário: `SELECT * FROM pg_policies WHERE tablename='...'` — inspecionar policies de SELECT/INSERT/UPDATE/DELETE.
- **Teste ativo IDOR** (com autorização já dada): criar `sectest_a@test.aflyo.local` e `sectest_b@test.aflyo.local`, popular dados de A, logar como B e tentar via curl PostgREST direto:
  - `GET /rest/v1/profiles?id=eq.<A_id>` — deve retornar vazio
  - `GET /rest/v1/subscriptions?user_id=eq.<A_id>` — deve retornar vazio
  - `PATCH /rest/v1/profiles?id=eq.<A_id>` com body `{plan:'pro'}` — deve falhar
  - Mesmos testes contra `offers`, `channels`, `whatsapp_*`, qualquer tabela com FK para `auth.users`.
- Já sabido como falha: RLS ausente em `pending_subscriptions` + `webhook_events`. Confirmar via SQL, incluir no fix wave.

**1.3 Billing Cakto**

- `supabase/functions/cakto-webhook/index.ts` — verificar validação do `secret` do payload, single-use via `webhook_events` (replay attack), tratamento de eventos fora de ordem, idempotência por `event_id`.
- `cakto-claim-subscription` + `cakto-finalize-claim` — magic link: token seguro? single-use? expiração? Já sabido: `if (as_user && as_user !== user.id)` está errado (defense-in-depth), incluir no fix.
- `cakto-cancel-subscription` — autorização: só o dono da subscription pode cancelar.
- Verificar que **plano/entitlement** sempre vem do banco (validado no server), nunca do frontend. Ler `src/hooks/useCheckoutIntent.ts` + `useSubscription.ts` + qualquer código que decida "user tem acesso a X".
- **Teste ativo webhook**: enviar payload sem secret válido, com secret de payload diferente (tamper), replay do mesmo `event_id` — todos devem falhar/idempotência-noop.

**1.4 Secrets no bundle**

- `npm run build` + inspecionar `dist/assets/*.js` — grep por: `service_role`, `sbp_`, chaves Cakto (client secret, webhook secret), qualquer variável não-`VITE_*` que tenha vazado.
- Verificar `.env` vs `.env.example` — quais vars vão pro build e quais devem ficar server-only.

**1.5 Cookies/sessão do Supabase Auth**

- Cookies criados pelo `@supabase/supabase-js`: `HttpOnly`? `Secure`? `SameSite`? Como o browser guarda o JWT.
- Session refresh: onde acontece, se pode ser abusado, se logout invalida em todo lugar.

### 4.2 Critérios de bloqueio

**P0 (bloqueiam merge se aparecerem):**

- Qualquer user acessando dados de outro (IDOR/BOLA confirmado).
- RLS ausente em tabela com PII.
- Service role key no bundle ou em logs.
- Webhook Cakto aceitando payload sem `secret` válido ou permitindo replay.
- Frontend definindo `plan`/`role` que o backend confia sem revalidar.
- Auth bypass (qualquer forma).

**P1 (bloqueiam merge se em conjunto ≥3, senão viram commits follow-up antes de merge):**

- CORS excessivamente permissivo em endpoints autenticados.
- Rate limit ausente em login/reset.
- Logs contendo tokens/PII.
- Erro handler retornando stack trace em prod.

### 4.3 Fix wave — o que aplico sem reperguntar

- `ALTER TABLE ... ENABLE RLS` em tabelas expostas (já mapeado: `pending_subscriptions`, `webhook_events`).
- Correção do bug `as_user` em `cakto-finalize-claim`.
- Adicionar validação do `secret` do webhook se ausente/frouxa.
- Remoção de secrets em código versionado (rotação depende de o usuário trocar no Cakto/Supabase).
- Ajustes de policies claramente erradas.

### 4.4 Fix wave — o que PAUSO e pergunto antes

- Mudar comportamento de auth (redirect URLs, cookie flags, session TTL) — pode deslogar usuários existentes.
- Alterar schema de tabela com dados em produção — pode quebrar queries.
- Alterar contrato de webhook — pode causar falha em cobrança em voo.

---

## 5. Fases 2, 3 e 4 (alto nível)

Redetalhamento acontece no início de cada fase (posso aprender coisas na Fase 1 que mudam o plano das seguintes).

### 5.1 Fase 2 — Superfície pública

**Escopo:** as 14 edge functions fora de billing + qualquer endpoint frontend com HTTP direto.

- `public-api/` — endpoint autenticado por API key. Verificar validação constant-time, rate limit, escopo/permissões, log de uso, revogação efetiva.
- `api-key-generate/` + `api-key-revoke/` — geração criptograficamente segura, hash no banco (nunca claro), autorização (só dono revoga próprias keys).
- `evolution-*` (7 funções) — auth, `instanceName` do usuário (path traversal? tenant crossing?), origem do webhook Evolution.
- `enrich-product/` — provável LLM. Prompt injection, rate limit por usuário (custo), API key do provider no client? PII para terceiro?
- `test-helper/` — **suspeito**. Auditar se: (a) só existe em dev, (b) requer auth admin, ou (c) precisa ser removida em prod.
- CORS de cada função (`*` em endpoint autenticado é P1).
- Headers de segurança na resposta HTML (via config de hosting): CSP, HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.
- Rate limiting: se ausente, propor camada leve.

**P0 dessa fase:**
- `test-helper` acessível sem auth admin em prod.
- API key sem hash no banco.
- Evolution instance de user A manipulável por user B.
- LLM prompt injection que exfiltre dados.

**Aplico sem perguntar:** CORS específico, headers em config de hosting, hash de API keys (com migration de rehash), remoção de `test-helper` se confirmado.

### 5.2 Fase 3 — Dados e LGPD

**Escopo:** o que vive no sistema, quem toca, quanto tempo fica.

- Inventário de tabelas + colunas com PII (finalidade, retenção, mecanismo de exclusão).
- Fluxo de dados pra terceiros: Cakto (email/nome), Evolution (números WhatsApp), LLM em `enrich-product`.
- Direitos do titular: existe mecanismo de exportação/exclusão? Se não, P1.
- Rascunhos jurídicos em `docs/legal/`:
  - `termos-de-uso.md`
  - `politica-de-privacidade.md`
  - `politica-de-cookies.md` (curta — sem trackers hoje)
  - `politica-de-cancelamento-e-reembolso.md` (Cakto/subscription)
  - Placeholders `[DEFINIR COM RESPONSÁVEL JURÍDICO/NEGÓCIO]` para: razão social, CNPJ, endereço, DPO, prazos, jurisdição.
- Retenção/exclusão proposta (números decididos por você): `webhook_events` >90 dias purgados, backups criptografados, dados após cancelamento por X dias.

**Não implemento sem confirmar:** exclusão real de dados, política de retenção via cron, purge de `webhook_events`.

### 5.3 Fase 4 — Hardening + relatório final

- Logs/monitoring existente hoje (Supabase default? Sentry? nada?). Se nada, recomendar Sentry + alertas em eventos de segurança.
- Supply chain: `npm audit` + análise de deps críticas. Reportar, não atualizar cegamente.
- Backup/DR: verificar config Supabase, propor teste de restore em projeto separado. Usuário executa.
- Tratamento de erros: grep por `catch(e){}` silencioso, checar retornos de webhook (200 impede reagendamento Cakto).
- DNS/SPF/DKIM/DMARC: só relatório do que verificar no registrador/provedor.
- **Relatório final consolidado** em `.superpowers/sdd/2026-08-20-security-audit/report-final.md` seguindo formato das seções 42-49 do prompt do usuário: exec summary, arquitetura, superfície, matriz de conformidade, vulnerabilidades numeradas, mapa OWASP, matriz LGPD, inventários (cookies=vazio, terceiros), alterações realizadas, itens não implementáveis, checklist de produção (bloqueadores/recomendado/pós-lançamento).

---

## 6. Formato de findings

Cada finding em `.superpowers/sdd/2026-08-20-security-audit/findings/faseN.md`:

```
## [FASEN-NNN] Nome curto do problema
**Severidade:** P0 | P1 | P2 | P3 | INFO
**Categoria OWASP:** A01 Broken Access Control | A05 Injection | ...
**Componente:** src/foo/bar.ts:42 | supabase/functions/... | pg_policy X em tabela Y

**Evidência:** trecho de código ou saída de comando (secrets mascarados)
**Cenário de exploração:** passo a passo do que um atacante faria
**Impacto:** o que ele consegue
**Probabilidade:** alta | média | baixa (com justificativa)
**Correção proposta:** o que muda, em qual arquivo
**Status:** pendente | em correção | corrigido em <commit> | não corrigido — motivo
```

IDs sequenciais por fase. Reclassificação anotada no final do item.

---

## 7. Processo de fix

- **1 commit por fix ou por cluster correlacionado** (4 tabelas ganhando RLS num commit faz sentido; misturar RLS + HMAC não).
- **Mensagem:** `fix(security): <tema>` para correções, `feat(security): <tema>` para adições (ex.: rate limit).
- **Antes de cada commit:** `npm run build` + `npx tsc --noEmit`. Se quebrar, não commita.
- **Depois de cada commit:** hash anotado no finding correspondente.
- **Rollback:** cada commit isolado, `git revert <hash>`. Migrations de RLS com par down/up quando aplicável.
- **Deploy de edge function em prod** (`supabase functions deploy`): PAUSO e confirmo com usuário mesmo com autorização geral já dada — deploy afeta usuários vivos.

---

## 8. Ambiente de teste

- **Users de teste:** email `sectest_<uuid>@test.aflyo.local`.
- **Dados de teste:** só o mínimo pra provar o cenário. Sem cópias de dados de produção.
- **Cleanup:** ao fim de cada fase, script SQL removendo tudo `sectest_*` — cascade delete via FK. Confirmação em cada `DELETE`.
- **Nunca alterar/deletar registros reais** (os 9 profiles em prod ficam intocados).
- **Testes destrutivos** (ex.: tentar drop via injection) rodam em cópia local do schema ou projeto Supabase separado, nunca em `zuqaccivowbzdfrpgekz`.
- **Testes de rate limit** ficam abaixo do threshold de DoS — 3-5 requests, não 1000.
- **Prompt injection contra `enrich-product`** com payload defensivo (`ignore previous instructions`), não com payload que force ação cara.

---

## 9. Regras de escape

### 9.1 STOP imediato durante a auditoria

- Vazamento ativo em produção (RLS que já vazou dado real) — reporto pra decisão de comunicação com titulares.
- Secret real vazado publicamente (histórico git, bundle, log) — reporto para rotação (só o usuário tem acesso ao Cakto/Supabase billing).
- Decisão que muda contrato do produto (novo endpoint, mudança de fluxo de login).
- Fix wave de uma fase estimado passar >4h — pauso e replanejo.
- Decisão jurídica necessária — marco `REVISÃO JURÍDICA NECESSÁRIA` e continuo o resto.

### 9.2 Aborto da auditoria

- Usuário pede pra parar.
- Perda de confiança em testar sem risco (PAT parar de funcionar, sem forma segura de criar users de teste).
- Problema estrutural que exija replanejamento maior que o próprio design.

Se abortar, commit final marcando estado + relatório parcial. Nada em limbo.

---

## 10. Referências

- OWASP Top 10:2025
- OWASP ASVS 5.0.0
- OWASP Cheat Sheet Series
- Princípios: Secure by Design, Defense in Depth, Least Privilege, Privacy by Design, Privacy by Default
- LGPD (Lei 13.709/2018)
- Orientações aplicáveis da ANPD

---

## 11. Terminal state

Depois deste spec aprovado pelo usuário, invocar `superpowers:writing-plans` para gerar o plano de execução detalhado em `docs/superpowers/plans/2026-08-20-security-audit-hardening.md`.
