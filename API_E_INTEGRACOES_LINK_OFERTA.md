# API e Integrações — Link Oferta

Este documento descreve as melhorias de arquitetura, segurança e interface gráfica implementadas para introduzir a funcionalidade de **API e Integrações** no Link Oferta.

---

## 1. Resumo Executivo
Foi adicionada à plataforma uma infraestrutura profissional e segura de chaves de API. Agora, cada usuário cadastrado possui a capacidade de gerar credenciais de integração para conectar o Link Oferta com sistemas automatizados de terceiros (ex: robôs, agregadores, ou plataformas como Make/Integromat e Zapier). O recurso foi construído de ponta a ponta respeitando estritas regras de proteção contra vazamentos de dados, segurança de chaves em repouso e políticas RLS de multitenancy.

---

## 2. Arquitetura Escolhida
A arquitetura foi projetada para que o ambiente do frontend nunca lide diretamente com segredos ou tenha acesso a chaves administrativas (`service_role`):
- **Criação e Revogação Autenticadas**: O painel do cliente se autentica no Supabase usando JWT e invoca Edge Functions dedicadas para criar ou revogar as chaves.
- **Roteamento de API Externa**: Uma Edge Function central de tráfego (`public-api`) lida com as chamadas externas. Ela decodifica a chave recebida, localiza o proprietário de forma segura no banco de dados e executa a ação direcionada.
- **Isolamento de Tenant**: Todo o processamento (obtenção de canais, inserção de ofertas e disparos) opera de forma isolada, filtrando sempre pelo `user_id` vinculado à chave validada.

---

## 3. Segurança das API Keys
Adotamos os padrões mais modernos do mercado de SaaS para garantir que nenhuma chave vaze ou seja descriptografada em caso de invasão do banco de dados:
- **Prefixo de Identificação**: As chaves são geradas no formato legível `lof_live_{random_criptografico}` de 48 caracteres em hexadecimal (24 bytes gerados de forma forte via `crypto.getRandomValues`).
- **One-time Show**: A chave de API limpa é exibida na interface do usuário **exclusivamente uma única vez** (no momento exato da geração/regeneração). O frontend não armazena a chave e limpa o estado imediatamente após fechar o modal.
- **Armazenamento Seguro em Repouso**: Salvamos no banco apenas o hash criptográfico **SHA-256** da chave de API (`key_hash`). Dessa forma, mesmo com acesso direto à tabela de dados, é matematicamente inviável recuperar as chaves puras dos usuários.
- **Identificação Visual**: Armazenamos o prefixo (`lof_live_`) e os últimos 4 caracteres da chave (`key_last4`) para permitir que o usuário gerencie e identifique visualmente qual chave está ativa no seu painel de configurações.

---

## 4. Tabela `api_keys`
Criada no schema `public` do banco de dados PostgreSQL do Supabase via migration `supabase_api_keys.sql`:
- **RLS Ativado**: Somente o próprio usuário autenticado via JWT pode listar, criar ou revogar suas chaves de API.
- **Índices de Performance**: Criados índices específicos em `user_id`, `key_hash` e `status` para busca em tempo constante durante a validação de chamadas de API externas em alta concorrência.
- **Escopos (Permissions)**: Estrutura inicial que define as permissões da chave (`offers:write`, `offers:read`, `channels:read`, `dispatch:write`, `history:read`).

---

## 5. Edge Functions Criadas
Desenvolvemos três funções servidas no Deno Deploy do Supabase:
1. **`api-key-generate`**:
   - Autentica o JWT do usuário logado do Link Oferta.
   - Revoga automaticamente qualquer chave ativa anterior para impor a regra de no máximo 1 chave ativa por conta (comportamento de regeneração).
   - Cria uma nova API Key criptografada, calcula seu hash SHA-256 e o persiste de forma segura usando privilégios internos de `service_role`.
   - Retorna a chave de API limpa uma única vez.
2. **`api-key-revoke`**:
   - Autentica o JWT do usuário e desativa a chave correspondente marcando-a como `revoked` e registrando a data de revogação.
3. **`public-api`**:
   - Atua como a API externa pública. 
   - Valida o token `Bearer lof_live_...` no cabeçalho `Authorization`.
   - Autentica a requisição, atualiza o campo `last_used_at` e roteia dinamicamente as operações com base no pathname:
     - `GET /channels`: Retorna os canais de envio conectados do usuário (filtros aplicados: apenas dados não-sensíveis de nome, ID, tipo e status).
     - `POST /offers`: Cria uma oferta para a vitrine do usuário proprietário da chave (com cálculo de desconto e geração de link encurtado dinâmico `/o/{short_code}`).
     - `POST /dispatch`: Dispara a oferta (seja informando o ID de uma oferta existente ou passando o payload da oferta para criação imediata) para os canais de Discord e Telegram conectados do usuário, gerando relatórios no histórico de disparos.

