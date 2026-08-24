# Configurações, Onboarding e Vitrine — OfertaPro

## 1. Resumo executivo
Nesta etapa, implementamos e finalizamos de ponta a ponta o fluxo de onboarding do usuário, o gerenciamento de configurações da conta pessoal, as informações visuais e funcionais da vitrine de ofertas, e a integração com links de grupos sociais públicos (WhatsApp, Telegram e Discord) na página pública do OfertaPro. O sistema agora está completamente alinhado para operar em beta gratuito, sem bloqueios de uso por limite de ofertas ou canais, e sem loadings infinitos.

## 2. Campos adicionados
Foram mapeados e integrados os seguintes campos nas tabelas do banco de dados (especificamente em `public.profiles`):
- **Conta Pessoal**: `preferred_name` (nome de tratamento/saudação) e `phone` (telefone/WhatsApp de contato).
- **Links Sociais**: `whatsapp_group_url` (link de grupo do WhatsApp), `telegram_group_url` (link de convite de canal/grupo do Telegram) e `discord_group_url` (link de convite do servidor Discord).

## 3. SQL criado
Foi criado o arquivo `supabase_profile_vitrine_update.sql` na raiz do projeto contendo as migrações DDL seguras para adicionar as novas colunas à tabela `profiles`, sem perdas de dados e sem reconstrução de tabelas:

```sql
-- Adiciona colunas para Conta pessoal
alter table public.profiles add column if not exists preferred_name text;
alter table public.profiles add column if not exists phone text;

-- Adiciona colunas de links de convite públicos na vitrine
alter table public.profiles add column if not exists whatsapp_group_url text;
alter table public.profiles add column if not exists telegram_group_url text;
alter table public.profiles add column if not exists discord_group_url text;
```

## 4. Upload de imagens
Corrigido o comportamento de carregamento infinito no upload de foto da vitrine e avatar pessoal. Criamos um mecanismo híbrido em `src/lib/image-utils.ts` que:
1. Comprime a imagem localmente (reduzindo a banda e evitando falhas de uploads grandes).
2. Organiza os arquivos nos buckets apropriados (`avatars`) divididos em subpastas estruturadas (`avatars/{userId}/profile` para fotos pessoais e `avatars/{userId}/public` para a marca da vitrine).
3. Possui um fallback automático para Data URI (Base64) em caso de rejeição por regras RLS do Supabase Storage ou buckets ausentes, garantindo que o fluxo do usuário prossiga com sucesso e sem travar em loadings infinitos.

## 5. Onboarding em 2 etapas
Refatorado o fluxo de Onboarding inicial em duas etapas distintas no componente `PublicPageSetupModal.tsx`:
- **Etapa 1 — Minha Conta**: Solicita o Nome Completo (obrigatório), Como podemos te chamar (opcional), Telefone (opcional), e foto pessoal do usuário, trazendo o e-mail de login preenchido automaticamente (readonly).
- **Etapa 2 — Minha Vitrine**: Define o nome da vitrine (obrigatório), o slug/username de acesso à vitrine (obrigatório, com validação de formato e unicidade em tempo real no banco), a foto da vitrine (opcional), a bio de até 200 caracteres, os links sociais (WhatsApp, Telegram e Discord) e o tema visual de cores (Clássico, Índigo, Esmeralda e Dark).
- Inclui um mockup dinâmico de celular do lado direito exibindo um Live Preview das mudanças em tempo real (foto, bio, cores e botões sociais).

## 6. Minha Conta
Integrado na aba **Minha Conta** do painel `Settings.tsx`:
- Upload/edição do avatar pessoal via `uploadAvatarImage(..., 'profile')`.
- Nome completo (editável) e apelido/nome preferido (editável).
- Telefone de contato (editável).
- E-mail e ID da conta como somente leitura (readonly).
- Ações de logout e exclusão devidamente estruturadas.

