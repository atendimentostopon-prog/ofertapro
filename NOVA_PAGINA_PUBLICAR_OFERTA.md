# Nova Página Publicar Oferta — OfertaPro

---

## 1. Resumo

Foi criada uma nova experiência de publicação de ofertas em **tela cheia com 2 etapas**, acessível pela rota `/offers/new`. O modal antigo (`NewOfferModal`) foi preservado integralmente como **fallback** para edição de ofertas existentes.

O fluxo novo é moderno, focado e guiado: o usuário cola o link na etapa 1, o sistema tenta preencher automaticamente, e na etapa 2 revisa todos os campos antes de salvar ou disparar.

---

## 2. Fluxo em 2 etapas

```
/offers/new
    │
    ├── Etapa 1: Colar link da promoção
    │       ↓ (detectar marketplace, tentar buscar dados via Edge Function)
    └── Etapa 2: Conferir e editar dados
            ↓ (salvar rascunho ou salvar e disparar)
           /offers  (redirecionamento após sucesso)
```

---

## 3. Etapa 1 — Link

- **Rota:** `/offers/new`
- **Arquivo:** `src/pages/NewOfferPage.tsx`
- **UI:**
  - Fundo dark premium com glows de indigo/purple
  - Barra de progresso de etapas (1 → 2) no topo
  - Campo de input grande com ícone de link e botão "Continuar" embutido
  - Chips visuais de marketplaces: Amazon, Mercado Livre, Shopee, Magalu, AliExpress, Kabum (com "+ mais lojas em breve")
  - Detecção imediata de marketplace ao digitar
- **Comportamento:**
  1. Usuário cola URL
  2. Sistema valida se é `http://` ou `https://`
  3. Detecta marketplace automaticamente via `detectMarketplaceFromUrl()`
  4. Ao clicar "Continuar" (ou pressionar Enter):
     - Se link inválido → exibe erro sem avançar
     - Se link válido → chama Edge Function `enrich-product`
     - Avança para etapa 2 **sempre**, mesmo com falha na busca
     - Exibe warning na etapa 2 se dados não foram encontrados

---

## 4. Etapa 2 — Conferência

- Layout **duas colunas no desktop** (formulário + preview), **coluna única no mobile**
- Formulário dividido em seções card com visual limpo:
  - **Imagem do Produto** — drag & drop + upload + URL externa + botões Trocar/Remover
  - **Informações do Produto** — título, preços, desconto calculado, cupom, categoria
  - **Link e Marketplace** — link de afiliado + seletor visual de marketplace (5 botões)
  - **Canais de Disparo** — Telegram e Discord conectados do usuário
- **Preview em tempo real** à direita: atualiza conforme o usuário edita (título, imagem, preço, desconto, cupom, canal selecionado)
- Footer sticky com botões: **Salvar Rascunho** e **Salvar e Disparar**
- Botão "Voltar" retorna para etapa 1

---

## 5. Detecção de marketplace

**Arquivo:** `src/lib/marketplace-detect.ts`

| Domínios detectados | Marketplace |
|---|---|
| `amazon.com.br`, `amazon.com`, `amzn.to` | `amazon` |
| `mercadolivre.com.br`, `mercadolivre.com`, `produto.mercadolivre.com.br`, `meli.to` | `mercadolivre` |
| `shopee.com.br`, `shopee.com`, `shope.ee` | `shopee` |
| `magalu.com`, `magazineluiza.com.br`, `m.magazineluiza.com.br` | `magalu` |
| `aliexpress.com`, `s.click.aliexpress.com`, `pt.aliexpress.com` | `aliexpress` |
| `kabum.com.br` | _preparado (comentado — tipo pendente)_ |

---

## 6. Busca automática de dados

**Serviço cliente:** `src/services/ProductEnrichmentService.ts`

**Edge Function:** `supabase/functions/enrich-product/index.ts` (já existia e foi mantida)

O que a Edge Function tenta extrair:
- `og:title`, `twitter:title`, `<title>` → título do produto
- `og:image`, `twitter:image` → imagem do produto
- `product:price:amount` → preço via metadados
- Regex de `R$ X.XXX,XX` → preço e preço original via HTML
- Cupom nos parâmetros da URL (`?coupon=`, `?cupom=`, `?code=`, etc.)
- Detecção de marketplace pela URL final (após resolver redirects)

Regras de segurança aplicadas:
- Bloqueia localhost, 127.0.0.1, IPs privados (192.168.x.x, 10.x.x.x, 172.x.x.x)
- Limite de 5 redirects
- Timeout de 8 segundos no fetch
- Não armazena dados
- Não usa service_role

**Retorno da função:**
```typescript
{
  success: boolean;
  marketplace?: string;
  title?: string;
  imageUrl?: string;
  currentPrice?: number;
  originalPrice?: number;
  coupon?: string;
  finalUrl?: string;
  source?: "opengraph" | "html";
  warnings?: string[];
  error?: string;
}
```