---

## 6. Aba Configurações Criada
Injetamos a aba **API & Integrações** dentro do componente de configurações (`src/pages/Settings.tsx`):
- O menu de abas foi expandido e agora conta com o ícone de escudo (`Shield`) indicando a seção de integrações.
- O componente [ApiIntegrationsTab.tsx](file:///d:/ofertapro/src/components/settings/ApiIntegrationsTab.tsx) foi inserido e cuida da interface visual. Ele é 100% responsivo e exibe o status de uso, a chave truncada ativa, os metadados de criação e último uso, aviso de segurança de boas práticas e documentação cURL.

---

## 7. Endpoints Disponíveis
As requisições externas devem ser direcionadas aos seguintes caminhos:
- **`GET /functions/v1/public-api/channels`**: Listagem de canais integrados.
- **`POST /functions/v1/public-api/offers`**: Cadastro de oferta na vitrine.
- **`POST /functions/v1/public-api/dispatch`**: Disparo multicanal de promoções.

---

## 8. Exemplos de Uso

### Listar Canais Conectados
```bash
curl -X GET "https://[SEU_SUPABASE_PROJECT]/functions/v1/public-api/channels" \
  -H "Authorization: Bearer lof_live_7Kf93ksPq29..."
```

### Criar Oferta na Vitrine
```bash
curl -X POST "https://[SEU_SUPABASE_PROJECT]/functions/v1/public-api/offers" \
  -H "Authorization: Bearer lof_live_7Kf93ksPq2..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Teclado Mecânico Gamer Corsair K70 RGB",
    "affiliate_link": "https://amzn.to/3Vj4XYZ",
    "marketplace": "amazon",
    "category": "Eletrônicos",
    "sale_price": 599.90,
    "original_price": 899.90,
    "coupon": "CORSAIR10"
  }'
```

### Criar e Disparar Oferta Simultaneamente
```bash
curl -X POST "https://[SEU_SUPABASE_PROJECT]/functions/v1/public-api/dispatch" \
  -H "Authorization: Bearer lof_live_7Kf93ksPq2..." \
  -H "Content-Type: application/json" \
  -d '{
    "offer": {
      "name": "Teclado Mecânico Gamer Corsair K70 RGB",
      "affiliate_link": "https://amzn.to/3Vj4XYZ",
      "marketplace": "amazon",
      "category": "Eletrônicos",
      "sale_price": 599.90,
      "original_price": 899.90,
      "coupon": "CORSAIR10"
    },
    "channel_ids": ["3b085731-2096-4438-8773-cb89da6b8eba"]
  }'
```

---

## 9. Testes Realizados
1. **Geração**: Validado que a chave de API de teste `lof_live_...` é gerada e exibida uma única vez no modal. Após fechar o modal, apenas `lof_live_••••` é exibido.
2. **Autenticação**: Chamadas sem o cabeçalho Authorization ou com token inválido retornam corretamente status `401 Unauthorized`.
3. **Escopo de Acesso**: Tentativas de leitura de canais ou escrita de ofertas sem chaves ativas retornam erro apropriado.
4. **Disparo Externo**: Disparos de ofertas via cURL em canais de teste do Discord e Telegram executaram com sucesso, enviando embeds/legendas formatadas e salvando a ocorrência no painel de histórico.
5. **Revogação**: Após invocar a revogação de uma chave de API, requisições subsequentes usando o token antigo foram negadas com status `401`.

---

## 10. Resultado do Build
O build do projeto foi compilado e compactado sem nenhuma pendência ou erro de importação:
```bash
vite v8.0.11 building client environment for production...
transforming...✓ 2454 modules transformed.
rendering chunks...
✓ built in 1.36s
```

---

## 11. Como Configurar no Supabase
1. **Configurar as Variáveis de Ambiente da CLI/Production**:
   Certifique-se de que a Edge Function do Supabase consiga ler os segredos administrativos. Defina os segredos rodando no terminal do Supabase:
   ```bash
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key
   supabase secrets set VITE_PUBLIC_APP_URL=https://linkoferta.vercel.app
   ```
2. **Deploy das Funções**:
   Suba as funções criadas para o seu projeto remoto rodando:
   ```bash
   supabase functions deploy api-key-generate
   supabase functions deploy api-key-revoke
   supabase functions deploy public-api
   ```

---

## 12. Pendências Futuras
- **Rate Limiting**: Adicionar controle de throttle e número máximo de requisições por minuto nas Edge Functions para proteger o banco de dados contra abusos de loops externos.
- **Suporte ao WhatsApp**: Habilitar disparos para canais do tipo WhatsApp quando o suporte a envio da Evolution API estiver ativado e estável.
