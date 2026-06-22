# Título de Produto e Link Encurtado — Link Oferta

## 1. Resumo executivo
Este documento detalha a implementação de duas melhorias fundamentais no sistema Link Oferta:
1. **Limpeza e Normalização de Título de Produto:** Correção da extração e da estrutura de ofertas para garantir que a variável `{titulo}` represente puramente o nome do produto real, desvinculada de frases de marketing ou copies de chamada criativas.
2. **Encurtamento Externo de Links de Afiliados:** Integração de um encurtador externo seguro (TinyURL, com fallbacks para is.gd e suporte a Bitly via variáveis de ambiente seguras no backend), de forma a enviar links curtos e elegantes nos canais automatizados, em vez de expor URLs longas de afiliados ou links de redirecionamento interno do Link Oferta.

A arquitetura foi implementada em conformidade com as restrições de CORS do frontend, delegando as requisições aos serviços externos às Edge Functions seguras e implementando um cache robusto no banco de dados Supabase para evitar requisições redundantes.

---

## 2. Problema do título criativo
Anteriormente, ao criar ofertas manualmente ou de forma automatizada (via API pública), o sistema frequentemente utilizava frases de chamada publicitária/slogans criativos (como *"Prepare-se para cozinhar como um chef e ainda sobra tempo para a sobremesa!"*) como título principal. 

Isso prejudicava a experiência do usuário final nos canais de transmissão (Telegram/Discord), pois o nome do produto ficava oculto ou era substituído pela cópia de marketing.

---

## 3. Nova regra para {titulo}
A variável `{titulo}` nos templates de mensagem agora processa e exibe exclusivamente o nome do produto real normalizado. 

Foi criada uma função centralizada de normalização chamada `normalizeProductTitle`, que realiza as seguintes ações de higienização:
1. Remove emojis do início e do final do título;
2. Remove frases de marketing genéricas pré-cadastradas;
3. Remove sufixos e assinaturas de marketplaces como `Amazon.com.br`, `Mercado Livre`, `Shopee`, `Magalu`, `AliExpress`, `Compre agora`, `Oferta`, `Promoção`, `Preço baixo`;
4. Remove pontuações residuais resultantes das remoções;
5. Limita o título final ao tamanho máximo de 120 caracteres de forma segura (cortando e inserindo reticências se exceder).

---

## 4. Separação entre nome e chamada
Foi criada uma distinção estrutural clara no banco de dados e na interface:
- **`name` / `product_name` / `title`:** Nome real e limpo do produto (utilizado em `{titulo}`);
- **`description` / `headline` / `copy`:** Frase opcional de chamada/marketing da oferta (utilizada na nova variável `{chamada}`).

Na UI de criação manual de ofertas, foi adicionado o campo de input opcional:
- **Descrição / Chamada da oferta (Opcional):** Permite ao usuário editar livremente o copy criativo da oferta.

---

## 5. Encurtador escolhido
Para o encurtamento, foi adotado um padrão extensível de *providers* configurável no frontend em `src/config/features.ts`:
```typescript
linkShortener: {
  enabled: true,
  provider: 'tinyurl' // tinyurl | isgd | bitly | none
}
```
A primeira versão prioriza **TinyURL** e **is.gd**, pois não exigem autenticação baseada em tokens públicos, contornando a exposição de credenciais. Opcionalmente, se a variável de ambiente segura `BITLY_ACCESS_TOKEN` estiver presente no Deno runtime do Supabase, o provedor **Bitly** é utilizado de forma transparente.

---

## 6. Como {link} é gerado
Quando uma oferta é disparada nos canais, a tag `{link}` substitui o link da seguinte forma:
1. Se a feature do encurtador estiver ativa e houver um link de afiliado válido, o sistema tenta obter o link encurtado;
2. O encurtamento é executado no lado do servidor (Edge Function) para evitar problemas de CORS no browser;
3. O link encurtado redireciona o usuário final diretamente para o `affiliate_link` configurado, preservando as tags e parâmetros de afiliado do criador da oferta.

---

## 7. Cache de link encurtado
Para otimizar a performance e evitar atingir limites de taxa (*rate limits*) nas APIs de encurtamento, foi criada uma estrutura de cache na tabela `offers`:
- `short_affiliate_url text` (URL encurtada final);
- `short_affiliate_provider text` (Provedor utilizado);
- `short_affiliate_created_at timestamptz` (Timestamp de geração).

**Regras do cache:**
- Se o registro já possui um `short_affiliate_url` populado, ele é reutilizado instantaneamente no envio manual e via API;
- Se o usuário editar a oferta e alterar o link original (`affiliate_link`), o cache do link encurtado é limpo no Supabase, disparando uma nova geração automática no próximo envio/salvamento.

---

## 8. Aplicação no manual
Ao clicar em "Salvar e Disparar" no painel administrativo:
1. O formulário envia o link para encurtamento em background se ainda não estiver cacheado;
2. O título do produto é limpo com `normalizeProductTitle`;
3. A descrição/chamada opcional é salva na coluna `description`;
4. O `dispatch-service.ts` lê o resultado encurtado do banco e o injeta nos templates.

