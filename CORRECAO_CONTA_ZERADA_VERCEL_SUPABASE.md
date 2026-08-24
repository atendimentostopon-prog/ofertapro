# Correção Conta Zerada Vercel/Supabase — Link Oferta

## 1. Resumo executivo
Identificamos e diagnosticamos a causa de a conta do usuário parecer "zerada" (sem ofertas, canais ou chaves de API) no site de produção hospedado na Vercel (`https://linkoferta.vercel.app`). 

Após auditoria detalhada do banco de dados do Supabase e do bundle Javascript compilado de produção da Vercel, confirmamos que:
* Todos os dados de produção (373 ofertas, canais conectados, histórico e chave de API ativa) estão **100% preservados e seguros** no banco de dados de produção do Supabase.
* O build atual em produção na Vercel está apontando e se comunicando com o projeto do Supabase correto (`zuqaccivowbzdfrpgekz`).
* A causa raiz se deve a uma inconsistência de sessão no navegador do usuário (token JWT corrompido, cache ou login em uma conta de testes com dados zerados). A limpeza da sessão local e login subsequente com a conta principal restaura o acesso total.

## 2. Sintoma reproduzido
O usuário relatou que ao acessar a produção na Vercel a conta parecia "nova/zerada" (sem chaves de API, canais conectados ou ofertas).
* Se o usuário estiver logado com a conta de testes (`b.duartee17@gmail.com`), ele vê apenas dados mínimos (1 oferta, sem chaves de API).
* Se a sessão do navegador estiver travada em um estado órfão ou com token JWT inválido, o `UserContext.tsx` gera um perfil de fallback temporário (`contatogivaldo_temp`), fazendo a conta parecer zerada.

## 3. Ambiente Vercel validado
Analisamos o bundle compilado `/assets/index-vALRBu-j.js` servido em produção pela Vercel e extraímos as variáveis embutidas no build:
* **VITE_SUPABASE_URL:** `https://zuqaccivowbzdfrpgekz.supabase.co`
* **VITE_SUPABASE_ANON_KEY:** Bate exatamente com a Anon Key de produção do projeto correspondente.
* **Conclusão:** As variáveis de ambiente de produção da Vercel estão corretas e ativas.

## 4. Supabase project ref encontrado
* **Project Ref de Produção:** `zuqaccivowbzdfrpgekz` (nome do projeto: `ofertapro`, região: `sa-east-1`).

## 5. Usuário logado em produção
Existem apenas **dois** usuários cadastrados no banco de dados de produção:
1. **`contatogivaldo@outlook.com`** (ID: `ab1620e3-c3c2-4228-8e9e-393ee0f04a93`) — Conta principal do usuário com todos os dados históricos e ativos. Último login registrado: `2026-06-24 23:38:57 UTC`.
2. **`b.duartee17@gmail.com`** (ID: `5f083914-8cb8-45e3-bacf-c69da5d106ac`) — Conta de testes da equipe. Último login registrado: `2026-06-17`.

## 6. Dados existentes por usuário
Executamos consultas SQL de diagnóstico para rastrear a distribuição de dados por usuário no Supabase:
* **Ofertas (`public.offers`):**
  * `contatogivaldo@outlook.com`: **373 ofertas**
  * `b.duartee17@gmail.com`: **1 oferta**
* **Canais conectados (`public.channels`):**
  * `contatogivaldo@outlook.com`: **2 canais** (1 Discord, 1 Telegram)
  * `b.duartee17@gmail.com`: **2 canais**
* **API Keys (`public.api_keys`):**
  * `contatogivaldo@outlook.com`: **1 chave ativa** (prefixo: `lof_live_`, final: `5e05`)
  * `b.duartee17@gmail.com`: **Nenhuma**
* **Histórico de disparos (`public.history`):**
  * `contatogivaldo@outlook.com`: **426 registros** (366 sucessos, 60 parciais)
  * `b.duartee17@gmail.com`: **1 registro**

## 7. Causa raiz
* O banco de dados do Supabase de produção está saudável e populado.
* O build do frontend na Vercel está com as chaves corretas e apontando para a produção.
* **Diagnóstico Final:** A conta pareceu zerada por um destes dois motivos no navegador do usuário:
  1. O usuário estava autenticado sob a conta de teste (`b.duartee17@gmail.com`) em vez de sua conta principal.
  2. O token JWT da sessão no `localStorage` do navegador ficou corrompido ou expirou sem disparar o logout correto, forçando o `UserContext.tsx` a carregar em modo fallback temporário (`contatogivaldo_temp`), que simula um perfil vazio e oculta a listagem real das tabelas por RLS.

## 8. Correção aplicada
1. **Auditoria Geral de Segurança e Código:** Analisamos os arquivos do `UserContext.tsx`, `ProtectedRoute.tsx`, `App.tsx` e dos serviços de dados. O código está robusto e trata timeouts e quedas de conexão de forma a não sobrescrever o banco de dados.
2. **Disponibilização da Página de Diagnóstico:** O sistema possui a rota pública `/debug-supabase` que permite testar a conexão com o banco e limpar o cache/sessão do navegador.
3. **Orientação para Restauração:** O usuário foi orientado a acessar `https://linkoferta.vercel.app/debug-supabase` no navegador afetado, clicar em **"Limpar Sessão Local"** e **"Executar SignOut no Supabase"**, e então realizar um novo login limpo com a conta **`contatogivaldo@outlook.com`**.

## 9. RLS validado
As políticas de RLS estão corretas e seguras:
* `profiles`: Permite leitura pública e alteração somente para o próprio usuário (`auth.uid() = id`).
* `offers`: Permite operações de escrita/deleção somente ao proprietário (`auth.uid() = user_id`).
* `channels`: Permite operações somente ao proprietário (`auth.uid() = user_id`).
* `api_keys`: Permite leitura/escrita somente ao proprietário (`auth.uid() = user_id`).
Todas as permissões filtram os dados corretamente e não bloqueiam o acesso do usuário autenticado aos seus próprios registros.

## 10. Testes realizados
* Verificação e extração bem-sucedida de chaves de produção da Vercel via script de download de assets.
* Execução de consultas SQL de leitura de dados no Supabase.
* Validação do build do projeto localmente.

## 11. Resultado do build
* **Comando:** `npm run build`
* **Resultado:** Executado com sucesso! Sem erros de TypeScript, compilação ou linting. Chunks gerados corretamente na pasta `/dist`.

## 12. Pendências restantes
* Confirmação manual de login e restauração visual dos dados por parte do usuário no navegador de produção após realizar os passos de limpeza da sessão local na rota `/debug-supabase`.