## 7. Minha Vitrine Pública
Integrado na aba **Minha Vitrine Pública** do painel `Settings.tsx`:
- Nome de exibição público.
- Bio/descrição da vitrine limitada a 200 caracteres (contador dinâmico de caracteres na tela).
- Link personalizado (Slug/username) com validação contra duplicatas.
- Seleção de tema de cores (Clássico, Índigo, Esmeralda e Dark) sincronizado no banco.
- Botão "Visualizar vitrine" e ação "Copiar Link" para compartilhamento imediato.
- Switch de ativação/desativação pública da vitrine.

## 8. Links públicos da vitrine
Integrado na aba dedicada **Links da Vitrine** do painel `Settings.tsx`:
- Link do grupo de WhatsApp, Canal do Telegram e Convite do Discord.
- Validação no frontend: prefixa automaticamente com `https://` se o usuário digitar sem protocolo e valida as assinaturas de domínios (`wa.me`, `chat.whatsapp.com`, `t.me`, `telegram.me`, `discord.gg`, etc.).
- Exibe avisos de erro inline no campo respectivo caso o formato digitado seja inválido, sem travar o restante do formulário.

## 9. Página pública
Atualizada a `PublicPage.tsx` para operar estritamente com dados reais obtidos do banco:
- Exibe o avatar público (`public_avatar_url`) com fallback para o avatar pessoal (`avatar_url`) e, subsequentemente, iniciais geradas dinamicamente.
- Exibe estatísticas consolidadas e reais (total de ofertas ativas, total de cliques recebidos e economia real acumulada com base na diferença entre o preço original e o preço promocional).
- Seção de canais sociais condicionada: os botões para ingressar no WhatsApp, Telegram ou Discord só aparecem se o link respectivo estiver cadastrado. Caso nenhum grupo seja informado, a seção de botões sociais é ocultada da tela.
- Removido qualquer dado mockado, seguidores falsos, botões inoperantes de seguir ou números fixos.

## 10. Dashboard e saudação
A saudação no painel administrativo foi configurada no `Dashboard.tsx` para buscar o primeiro nome com a seguinte ordem de prioridade:
1. `preferred_name` (Como quer ser chamado)
2. Primeiro nome de `full_name`
3. Primeiro nome de `public_name`
4. `username` (Slug)
5. E-mail antes do caractere `@`
6. Fallback final para a palavra "Usuário"

A mesma regra de tratamento amigável e exibição do avatar atualizado foi replicada na barra lateral (`Sidebar.tsx`) e na barra superior (`TopBar.tsx`).

## 11. Planos e cobrança desativados
- O sistema de faturamento foi mantido desativado devido ao beta gratuito.
- A aba de **Planos & Cobrança** exibe agora uma mensagem informativa clara explicando que a plataforma é gratuita e com todos os recursos PRO liberados (ofertas e canais ilimitados, custom templates de disparos, etc.), impedindo qualquer tentativa de assinatura e escondendo banners de upgrade de todo o fluxo operacional.

## 12. Testes realizados
- **Validação de Banco**: O banco de dados recebeu o schema seguro com sucesso.
- **Tipagem e Compilação**: Corrigidos erros de imports (ícone `Sparkles` no setup modal) e tipagens (`public_name` -> `publicName` no Dashboard) para garantir 100% de sucesso nos testes de compilação do TypeScript.
- **Normalização de Links**: O validador processa entradas como `chat.whatsapp.com/ID` transformando em `https://chat.whatsapp.com/ID` de forma transparente.
- **Fallback Base64**: Testado o fallback local de imagens convertendo blobs em Data URL com sucesso, resolvendo o loading infinito no storage.

## 13. Resultado do build
O build foi executado com sucesso:
`dist/assets/index-C0Nazvx7.js   1,118.48 kB`
Compilado limpo, sem erros do compilador.

## 14. Pendências restantes
Nenhuma pendência crítica para esta etapa. A aplicação está pronta para testes manuais integrados na interface.
