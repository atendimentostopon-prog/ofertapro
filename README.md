# Aflyo

Aflyo é um SaaS para afiliados criarem e divulgarem ofertas em WhatsApp, Telegram e Discord, manterem uma vitrine pública e acompanharem cliques e disparos. O produto roda como SPA React; autenticação, banco, Storage, funções de backend e tarefas agendadas ficam no Supabase.

## Stack

- React 19, TypeScript e Vite 8
- Tailwind CSS 3
- React Router 7
- Supabase (Auth, PostgreSQL, RLS, Storage, Realtime e Edge Functions)
- Cakto para checkout e assinaturas
- Evolution API para WhatsApp e Resend para e-mail
- Vercel para hospedagem do front-end

## Rodar localmente

1. Instale Node.js compatível com Vite 8 e execute `npm ci`.
2. Copie `.env.example` para `.env.local` e preencha as variáveis públicas necessárias. Não versione segredos.
3. Execute `npm run dev` e abra `http://localhost:5173`.

O front-end local usa um projeto Supabase configurado nas variáveis `VITE_SUPABASE_*`. O repositório não contém uma configuração completa do Supabase CLI para subir toda a pilha local: veja [Desenvolvimento](docs/DEVELOPMENT.md).

## Scripts

| Comando | Finalidade |
|---|---|
| `npm run dev` | servidor Vite com recarga automática |
| `npm run build` | TypeScript (`tsc -b`) e build de produção |
| `npm run lint` | ESLint em todo o repositório |
| `npm run preview` | serve o build localmente |
| `npm run check:plan-limits` | confere o espelho dos limites de planos |
| `npm run check:billing` | regressões de cobrança e expiração |
| `npm run check:api-key-rollout` | confere o rollout das funções de chave de API |

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Banco de dados](docs/DATABASE.md)
- [APIs e webhooks](docs/API.md)
- [Variáveis de ambiente](docs/ENVIRONMENT.md)
- [Desenvolvimento e deploy](docs/DEVELOPMENT.md)
- [Regras de negócio](docs/BUSINESS-RULES.md)
- [Decisões técnicas](docs/DECISIONS.md)