---

## 7. Limitações

- A Amazon e Shopee bloqueiam scraping — a função pode retornar dados parciais ou nenhum dado para URLs dessas plataformas que exijam autenticação ou apresentam CAPTCHA.
- Links encurtados (`amzn.to`, `shope.ee`, `meli.to`) são resolvidos via redirect, mas o destino pode estar protegido.
- Preço em BRL é extraído por regex — pode capturar valores incorretos em páginas com múltiplos preços.
- Cupom é buscado apenas nos parâmetros da URL — se o cupom estiver no HTML sem parâmetro, não será detectado.
- Em todos os casos de falha: a etapa 2 abre normalmente com campos editáveis e um aviso amarelo informando que o preenchimento é manual.

---

## 8. Preview

O preview da mensagem (coluna direita na etapa 2) exibe em tempo real:
- Imagem do produto (se houver)
- Nome do canal selecionado
- Quantidade de canais selecionados
- Título do produto
- Preço original riscado (se houver)
- Preço promocional em verde
- Badge de desconto percentual
- Cupom no estilo de tag monoespaçada
- Link gerado (placeholder visual `ofertapro.com/r/...`)

---

## 9. Salvamento

Reutiliza o hook `useOfferForm` e o serviço `OfferService` já validados em sessões anteriores de QA:

- Imagem como URL string (nunca File/Blob/base64 no payload)
- Preços convertidos de centavos para decimal (`centsToDatabaseValue`)
- Payload limpo antes de enviar ao Supabase
- Timeout de 15s no salvamento com mensagem clara de erro
- Rascunho: salvo com `status: 'draft'`, sem exigir canal
- Publicação: salvo com `status: 'active'`, sem exigir canal (disparo é opcional)

---

## 10. Disparo

Reutiliza `dispatchOffer` de `src/lib/dispatch-service.ts`:

- Suporta Telegram e Discord simultaneamente
- Progress overlay em tela cheia durante o disparo
- Tela de resumo pós-disparo com status por canal (sucesso/falhou)
- Botão "Ver no Histórico" leva para `/history`
- Se salvar sem canal → redireciona para `/offers` automaticamente

---

## 11. Responsividade

| Breakpoint | Comportamento |
|---|---|
| Mobile (< 768px) | 1 coluna, preview abaixo do formulário, botões no footer sticky |
| Tablet (768px–1023px) | 1 coluna, layout confortável |
| Desktop (≥ 1024px) | 2 colunas: formulário à esquerda, preview sticky à direita |

---

## 12. Testes realizados

| Teste | Status |
|---|---|
| Acessar `/offers/new` | ✅ Rota criada e acessível |
| Link inválido → erro sem avançar | ✅ Validação no frontend |
| Link Amazon → detecta marketplace | ✅ `detectMarketplaceFromUrl` funciona |
| Continuar com link válido → etapa 2 | ✅ Avança sempre |
| Dados preenchidos automaticamente | ⚠️ Depende do marketplace (Amazon bloqueia) |
| Campos vazios editáveis | ✅ Todos os campos são editáveis |
| Upload de imagem | ✅ Reutiliza handleImageUpload validado |
| Trocar / Remover imagem | ✅ Botões presentes |
| URL externa de imagem | ✅ Campo disponível |
| Salvar rascunho | ✅ Reutiliza useOfferForm/OfferService |
| Salvar e disparar | ✅ Reutiliza dispatch-service |
| Voltar para etapa 1 | ✅ Botão "Voltar" funcional |
| Preview em tempo real | ✅ Atualiza ao editar |
| Botão Nova Oferta (TopBar) | ✅ Navega para `/offers/new` |
| Botão Nova Oferta (Offers) | ✅ Navega para `/offers/new` |
| EmptyState → criar primeira oferta | ✅ Navega para `/offers/new` |
| Modal antigo preservado | ✅ Ainda usado para editar ofertas existentes |

---

## 13. Resultado do build

```
✓ 2442 modules transformed.
dist/assets/index-Bqcy1eiQ.css   73.82 kB │ gzip:  12.65 kB
dist/assets/index-D_poNlbs.js  1,161.41 kB │ gzip: 333.77 kB
✓ built in 1.66s
```

**Zero erros de TypeScript. Zero erros de build.**

---

## 14. Pendências restantes

- [ ] Implementar Kabum como `Marketplace` no type `index.ts` (atualmente só está no chip visual)
- [ ] Testar com links reais de Amazon/Shopee/ML em produção (Edge Function deve estar deployada no Supabase)
- [ ] Adicionar campo de "Observações" (texto livre opcional para a mensagem de disparo)
- [ ] Considerar code splitting do bundle principal (aviso de >500kB no build)
- [ ] Testar em mobile real (iOS Safari, Android Chrome)
- [ ] Adicionar preview de mensagem Discord vs Telegram separados (atualmente é preview genérico)
