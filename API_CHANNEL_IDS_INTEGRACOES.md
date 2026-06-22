# IDs de Canais na Aba API e Integrações — Link Oferta

## 1. Resumo executivo
Este documento detalha as melhorias implementadas na aba **Configurações → API e Integrações** do SaaS **Link Oferta**. O objetivo principal foi permitir que o usuário consulte com facilidade os identificadores únicos (UUIDs) de seus canais de disparo conectados para utilizá-los em integrações externas de automação (via API). Também implementamos reforços de segurança severos no backend para evitar que qualquer usuário manipule ou dispare ofertas para canais que não pertencem à sua própria conta.

---

## 2. Por que o ID do canal é necessário
O endpoint de disparo da API pública (`/public-api/dispatch`) requer o parâmetro `channel_ids` para determinar para quais grupos ou servidores de chat a oferta (existente ou criada dinamicamente) deve ser propagada. Anteriormente, os usuários não tinham um meio visual e simples de consultar os UUIDs gerados na tabela `public.channels`, limitando a utilidade da integração via API.

---

## 3. Onde a seção foi adicionada
A nova interface foi inserida diretamente na aba **API e Integrações** (componente [ApiIntegrationsTab.tsx](file:///d:/ofertapro/src/components/settings/ApiIntegrationsTab.tsx)), posicionada logo abaixo do card de visualização de chaves de API e credenciais ativas, e antes da documentação de endpoints.

---

## 4. Dados exibidos para cada canal
A seção **Canais conectados para integração** lista os canais ativos no formato de grade responsiva, exibindo:
- **Logo/Ícone do Canal:** Identificação visual para Telegram, Discord ou WhatsApp (com fallbacks e tratamento de erros de imagem).
- **Nome do Canal:** Nome atribuído pelo usuário.
- **Tipo de Canal:** Categoria do canal de disparo.
- **Status:** Indica visualmente se está **Conectado** (status ativo).
- **ID do canal:** O UUID do registro na tabela `public.channels`.
- **Botão de Copiar:** Um botão de clique rápido acoplado ao UUID que copia o identificador para a área de transferência do usuário e exibe a mensagem de toast: **“ID do canal copiado!”**.
- **Estado Vazio (Empty State):** Exibe a mensagem *"Nenhum canal conectado ainda."* acompanhada de um botão direto para conectar um canal no painel caso não haja nenhum ativo.
- **Botão Atualizar Canais:** Localizado no cabeçalho do card, permitindo forçar uma atualização da lista de integração com indicador visual de carregamento (*loading*).

---

## 5. Segurança e RLS
- **Camada de Banco de Dados:** A tabela `public.channels` possui políticas de RLS (*Row Level Security*) ativas, onde o acesso é limitado pela cláusula `auth.uid() = user_id`. Isso garante que requisições realizadas pelo frontend utilizando o cliente Supabase autenticado jamais exponham registros de terceiros.
- **Prevenção de Vazamento de Credenciais:** As chaves de acesso sensíveis do banco de dados (como o `bot_token` do Telegram ou o webhook bruto do Discord) **não são selecionadas** e **nunca são expostas** no frontend nesta aba, garantindo total privacidade do usuário.

---

## 6. Proteção contra channel_id de outro usuário
No backend, no endpoint de disparo público da Edge Function ([supabase/functions/public-api/index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts)):
1. Removemos duplicidades do array `channel_ids` recebido.
2. Realizamos uma query específica na tabela `channels` filtrando pelos IDs únicos solicitados **e** pelo `user_id` correspondente ao dono da API Key autenticada.
3. Comparamos se a quantidade de canais retornados do banco é menor do que a quantidade de canais únicos solicitados. Caso seja menor, significa que o usuário informou um ID inexistente ou pertencente a outra conta.
4. Nesses casos de violação, o endpoint rejeita a requisição imediatamente e retorna o erro HTTP **403 Forbidden** com a mensagem amigável:
   **“Um ou mais canais informados não pertencem à sua conta.”**

---

## 7. Exemplos de uso na API
A seção **Documentação Rápida da API** foi atualizada para instruir o desenvolvedor sobre como declarar os IDs dos canais na chamada de envio:

### Opção A: Disparar oferta cadastrada existente
```bash
curl -X POST "https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/public-api/dispatch" \
  -H "Authorization: Bearer SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "UUID_DA_OFERTA",
    "channel_ids": [
      "ID_DO_CANAL_COPIADO_AQUI"
    ]
  }'
```

### Opção B: Cadastrar e disparar nova oferta
```bash
curl -X POST "https://zuqaccivowbzdfrpgekz.supabase.co/functions/v1/public-api/dispatch" \
  -H "Authorization: Bearer SUA_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "offer": {
      "name": "Produto Teste",
      "affiliate_link": "https://amzn.to/exemplo",
      "marketplace": "amazon",
      "category": "Informática",
      "sale_price": 99.90,
      "original_price": 149.90,
      "coupon": "BOANOITE"
    },
    "channel_ids": [
      "ID_DO_CANAL_COPIADO_AQUI"
    ]
  }'
```

---

## 8. Arquivos alterados
- [src/services/ChannelService.ts](file:///d:/ofertapro/src/services/ChannelService.ts) — Adicionada a função `getIntegrationChannels(userId: string)` que carrega os canais ativos filtrados por usuário.
- [src/components/settings/ApiIntegrationsTab.tsx](file:///d:/ofertapro/src/components/settings/ApiIntegrationsTab.tsx) — Implementação da interface visual, estados de carregamento, botão de atualizar, botão copiar com feedback visual e toast, além da atualização da documentação de endpoints.
- [supabase/functions/public-api/index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts) — Atualização da Edge Function para validar se todos os `channel_ids` do payload pertencem ao usuário dono da API Key, bloqueando tentativas de invasão ou disparo cruzado com erro 403.

---

## 9. Testes realizados
- **Validação de Exibição:** Entramos no painel de configurações na aba de API e confirmamos que a seção de canais conectados é carregada corretamente.
- **Validação de Layout:** Os cards ajustam-se dinamicamente ao tamanho da tela (colunas no desktop, lista única no mobile) com o UUID protegido por scroll horizontal ou quebra elegante para evitar estouro da tela.
- **Cópia de ID:** O botão de cópia foi testado, confirmando a correta transferência do UUID para a área de transferência do sistema operacional e o acionamento do toast de sucesso: *“ID do canal copiado!”*.
- **Segurança da Edge Function:** Verificamos que o fluxo de disparo rejeita payloads contendo IDs de canais de terceiros, retornando a resposta HTTP 403 e a mensagem de segurança apropriada.

---

## 10. Resultado do build
O build de produção foi validado sem nenhuma ocorrência de erro:
```bash
> tsc -b && vite build
vite v8.0.11 building client environment for production...
transforming...✓ 2457 modules transformed.
rendering chunks...
✓ built in 1.73s
```

---

## 11. Pendências restantes
- Nenhuma pendência identificada. Todas as metas de desenvolvimento de frontend, backend, UX, RLS e testes de build foram 100% cumpridas.
