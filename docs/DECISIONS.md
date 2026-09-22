# Decisões técnicas

## ADR-001 — SPA React/Vite

**Contexto:** o produto precisa de painel interativo e usa Supabase como backend.  
**Decisão:** React 19 + Vite + React Router, hospedado na Vercel.  
**Consequência:** não há middleware, Server Components ou Server Actions; proteção de rota no cliente não substitui RLS/autorização das Edge Functions.

## ADR-002 — Supabase como backend

**Contexto:** autenticação, dados, arquivos e tarefas precisam compartilhar identidade.  
**Decisão:** Supabase Auth/Postgres/RLS/Storage/Realtime/Functions/cron.  
**Consequência:** migrations, RLS e grants fazem parte da regra de negócio; `service_role` é restrita ao servidor.

## ADR-003 — Isolamento por `user_id` e views públicas

**Contexto:** vitrines precisam ser públicas sem revelar o perfil completo.  
**Decisão:** dados privados usam policies por `auth.uid()`; páginas públicas usam `public_profiles`, `public_offers` e RPCs específicas.  
**Consequência:** adicionar coluna a tabela não a torna pública automaticamente; views exigem revisão explícita.

## ADR-004 — Cakto como PSP ativo

**Contexto:** o histórico contém nomenclatura genérica/Stripe, mas o checkout atual é Cakto.  
**Decisão:** Edge Functions próprias, webhook idempotente e catálogo de offer IDs.  
**Consequência:** segredos ficam no Supabase; colunas `provider_*` preservam independência parcial do fornecedor.

## ADR-005 — Limites no banco com espelho no front

**Contexto:** a UI precisa explicar limites e o servidor precisa garanti-los.  
**Decisão:** `plan_limits` é persistido e triggers validam escrita; `src/config/plans.ts` espelha para UX.  
**Consequência:** toda mudança requer migration, ajuste do espelho e `check:plan-limits`.

## ADR-006 — Ofertas ilimitadas e sem TTL

**Contexto:** migrations antigas limitavam/expiravam ofertas.  
**Decisão:** remover limite e desativar expiração automática (`20260831000200`, `20260903180000`).  
**Consequência:** retenção e limpeza de ofertas passam a depender de ação do usuário/administrador.

## ADR-007 — Painel admin separado

**Contexto:** operações privilegiadas exigem superfície e controles próprios.  
**Decisão:** app em `admin/`, domínio próprio e `admin-api` com RBAC + MFA `aal2`.  
**Consequência:** `/admin` no app do cliente não abre o painel; novas operações devem declarar permissão e auditoria.

## ADR-008 — Sessão PKCE resiliente

**Contexto:** callbacks OAuth e storage corrompido causavam boot travado.  
**Decisão:** PKCE, callback liberado do gate inicial, timeouts e storage tolerante a erro (`src/App.tsx`, `src/lib/supabase.ts`).  
**Consequência:** falhas privadas exibem recuperação; páginas públicas continuam renderizando quando possível.

## ADR-009 — Somente mensal por enquanto

**Contexto:** tipos e dados históricos aceitam anual.  
**Decisão:** catálogo e interface oferecem somente mensal.  
**Consequência:** não remover `yearly` do schema sem migração de compatibilidade.

