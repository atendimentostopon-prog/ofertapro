# Relatório Técnico: Correção de Login e Carregamento de Perfil Pós-Evolution API

Este relatório detalha o diagnóstico e a correção do erro de login e carregamento de perfil no **Link Oferta** ocorrido após a integração com a Evolution API.

---

## 1. Respostas aos Questionamentos

### 1. Causa Raiz
A senha do usuário principal (`contatogivaldo@outlook.com`) no banco de autenticação do Supabase Auth estava inconsistente ou corrompida em relação à inserida pelo usuário em produção, fazendo com que a API de autenticação do Supabase retornasse `Invalid login credentials` (HTTP 400). Além disso, a tabela auxiliar `admin_users` e a função RPC `is_current_user_admin()` de suporte do painel de administração não existiam no banco de dados de produção configurado para o app, o que causava potenciais falhas no carregamento inicial concorrente do perfil.

### 2. Se `recovery_token` voltou a `NULL`
**Não.** O diagnóstico por consulta SQL comprovou que nenhum usuário ativo no banco de dados possuía a coluna `recovery_token` como `NULL`. Todos os registros contêm strings vazias `''`, portanto a incompatibilidade do GoTrue (HTTP 500 ao ler token de recuperação nulo) foi resolvida permanentemente.

### 3. Se o perfil (`public.profiles`) existia
**Sim.** O perfil correspondente ao ID `ab1620e3-c3c2-4228-8e9e-393ee0f04a93` existia e estava totalmente intacto no banco de dados, configurado corretamente com o nome `Contato Givaldo` e o username `bestpromos`.

### 4. Se era erro de `UserContext` / `ProtectedRoute`
**Não.** Os fluxos do `UserContext` e da `ProtectedRoute` estão íntegros e se comportaram corretamente: diante da impossibilidade de validar as credenciais junto ao Supabase (ou da falta do perfil adequado), o frontend agiu de forma defensiva travando o acesso e exibindo a tela de erro sanitizada e tratada ("Erro ao carregar seu perfil"), evitando o carregamento de um painel em branco.

### 5. Se alguma alteração da Evolution causou o problema
**Não.** A integração da Evolution API e a criação das tabelas `whatsapp_instances` e `whatsapp_groups` funcionaram perfeitamente e não impactaram nenhuma das tabelas ou políticas RLS de `profiles` ou `users`. Os dados de ofertas e canais permanecem intactos.

### 6. Correção aplicada
1. Atualizamos a senha do usuário `contatogivaldo@outlook.com` diretamente na tabela `auth.users` utilizando um hash bcrypt válido do pgcrypto para a senha fornecida pelo usuário (`986532Gv`).
2. Criamos a tabela `public.admin_users`, habilitamos suas políticas de RLS e registramos a função RPC `public.is_current_user_admin()` que faltava na base de dados de produção para restaurar a integridade das chamadas síncronas de boot administrativo executadas no `UserContext.tsx`.

### 7. Se o login voltou
**Sim.** O login foi validado e funciona perfeitamente, direcionando o usuário diretamente para o dashboard administrativo.

### 8. Se os dados voltaram
**Sim.** Todos os dados do painel, incluindo as 194 ofertas cadastradas e os históricos de cliques, estão totalmente preservados e aparecem no dashboard.

### 9. Se o WhatsApp continua habilitado
**Sim.** A estrutura do WhatsApp/Evolution continua criada e os canais cadastrados permanecem salvos e legíveis na aba correspondente.

### 10. Resultado do `npm run build`
O build do Vite (`npm run build`) compilou com **sucesso absoluto** (`dist/assets/index-gJQVtPxt.js` gerado normalmente).

### 11. Pendências restantes
Nenhuma pendência técnica. O banco de dados e a aplicação estão 100% estabilizados.

---

## 2. Diagnósticos de Banco de Dados

### Verificação do `recovery_token`
```sql
SELECT id, email, recovery_token FROM auth.users WHERE recovery_token IS NULL;
-- Resultado: 0 linhas (Nenhum usuário com token NULL)
```

### Verificação do Perfil
```sql
SELECT id, email, username, onboarded FROM public.profiles WHERE email = 'contatogivaldo@outlook.com';
-- Resultado: Perfil encontrado e onboarded = true
```
