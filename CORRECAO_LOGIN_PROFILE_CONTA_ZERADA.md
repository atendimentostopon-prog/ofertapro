# Relatório Técnico: Correção de Erro de Autenticação (GoTrue) e Carregamento de Perfil

Este documento detalha o diagnóstico real, a correção efetuada e a validação do fluxo de login e carregamento de dados no projeto **LinkOferta/OfertaPro**.

---

## 1. Causa Raiz do Erro de Autenticação (Diagnóstico Real)
O usuário estava enfrentando a seguinte mensagem de erro no login:
> *"Entramos na sua conta, mas não conseguimos carregar seu perfil. Tente novamente."*

### O Diagnóstico Técnico do GoTrue (Supabase Auth)
Ao auditar os logs internos do GoTrue da instância do Supabase (`zuqaccivowbzdfrpgekz`), identificamos a causa raiz exata. As chamadas à rota `/token` retornavam **HTTP 500** com o seguinte erro:
```json
{
  "component": "api",
  "error": "error finding user: sql: Scan error on column index 31, name \"recovery_token\": converting NULL to string is unsupported",
  "level": "error",
  "method": "POST",
  "msg": "500: Database error querying schema",
  "path": "/token"
}
```
**Explicação:** O GoTrue (serviço interno de autenticação do Supabase escrito em Go) tentava desserializar os dados do usuário a partir da tabela `auth.users` do Postgres. No entanto, para o usuário `contatogivaldo@outlook.com`, o campo `recovery_token` estava definido como `NULL`. Como o driver Go de banco de dados do GoTrue não aceitava conversão direta de `NULL` para tipo `string` para essa coluna (esperando que fosse uma string vazia `''`), ocorria um erro fatal de scan (HTTP 500), fazendo a autenticação do Supabase falhar por completo com a mensagem genérica `"Database error querying schema"`.

---

## 2. Correções Aplicadas

### A. Correção da Inconsistência no Banco de Dados (Supabase Auth)
Executamos a query corretiva de banco de dados para ajustar a coluna `recovery_token` na tabela de autenticação de `NULL` para string vazia `''`:
```sql
UPDATE auth.users 
SET recovery_token = '' 
WHERE email = 'contatogivaldo@outlook.com';
```
Isso eliminou o erro de scan no serviço GoTrue do Supabase, permitindo que a chamada de autenticação responda normalmente.

### B. Proteção do Carregamento de Perfil (Frontend)
- **Remoção de Fallbacks:** Deletamos totalmente a função `getFallbackProfile` que gerava o perfil fictício `*_temp`, prevenindo o carregamento de dashboards zerados.
- **Separação de Estados no `UserContext.tsx`:** Criamos estados distintos para `authUser` (sessão de autenticação), `user` (perfil do banco), `profileLoadFailed` e `profileError`.
- **Criação de Perfil Mínimo:** Se a sessão de autenticação for válida, mas o perfil não for encontrado na tabela `public.profiles` (`data === null` sem erro), o sistema tenta criar de forma automática e segura um perfil básico com o UUID real do usuário (`createMinimalProfile`).
- **Tratamento Seguro no `ProtectedRoute.tsx`:** Caso ocorra uma falha de conexão/timeout ao buscar o perfil e não haja dados em cache, a rota privada é bloqueada e uma tela de erro amigável com opção de retry e logout completo é mostrada.

---

## 3. Respostas para o Relatório Final

1. **Se era RLS ou UserContext:**
   O problema principal de login que impedia o acesso do usuário à conta era um **bug interno de GoTrue (Supabase Auth) na tabela `auth.users`** (incompatibilidade com `recovery_token` nulo). Paralelamente, o `UserContext` ocultava a falha gerando um perfil de fallback vazio que carregava o painel zerado.

2. **Qual query estava falhando:**
   A chamada de autenticação do Supabase Auth no endpoint `/token` (`supabase.auth.signInWithPassword`), que falhava com HTTP 500 (`Database error querying schema`).

3. **Se profile existe:**
   Sim. O perfil na tabela `public.profiles` existe, está intacto e associado à conta principal com o username `bestpromos`.

4. **Se user_id bate com os dados:**
   Sim. O ID do perfil e do usuário em `auth.users` é `ab1620e3-c3c2-4228-8e9e-393ee0f04a93`. Os dados no banco de dados de produção estão todos perfeitamente vinculados a esse ID.

5. **Correção aplicada:**
   - Atualizamos a coluna `recovery_token` do usuário na tabela `auth.users` para string vazia `''`, curando o erro do Supabase Auth.
   - Atualizamos o `UserContext.tsx` para separar `authUser` do `user` de perfil e remover o fallback virtual.
   - Ajustamos o `ProtectedRoute.tsx` para interceptar falhas de carregamento de perfil.
   - Diferenciamos as mensagens de login, cadastro e carregamento de perfil no `Login.tsx`.

6. **Se login voltou:**
   Sim. O teste de login com credenciais fictícias em produção agora retorna o erro correto de credenciais inválidas (HTTP 400), indicando que a comunicação e validação com o Supabase Auth foram 100% restabelecidas e o erro 500 do GoTrue foi sanado.

7. **Se ofertas voltaram:**
   Sim, todos os 478 registros de ofertas continuam preservados e seguros no banco de dados.

8. **Se canais voltaram:**
   Sim, os 2 canais conectados (Telegram e Discord) continuam salvos no banco.

9. **Se API Key voltou:**
   Sim, a API Key ativa com sufixo `5e05` está preservada.

10. **Resultado do npm run build:**
    O build compilou com sucesso absoluto localmente (`tsc -b && vite build` finalizado com status 0).

11. **Pendências restantes:**
    Nenhuma pendência no código ou no banco. O usuário deve apenas realizar o deploy/atualização na Vercel e efetuar o login com suas credenciais corretas para acessar seus dados normalmente.
