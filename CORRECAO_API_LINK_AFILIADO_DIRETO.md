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
A tentativa de deploy automático via CLI pelo sandbox encontrou uma limitação de autenticação (Erro 403):
```
unexpected list functions status 403: {"message":"Your account does not have the necessary privileges..."}
```
* **Status do Deploy:** Pendente de execução pelo usuário localmente. O token atual salvo na CLI do ambiente sandbox tem acesso a outro projeto do proprietário (`Agendali`/`emkcaalgfutbukindxvy`), mas não ao projeto `zuqaccivowbzdfrpgekz` de Link Oferta.
* **Instrução de Deploy:** O usuário deve executar o deploy a partir de sua máquina autenticada rodando:
  ```bash
  npx supabase functions deploy public-api --project-ref zuqaccivowbzdfrpgekz
  ```

## 7. Teste real no Telegram
Pendente da conclusão do deploy pelo usuário na nuvem de produção. Uma vez deployado, o disparo via API com o payload:
```json
{
  "offer": {
    "name": "Teste Link Direto API",
    "affiliate_link": "https://amzn.to/4aFzpCv",
    "marketplace": "amazon",
    "category": "Beleza",
    "sale_price": 47.35,
    "original_price": 299.00,
    "coupon": "COMPRANOAPP"
  },
  "channel_ids": ["ID_DO_CANAL_TELEGRAM"]
}
```
enviará a mensagem com `https://amzn.to/4aFzpCv` diretamente ao canal, sem referenciar `linkoferta.vercel.app/o/...`.

## 8. Teste real no Discord
Pendente de deploy. Com o deploy realizado, o embed de oferta conterá o campo de URL apontando diretamente para o link de afiliado real.

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
- O usuário administrativo precisa rodar o deploy da Edge Function `public-api` na nuvem para ativar as correções em produção.
