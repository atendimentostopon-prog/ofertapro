# Guia operacional para agentes

## Produto

Aflyo é uma SPA React/Vite para afiliados criarem ofertas, vitrines e disparos em WhatsApp, Telegram e Discord. Backend: Supabase. PSP: Cakto. Hospedagem do front: Vercel.

## Comandos essenciais

```bash
npm ci
npm run dev
npm run lint
npx tsc -b
npm run build
npm run check:plan-limits
npm run check:billing
npm run check:api-key-rollout
```

Não existe `npm test` geral.

## Estrutura

- `src/pages`: rotas/telas
- `src/components`: componentes
- `src/hooks`: estado e regras de UI
- `src/services`: CRUD Supabase
- `src/lib`: integrações e regras compartilhadas
- `src/config`: planos, catálogo e flags
- `supabase/functions`: Edge Functions Deno
- `supabase/migrations`: schema versionado
- `supabase/tests/manual`: testes SQL manuais
- `admin`: app administrativo separado
- `browser-extension`: extensão Mercado Livre

## Convenções

- TypeScript, componentes PascalCase e hooks `use*`.
- Commits no formato `feat(escopo):`, `fix(escopo):`, `docs(escopo):`.
- Multi-tenancy por `user_id` + RLS.
- Valores de plano persistidos: `free`, `starter`, `pro`, `enterprise`.
- `enterprise` é exibido como Business.
- Limites: banco em `plan_limits`, espelho em `src/config/plans.ts`.
- Operações privilegiadas ficam em Edge Functions, nunca no browser.

## Armadilhas conhecidas

- Isto não é Next.js; não existem Server Actions ou middleware.
- Cakto é o PSP ativo; referências a Stripe são históricas/genéricas.
- O app admin é separado; `/admin` no cliente é intencionalmente indisponível.
- Ofertas são ilimitadas e não expiram automaticamente.
- Venda anual está desativada, mas `yearly` deve continuar compatível.
- `history.channel_count` tem semântica divergente entre cliente e API.
- Inserção anônima de cliques é deliberada, mas permite inflação de métricas.
- `VITE_*` é público. A referência a `VITE_EVOLUTION_API_KEY` é dívida de segurança.
- Há scripts SQL antigos na raiz; migrations em `supabase/migrations` são o histórico versionado mais confiável.
- O repositório não possui `supabase/config.toml`; não presuma que `supabase start` funciona sem preparação.

## Nunca fazer

- Nunca colocar `SUPABASE_SERVICE_ROLE_KEY`, segredos Cakto, Resend ou Evolution no cliente.
- Nunca ler, imprimir ou commitar `.env`/`.env.local`.
- Nunca aplicar migration nova diretamente em produção.
- Nunca criar tabela por usuário sem RLS e policy explícita.
- Nunca confiar apenas em `ProtectedRoute` ou validação da UI para autorização.
- Nunca mudar limites só no front; altere banco + espelho + check.
- Nunca remover compatibilidade `yearly` sem auditar dados antigos.
- Nunca usar `service_role` para substituir uma policy RLS mal definida.
- Nunca editar `admin_audit_log`; o log é imutável.
- Nunca fazer force push, deploy ou merge sem autorização explícita.

## Antes de entregar

1. Rode lint, typecheck e build.
2. Rode os checks do domínio afetado.
3. Revise RLS/grants em qualquer mudança de dados.
4. Atualize a documentação correspondente.