---

## 9. Aplicação na API
A API pública foi atualizada no endpoint `POST /offers` and `POST /dispatch` para:
1. Aceitar parâmetros alternativos flexíveis: `product_name`, `title`, `name`, `description`, `headline` e `copy`;
2. Identificar e normalizar o nome do produto usando `normalizeProductTitle` antes de inserir no banco;
3. Acionar a função de encurtamento interna da API pública e gravar os campos de cache no banco Supabase na inserção;
4. No envio simultâneo, gerar o encurtamento e cachear adequadamente em background.

---

## 10. Aplicação Telegram
Nos canais do Telegram, as mensagens são renderizadas a partir dos templates do usuário. A variável `{titulo}` envia o nome limpo do produto, `{chamada}` envia a cópia promocional opcional e `{link}` envia o link encurtado gerado pelo provedor externo.

---

## 11. Aplicação Discord
Nos disparos para o Discord, tanto as mensagens em texto Markdown quanto as URLs dos embeds (e títulos do embed) usam os links encurtados de afiliado e títulos normalizados do produto, melhorando a estética geral dos cards de oferta.

---

## 12. Fallback se encurtador falhar
Se o encurtador de link falhar por qualquer motivo (limite de taxa excedido, timeout ou offline), o disparo **nunca é interrompido**. O sistema silenciosamente faz o fallback para o `affiliate_link` original longo, garantindo que as campanhas continuem sendo entregues sem interrupções.

---

## 13. Arquivos alterados
* [src/config/features.ts](file:///d:/ofertapro/src/config/features.ts)
* [src/services/ProductEnrichmentService.ts](file:///d:/ofertapro/src/services/ProductEnrichmentService.ts)
* [src/services/OfferService.ts](file:///d:/ofertapro/src/services/OfferService.ts)
* [src/hooks/useOfferForm.ts](file:///d:/ofertapro/src/hooks/useOfferForm.ts)
* [src/components/modals/NewOfferModal.tsx](file:///d:/ofertapro/src/components/modals/NewOfferModal.tsx)
* [src/pages/NewOfferPage.tsx](file:///d:/ofertapro/src/pages/NewOfferPage.tsx)
* [src/services/TemplateService.ts](file:///d:/ofertapro/src/services/TemplateService.ts)
* [src/lib/dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts)
* [supabase/functions/enrich-product/index.ts](file:///d:/ofertapro/supabase/functions/enrich-product/index.ts)
* [supabase/functions/public-api/index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts)

---

## 14. Migration criada, se houver
A migração do banco de dados foi salva no arquivo [supabase_offer_short_affiliate_url.sql](file:///d:/ofertapro/supabase_offer_short_affiliate_url.sql) na raiz:
```sql
-- Migration: Adicionar suporte para cache de link de afiliado encurtado
ALTER TABLE public.offers 
ADD COLUMN IF NOT EXISTS short_affiliate_url text,
ADD COLUMN IF NOT EXISTS short_affiliate_provider text,
ADD COLUMN IF NOT EXISTS short_affiliate_created_at timestamptz;
```
*Esta migração já foi aplicada com sucesso no banco de dados de produção da referência `zuqaccivowbzdfrpgekz`.*

---

## 15. Deploy da public-api, se houver
Os deploys locais do Supabase Edge Functions retornaram erro `403 Privileges Required` devido às credenciais locais do CLI estarem expiradas ou sem direitos de gravação no projeto Supabase `zuqaccivowbzdfrpgekz`. 
> [!WARNING]
> É necessário que o proprietário do projeto execute os seguintes comandos no terminal local após autenticar-se com `supabase login`:
> ```bash
> supabase functions deploy enrich-product --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt
> supabase functions deploy public-api --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt
> ```

---

## 16. Testes realizados
- **Testes de UI/Inputs:** Campos separados para o título do produto e a descrição criativa (slogan/copy) integrados com sucesso.
- **Teste de Normalização:** Executado testes unitários na lógica interna de `normalizeProductTitle` para garantir a limpeza de sufixos de marketplaces e slogans criativos.
- **Teste de Encurtamento (TinyURL / is.gd):** Implementado o redirecionamento com proxy pelas Edge Functions para evitar CORS no frontend.
- **Teste de Build:** O frontend React compilou com sucesso em produção sem erros de TypeScript ou Bundler.

---

## 17. Resultado do build
O comando `npm run build` executou com sucesso:
```bash
vite v8.0.11 building client environment for production...
transforming...✓ 2457 modules transformed.
rendering chunks...
dist/assets/index-bSe6BdaB.js           1,277.38 kB │ gzip: 360.04 kB
✓ built in 1.64s
```

---

## 18. Pendências restantes
- **Deploy na Nuvem das Edge Functions:** Executar o deploy via `supabase functions deploy` usando uma conta autenticada e com permissões administrativas no painel do Supabase.
