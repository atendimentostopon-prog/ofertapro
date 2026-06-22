# Correção API Link de Afiliado Direto — Link Oferta

## 1. Resumo executivo
Este documento detalha a investigação, causa raiz e as correções realizadas para resolver o bug no envio de ofertas via API pública, onde o link encurtado da plataforma (`linkoferta.vercel.app/o/...`) estava sendo indevidamente enviado para os canais do Telegram e Discord em vez do link de afiliado direto (`affiliate_link`), contrariando o comportamento configurado pelo sinalizador `useDirectAffiliateLinkInChannels`.

---

## 2. Bug reproduzido
Ao disparar ofertas utilizando o endpoint da API pública `/public-api/dispatch`, os canais de disparo (principalmente Telegram e Discord) recebiam mensagens contendo links curtos com o seguinte padrão:
`https://linkoferta.vercel.app/o/6wi7yh?src=telegram`
O preview gerado no Telegram apontava para a página pública do Link Oferta, o que impedia o redirecionamento direto dos usuários finais ao link do anunciante/afiliado.

---

## 3. Por que o manual funcionava e a API não
- **Envio Manual (Frontend):** O fluxo do frontend utiliza o arquivo [dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts) e valida a propriedade `FEATURES.useDirectAffiliateLinkInChannels`. Quando ativa, o parâmetro `affiliateLink` é enviado como link final.
- **Envio Automático (API / Edge Function):** A Edge Function do Supabase (`public-api`) é executada no Deno (fora do ambiente React) e continha seu próprio bloco de lógica de dispatch isolada, no qual a URL de destino estava rigidamente programada (*hardcoded*) para utilizar o padrão `/o/{short_code}` sem validar a preferência de link direto.

---

## 4. Causa raiz
A causa raiz foi a ausência de parametrização lógica da constante `USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS` e do desvio de link dentro da Edge Function do Supabase, além da necessidade de robustecer a função `sendTelegramOffer` no frontend para sempre priorizar a URL direta do afiliado se o respectivo sinalizador estiver ativo.

---

## 5. Arquivos alterados
- **[supabase/functions/public-api/index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts)** — Adição da constante global `USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS = true` e alteração das mensagens enviadas para Telegram e Discord Webhooks para utilizarem a URL de afiliado direta da oferta em vez do link curto.
- **[src/lib/telegram.ts](file:///d:/ofertapro/src/lib/telegram.ts)** — Inclusão do parâmetro `affiliateLink` na assinatura da função `sendTelegramOffer` e tratamento dinâmico com base na flag `FEATURES.useDirectAffiliateLinkInChannels`.
- **[src/lib/dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts)** — Ajuste para passar `affiliateLink` corretamente para a chamada do Telegram no fluxo manual/painel.

---

## 6. Correção na Edge Function public-api
Definimos a constante configurável:
```typescript
const USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS = true;
```
Nos blocos de envio do Telegram e do Discord, passamos a resolver o link final:
```typescript
const purchaseUrl = USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS
  ? targetOffer.affiliate_link || targetOffer.affiliateLink
  : `${appUrl}/o/${targetOffer.short_code}?src=...`

if (!purchaseUrl || !purchaseUrl.trim().startsWith('http')) {
  throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.')
}
```

---

## 7. Correção no Telegram
Na função `sendTelegramOffer` (em `src/lib/telegram.ts`), resolvemos a URL final com prioridade no link de afiliado caso a flag global esteja ativa:
```typescript
const finalUrl = FEATURES.useDirectAffiliateLinkInChannels
  ? offer.affiliateLink || offer.trackingLink
  : offer.trackingLink;
```
Substituímos no corpo da mensagem do Telegram a variável anterior por `${finalUrl}`.

---

## 8. Correção no Discord
Atualizamos a URL principal do embed do Discord para apontar diretamente para a constante `purchaseUrl` calculada (que assume o link direto do afiliado), eliminando o redirecionamento curto.

---

## 9. Short links preservados
O sistema de encurtamento de links, geração de cliques, redirecionamento pelo código curto (`/o/:shortCode`) e visualização na página pública do catálogo continuam 100% ativos e sem nenhuma modificação lógica. A alteração afeta estritamente o link de destino postado nas salas do Discord e canais do Telegram.

---

## 10. Testes realizados
- **Auditoria Estática:** Inspeção nos arquivos modificados para assegurar o funcionamento dos fallbacks das propriedades (compatibilidade com `affiliate_link` do banco e `affiliateLink` do frontend).
- **Validação de Payload:** Garantia de que a Edge Function recupera a coluna `affiliate_link` nas duas opções de disparo (oferta existente por `offer_id` e criação simultânea via objeto `offer`).
- **Validação de Compilação:** O build do frontend foi executado localmente com sucesso.

---

## 11. Deploy da Edge Function
A tentativa de deploy foi realizada via CLI:
`npx supabase functions deploy public-api --project-ref zuqaccivowbzdfrpgekz`
*Observação de Produção:* O deploy local falhou com erro HTTP 403 (Acesso Negado) devido à ausência de credenciais administrativas de deploy do Supabase Cloud no ambiente de desenvolvimento atual.
**Ação Necessária:** O proprietário do projeto (que possui acesso administrativo ao painel do Supabase) deve rodar o comando de deploy acima em seu terminal local autenticado para propagar a Edge Function atualizada para a nuvem.

---

## 12. Resultado do build
O build de produção do frontend TypeScript + Vite foi bem-sucedido:
```bash
> tsc -b && vite build
vite v8.0.11 building client environment for production...
transforming...✓ 2457 modules transformed.
rendering chunks...
✓ built in 1.73s
```

---

## 13. Commit/push
Os arquivos foram staged, commitados e sincronizados com a branch principal do GitHub:
- **Mensagem:** `fix: usa link de afiliado direto nos disparos via api`
- **Status:** Sucesso, branch de trabalho limpa.

---

## 14. Pendências restantes
- O usuário administrativo precisa rodar o deploy da Edge Function `public-api` na nuvem para ativar a correção de link direto na produção da API.
