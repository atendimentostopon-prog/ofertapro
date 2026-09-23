# Variáveis de ambiente

Nunca coloque valores reais nesta documentação. Variáveis `VITE_*` são incorporadas ao bundle e, portanto, públicas.

| Nome | Finalidade | Onde é usada | Obrigatória | Tipo | Ambientes |
|---|---|---|---|---|---|
| `VITE_PUBLIC_APP_URL` | URL canônica do painel e callbacks | `src/config/app.ts` | sim em produção | pública | local/Vercel |
| `VITE_SHORTLINK_URL` | base de links `/o/:code` | `src/config/app.ts`, `public-api` | recomendada | pública | local/Vercel/Edge |
| `VITE_SUPABASE_URL` | endpoint do projeto Supabase | front inteiro | sim | pública | local/Vercel |
| `VITE_SUPABASE_ANON_KEY` | chave pública do Supabase | `src/lib/supabase.ts` | sim | pública | local/Vercel |
| `VITE_EVOLUTION_URL` | acesso direto legado à Evolution | `src/lib/evolution.ts` | para WhatsApp direto | pública | local/Vercel |
| `VITE_EVOLUTION_API_KEY` | credencial usada pelo browser no fluxo legado | `src/lib/evolution.ts` | para fluxo legado | **secreta exposta ao cliente** | local/Vercel |
| `VITE_CAKTO_CLIENT_ID` | client id do SDK transparente | `src/config/cakto.ts` | para checkout | pública | local/Vercel |
| `SUPABASE_URL` | URL interna do Supabase | Edge Functions | sim | servidor | Supabase |
| `SUPABASE_ANON_KEY` | valida JWT nas funções | Edge Functions | sim | servidor/pública | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | operações que ignoram RLS | Edge Functions | sim nas funções privilegiadas | secreta | Supabase |
| `CAKTO_CLIENT_ID` | autenticação servidor Cakto | `_shared/cakto.ts` | para billing | secreta | Supabase |
| `CAKTO_CLIENT_SECRET` | autenticação servidor Cakto | `_shared/cakto.ts` | para billing | secreta | Supabase |
| `CAKTO_WEBHOOK_SECRET` | autentica webhooks Cakto | `cakto-webhook` | sim | secreta | Supabase |
| `EVOLUTION_API_URL` | endpoint servidor da Evolution | funções Evolution e `public-api` | para WhatsApp | servidor | Supabase |
| `EVOLUTION_API_KEY` | autenticação servidor da Evolution | mesmas funções | para WhatsApp | secreta | Supabase |
| `EVOLUTION_WEBHOOK_SECRET` | assinatura compartilhada do webhook | create/webhook Evolution | recomendada | secreta | Supabase |
| `RESEND_API_KEY` | envio de e-mails | `email-hook`, `send-email`, webhook Cakto | para e-mails | secreta | Supabase |
| `SEND_EMAIL_HOOK_SECRET` | valida hook de e-mail do Auth | `email-hook` | sim para hook | secreta | Supabase |
| `APP_PUBLIC_URL` | links em e-mails | `email-hook` | recomendada | servidor | Supabase |
| `SHORTLINK_URL` | base preferencial do encurtador no backend | `public-api` | recomendada | servidor | Supabase |
| `BITLY_ACCESS_TOKEN` | fallback/integração legada Bitly | `enrich-product`, `public-api` | não | secreta | Supabase |
| `SUPABASE_MGMT_TOKEN` | consultas à Management API | `admin-api` | para diagnóstico admin | secreta | Supabase |
| `ENVIRONMENT` | habilita comportamento de desenvolvimento | `admin-api/_lib.ts` | não | servidor | Supabase |

## Onde configurar

- Local: `.env.local`, nunca commitido. O Vite lê as variáveis `VITE_*`.
- Vercel: Settings → Environment Variables, separadas por Preview e Production.
- Supabase: secrets das Edge Functions (`supabase secrets set NOME=...`) e secrets próprios da plataforma.

Se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_ANON_KEY` faltar, login e dados deixam de funcionar. Sem chaves Cakto, checkout/webhook falham; sem Evolution, WhatsApp falha; sem Resend, os fluxos principais podem concluir, mas o e-mail transacional não é entregue ou a função retorna erro, conforme o chamador.

## Divergência do template

`.env.example` cobre apenas sete variáveis do front. As variáveis de Edge Functions da tabela acima precisam ser adicionadas como nomes vazios e comentários, sem valores. A exposição de `VITE_EVOLUTION_API_KEY` deve ser removida por mudança de arquitetura; enquanto existir no bundle, ela não pode ser tratada como segredo real.

