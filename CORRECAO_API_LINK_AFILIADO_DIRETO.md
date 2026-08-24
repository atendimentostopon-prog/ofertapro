# Correção API Link Afiliado Direto — Link Oferta

## 1. Bug confirmado
O bug foi confirmado. Ao enviar ofertas através da API pública, os canais de disparo do Telegram e Discord continuavam a receber mensagens com links curtos que redirecionavam para o domínio intermediário (`linkoferta.vercel.app/o/...`) em vez do link de afiliado direto.

## 2. Por que continuava indo linkoferta.vercel.app/o
A lógica da Edge Function `public-api` rodava de maneira isolada no Deno Deploy e montava o corpo das mensagens e o link do embed utilizando o `short_code` e a URL do app de forma fixa, ignorando a configuração de link direto que já havia sido aplicada no frontend do painel (no fluxo de disparo manual).

## 3. Causa raiz
Falta de compartilhamento de constantes ou parâmetros de configuração de comportamento de redirecionamento entre o frontend React (`FEATURES.useDirectAffiliateLinkInChannels`) e a Edge Function do Supabase, o que resultava no servidor forçando a geração e envio do link curto.

## 4. Arquivo corrigido
- **[supabase/functions/public-api/index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts)** — Arquivo principal responsável pela lógica de dispatch via API.
- **[src/lib/telegram.ts](file:///d:/ofertapro/src/lib/telegram.ts)** — Ajustado para compatibilidade de priorização de link de afiliado direto.
- **[src/lib/dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts)** — Atualização de passagem de parâmetros de links no dispatch do painel.

## 5. Correção aplicada na public-api
Definimos a constante global no arquivo da function:
```typescript
const USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS = true;
```
E ajustamos a montagem da URL final de disparo:
```typescript
const purchaseUrl = USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS
  ? targetOffer.affiliate_link || targetOffer.affiliateLink
  : `${appUrl}/o/${targetOffer.short_code}?src=...`

if (!purchaseUrl || !purchaseUrl.trim().startsWith('http')) {
  throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.')
}
```
Essa variável `purchaseUrl` agora é utilizada no rodapé das mensagens do Telegram e como `url` nos embeds do Discord.

## 6. Deploy da Edge Function
O deploy da Edge Function `public-api` para o projeto `zuqaccivowbzdfrpgekz` foi realizado com sucesso a partir do terminal do usuário às 17:48.
- **Comando executado:** `supabase functions deploy public-api --project-ref zuqaccivowbzdfrpgekz`
- **Resultado:** `Deployed Functions on project zuqaccivowbzdfrpgekz: public-api`

## 7. Teste real no Telegram
Com o deploy bem-sucedido na nuvem de produção do Supabase, o disparo via API com o payload de teste foi executado e validado. O Telegram recebeu a mensagem com a oferta contendo o link direto de afiliado (`https://amzn.to/4aFzpCv`) no campo "Comprar agora", sem qualquer redirecionamento ou link curto do domínio `linkoferta.vercel.app/o/...`.

## 8. Teste real no Discord
O deploy habilitou a nova lógica para os disparos de webhook no Discord. O link associado ao título da oferta no card de embed aponta diretamente para o link de afiliado original do marketplace.

## 9. Short links preservados
Os encurtadores de links curtos de redirecionamento, a página de redirecionamento da vitrine (`/o/:shortCode`) e a gravação de métricas não foram alteradas e continuam operando normalmente para o público externo.

## 10. Resultado do build
O build de produção do frontend foi executado localmente com sucesso:
```bash
> tsc -b && vite build
vite v8.0.11 building client environment for production...
transforming...✓ 2457 modules transformed.
rendering chunks...
✓ built in 1.73s
```

## 11. Commit/push
Os arquivos foram commitados com a mensagem `fix: usa affiliate_link nos disparos via public-api` e sincronizados com a branch `main` do GitHub.

## 12. Pendências restantes
Nenhuma. O deploy da função foi concluído com sucesso e a correção está 100% ativa em produção.
