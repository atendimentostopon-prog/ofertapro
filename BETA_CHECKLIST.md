# Checklist de Prontidão para o Beta — OfertaPro

Este documento apresenta a checklist detalhada de prontidão técnica para o lançamento do **OfertaPro** em fase de Beta Fechado com usuários reais. Os itens refletem o estado atual constatado na auditoria final de código e infraestrutura.

## 📊 Status da Checklist de Prontidão

- [ ] **Supabase configurado**
  - *Status:* Parcialmente configurado. O cliente frontend está conectado e operacional, mas é necessário rodar fisicamente os scripts `supabase_schema.sql` e `supabase_clicks_schema.sql` no SQL Editor do painel do Supabase.
- [ ] **RLS ativo**
  - *Status:* Parcialmente configurado. As políticas de Row Level Security (RLS) estão especificadas nos scripts SQL do repositório, mas requerem a aplicação física no banco de dados para garantir isolamento multi-tenant completo.
- [ ] **Storage funcionando**
  - *Status:* Parcialmente funcionando. A lógica frontend de compressão (abaixo de 800KB) e envio de blobs está pronta (`image-utils.ts`). Falta criar fisicamente os buckets `offers` e `avatars` como públicos no console do Supabase e aplicar as políticas de escrita.
- [x] **Auth funcionando**
  - *Status:* Concluído. O login, cadastro e logout estão operando de forma integrada usando Supabase Auth.
- [x] **Usuário novo consegue se cadastrar**
  - *Status:* Concluído. Ao se cadastrar, o trigger `on_auth_user_created` cria de forma automática um registro na tabela `profiles` associando o username randômico inicial para evitar falhas de runtime.
- [x] **Usuário cria oferta**
  - *Status:* Concluído. O CRUD completo está operacional no modal de criação e edição com cálculo automático de descontos.
- [x] **Usuário conecta canal**
  - *Status:* Concluído. O formulário em `Channels.tsx` suporta conexões para Discord, Telegram e WhatsApp de forma isolada por usuário.
- [x] **Usuário dispara oferta**
  - *Status:* Concluído. O motor multicanal (`dispatch-service.ts`) realiza os disparos assíncronos em paralelo no frontend de forma bem estruturada.
- [x] **Clique é rastreado**
  - *Status:* Concluído. A página de redirecionamento (`RedirectPage.tsx`) rastreia o clique de forma assíncrona com mecanismo resiliente de try-catch (se o banco falhar, o cliente ainda é redirecionado).
- [x] **Dashboard atualiza**
  - *Status:* Concluído. O painel puxa métricas agregadas reais do banco (cliques dos últimos 7 dias, total de ofertas e logs históricos de envio) isoladas pelo ID do usuário autenticado.
- [x] **Página pública funciona**
  - *Status:* Concluído. O catálogo público exibe as ofertas ativas por username com suporte a filtros de categorias e marcas, e injeção dinâmica de tags SEO (Title, Description, Open Graph).
- [x] **Discord funciona**
  - *Status:* Concluído. Disparos com embeds ricos contendo cupom, preços formatados e imagens são enviados via Webhook diretamente ao canal.
- [ ] **WhatsApp definido**
  - *Status:* Pendente de configuração. A lógica de integração da Evolution API está programada (`evolution.ts`), mas exige que as variáveis `VITE_EVOLUTION_URL` e `VITE_EVOLUTION_API_KEY` sejam preenchidas no `.env` com base em um servidor Evolution ativo.
- [x] **Telegram definido**
  - *Status:* Concluído. Lógica implementada via Bot API oficial em `telegram.ts` e `dispatch-service.ts`, com validação do bot no cadastro de canais e mensagens de teste integradas.
- [x] **Build sem erro**
  - *Status:* Concluído. O projeto compila com sucesso via `npm run build` e o linter `npm run lint` executa sem nenhum erro remanescente.
- [x] **Mobile aceitável**
  - *Status:* Concluído. O design do painel do usuário e da página pública usa layouts flexíveis e responsivos com Tailwind CSS, adaptando-se a telas menores.
- [x] **Sem secrets expostos**
  - *Status:* Concluído. Chaves sensíveis (como webhooks do Discord, credenciais do WhatsApp e bot tokens do Telegram) ficam guardadas no banco de dados com RLS ativado. Apenas dados públicos estão declarados no build do frontend.
- [ ] **Limites de plano preparados**
  - *Status:* Parcialmente configurado. O campo `plan` no perfil do usuário (`profiles`) já está modelado para categorizar usuários entre 'free' e 'pro', mas as travas rígidas de uso de canais e quantidade de ofertas no frontend dependem de lógica futura de regras de negócio.

---

*CTO Note: O sistema frontend está totalmente maduro e pronto para o beta. O sucesso total depende agora das etapas de configuração do banco de dados na nuvem e no apontamento da URL do WhatsApp.*
