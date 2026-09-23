# Desenvolvimento

## Setup

1. Instale Node.js compatível com Vite 8, Git e, para backend local, Supabase CLI e Docker.
2. Execute `npm ci`.
3. Crie `.env.local` a partir de `.env.example` e preencha apenas valores do ambiente de desenvolvimento.
4. Execute `npm run dev`.

## Comandos

| Objetivo | Comando |
|---|---|
| desenvolvimento | `npm run dev` |
| lint | `npm run lint` |
| typecheck | `npx tsc -b` |
| build | `npm run build` |
| preview | `npm run preview` |
| limites de planos | `npm run check:plan-limits` |
| regressões de billing | `npm run check:billing` |
| rollout de API keys | `npm run check:api-key-rollout` |

Não há script `test` geral. Testes Deno ficam próximos das Edge Functions e testes SQL manuais em `supabase/tests/manual/`.

## Supabase local

O repositório não possui `supabase/config.toml`; por isso, o fluxo completo `supabase start` não está confirmado como pronto. Para habilitá-lo, inicialize/vincule o projeto deliberadamente e valide as migrations em banco descartável. Nunca execute uma migration nova diretamente em produção.

Fluxo recomendado:

1. Crie uma migration em `supabase/migrations/` com timestamp crescente.
2. Teste em uma instância descartável e rode os testes SQL aplicáveis.
3. Rode lint, typecheck, build e os checks de domínio.
4. Revise RLS, grants, locks e compatibilidade com dados existentes.
5. Aplique primeiro no ambiente de preview/homologação.

## Convenções observadas

- Componentes React em PascalCase; hooks começam com `use`.
- Serviços encapsulam CRUD; integrações e regras compartilhadas ficam em `src/lib`.
- Commits recentes usam Conventional Commits: `feat(escopo):`, `fix(escopo):`, `docs(escopo):`.
- Alterações de limites exigem migration em `plan_limits`, atualização de `src/config/plans.ts` e `npm run check:plan-limits`.
- Toda tabela por usuário deve ter `user_id`, RLS habilitada e policy explícita.

## Criar uma feature

1. Identifique a regra no servidor e a autorização antes da UI.
2. Se houver schema novo, faça migration reversível/compatível e RLS na mesma entrega.
3. Adicione tipos, serviço/hook e depois a tela.
4. Cubra a regra com check de regressão ou teste da Edge Function.
5. Atualize a documentação afetada.

## Deploy e rollback

O front é preparado para Vercel (`vercel.json`). Edge Functions e migrations são entregas separadas do Supabase. [NÃO CONFIRMADO] O repositório não contém workflow CI/CD que prove a ordem ou os comandos usados no ambiente de produção.

- Front: gere preview, valide e promova na Vercel. Rollback é a promoção de um deployment anterior.
- Edge Functions: publique a versão compatível com o schema vigente; para rollback, redeploy da versão anterior.
- Banco: prefira migrations corretivas para frente. Não reverta migration destrutiva em produção sem backup e plano de dados.

## Troubleshooting

- **Boot preso:** confira as variáveis Supabase, rede e sessão local; o app força timeout em 5 s e oferece limpeza da sessão.
- **OAuth volta ao login:** confira `VITE_PUBLIC_APP_URL` e a allowlist de redirects no Supabase/Google.
- **403/401:** confira JWT, RLS e se a função exige MFA/permissão admin.
- **Limite divergente:** rode `npm run check:plan-limits`.
- **Checkout sem carregar:** confira `VITE_CAKTO_CLIENT_ID` e os secrets Cakto das funções.
- **WhatsApp indisponível:** confira URL/chave da Evolution e o estado da instância.
- **Rota direta dá 404:** confira os rewrites de SPA na Vercel.

