# Validação API e Edge Functions — Link Oferta

Este relatório detalha o deploy das Supabase Edge Functions e a validação de ponta a ponta dos recursos de integração de API realizados no ambiente de produção real do **Link Oferta**.

---

## 1. Resumo Executivo
Todas as Edge Functions da API Pública e Gerenciamento de credenciais foram deployadas com sucesso no Deno Deploy do Supabase. Realizamos testes sintéticos de ponta a ponta no banco remoto de produção (`zuqaccivowbzdfrpgekz`), verificando a criação de chaves, validação, mascaramento, revogação e os endpoints de dados (`/channels`, `/offers` e `/dispatch`), garantindo robustez de RLS e criptografia SHA-256.

---

## 2. Status da Migration
* **Tabela `public.api_keys`**: Confirmada no banco remoto com RLS ativo (`rowsecurity: true`).
* **Políticas RLS Aplicadas**:
  - `Usuários podem ver suas próprias api_keys` (SELECT)
  - `Usuários podem criar suas próprias api_keys` (INSERT)
  - `Usuários podem atualizar suas próprias api_keys` (UPDATE)

---

## 3. Status das Edge Functions
As três funções foram publicadas no Deno Deploy do projeto de produção e estão em estado **ACTIVE**:
1. **`api-key-generate`**: Responsável por autenticar o usuário logado via JWT do Supabase, revogar credenciais anteriores e gerar chaves criptográficas novas em formato legível, armazenando apenas o SHA-256 hash.
2. **`api-key-revoke`**: Responsável por desativar uma credencial ativa, marcando seu status como `revoked` e registrando a data de revogação.
3. **`public-api`**: O gateway de comunicação externo de automações.
   > [!IMPORTANT]
   > A função `public-api` foi deployada com a configuração `verify_jwt: false` para permitir autenticação via API Key customizada no header `Authorization: Bearer lof_live_...`. As outras duas funções foram deployadas com `verify_jwt: true` para segurança extra.

---

## 4. Secrets Necessários
As Edge Functions no Supabase Platform herdam automaticamente no runtime as variáveis nativas de comunicação administrativa:
* `SUPABASE_URL` (Injetado automaticamente)
* `SUPABASE_SERVICE_ROLE_KEY` (Injetado automaticamente)

Fallback configurado no código da Edge Function `public-api`:
* `VITE_PUBLIC_APP_URL`: Utiliza `https://linkoferta.vercel.app` caso a variável de ambiente não esteja configurada nos segredos do projeto.

---

## 5. Teste da Aba API e Integrações
1. **Interface**: A aba carrega perfeitamente na interface de configurações.
2. **One-time Show**: A chave completa em texto claro (`lof_live_...`) é transmitida apenas no payload de geração inicial e exibida apenas uma vez no modal de aviso.
3. **Mascaramento e Memória**: Após fechar o modal, a chave limpa é removida do estado React e apenas o prefixo legível e os quatro últimos dígitos da chave (`lof_live_••••••••••••cdef`) são renderizados na tabela de chaves, eliminando riscos de leitura de tela ou cache.

---

## 6. Teste GET `/channels`
* **Requisição**: `GET /functions/v1/public-api/channels`
* **Status Retornado**: `200 OK`
* **Resultado**: Retornou com sucesso a lista de canais conectados do usuário de teste.
* **Segurança**: Os campos confidenciais como `bot_token` (do Telegram) e `identifier` (webhook do Discord) foram devidamente omitidos, exibindo apenas dados não sensíveis de identificação.

---

## 7. Teste POST `/offers`
* **Requisição**: `POST /functions/v1/public-api/offers`
* **Status Retornado**: `201 Created`
* **Resultado**: Cadastrou a oferta vinculada ao `user_id` proprietário da chave de API e retornou o link curto gerado:
  ```json
  {
    "data": {
      "id": "f3228080-0495-484a-a2a1-4fe759f7fedc",
      "name": "Teclado Mecânico Gamer Corsair K70 RGB",
      "short_code": "smouie",
      "sale_price": 599.9,
      "original_price": 899.9,
      "discount": 33,
      "coupon": "CORSAIR10",
      "affiliate_link": "https://amzn.to/3Vj4XYZ",
      "marketplace": "amazon",
      "category": "Eletrônicos",
      "status": "draft",
      "tracking_link": "https://linkoferta.vercel.app/o/smouie"
    }
  }
  ```

---

## 8. Teste POST `/dispatch`
* **Requisição**: `POST /functions/v1/public-api/dispatch`
* **Status Retornado**: `200 OK`
* **Resultado**: Executou a entrega multicanal de teste. O envio enviou a mensagem com o link de rastreamento para o bot de Telegram e o webhook do Discord vinculados ao usuário de teste Bruna Duarte, e salvou a ocorrência de sucesso com a lista de canais afetados na tabela `history`.

---

## 9. Teste de Chave Inválida
* **Requisição**: Chamada com header `Authorization: Bearer lof_live_chave_invalida`
* **Status Retornado**: `401 Unauthorized`
* **Corpo da Resposta**: `{"error":"API key inválida, expirada ou revogada."}`
* **Segurança**: Bloqueio efetuado de imediato e sem expor exceções ou stack-traces internos.

---

## 10. Teste de Chave Revogada
1. Efetuada a desativação da chave no painel (atualizando status para `revoked` no banco de dados).
2. Chamadas subsequentes usando a mesma chave foram barradas retornando `401 Unauthorized` (`{"error":"API key inválida, expirada ou revogada."}`).
3. A nova chave gerada logo após funcionou normalmente em todas as rotas.

---

## 11. Segurança Verificada
* **Sem Credenciais no Banco**: Nenhuma API Key pura é persistida no banco; apenas o SHA-256 hash.
* **Isolamento Total**: Todos os filtros utilizam o `user_id` associado ao proprietário da API Key obtido do banco, impossibilitando acessos transversais de dados (IDOR).
* **Sem Segredos Commitados**: Código auditado sem credenciais de Deno/Vite, tokens ou webhooks fixados em código fonte.

---

## 12. Resultado do Build
Frontend buildado com sucesso para produção em **1.46s** com zero erros de compilação.

---

## 13. Pendências Restantes
* **Rate Limiting**: Adicionar middleware de controle de frequência de chamadas por minuto para evitar ataques de DDoS em produção.
* **WhatsApp**: Habilitar a rota de envio para WhatsApp quando a Evolution API for ativada e estiver em conformidade de segurança.
