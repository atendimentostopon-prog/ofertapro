# Correção Mensagens Duplicadas nos Canais — Link Oferta

## 1. Resumo Executivo

Correção completa da duplicação de conteúdo nas mensagens enviadas para Discord e Telegram, tanto via painel manual quanto via API pública. Inclui normalização do título do produto, remoção de campos vazios, unificação da lógica de renderização e deploy das Edge Functions.

---

## 2. Bug Reproduzido

### Discord
A mensagem chegava com 3 camadas de conteúdo sobrepostas:

1. **`content`** (fora do embed): `⚡ NOVA OFERTA DISPONÍVEL! 🔥 X% OFF`
2. **`embed.description`**: template renderizado com preço, marketplace, link
3. **`embed.fields`**: campos automáticos duplicando Preço, De, Marketplace, Cupom

**Resultado**: mensagem enorme, poluída, com dados repetidos 2-3 vezes.

### Telegram
- Título vindo sujo com sufixo do marketplace: `"Produto : Amazon.com.br: Cozinha"`
- Campos vazios aparecendo (cupom vazio, preço original vazio)
- Formatação inconsistente entre envio manual e API

---

## 3. Causa Raiz da Duplicação

### Discord (`sender.ts` e `public-api/index.ts`)
O sistema enviava **simultaneamente**:
- `content`: texto "NOVA OFERTA DISPONÍVEL" fora do embed
- `embed.description`: template renderizado com todas as informações
- `embed.fields[]`: campos automáticos com Preço, De, Marketplace, Cupom

Isso gerava **3 blocos** com os mesmos dados no Discord.

### Telegram
A função `sendTelegramOffer` (legada) tinha formato hardcoded que podia conflitar com o template renderizado. O `dispatch-service` usava corretamente o template, mas a formatação das variáveis inteligentes usava markdown (`~texto~`) quando o parse_mode era HTML.

### normalizeProductTitle
Faltavam padrões para remover o formato `": Amazon.com.br: Cozinha"` (marketplace + categoria como sufixo).

---

## 4. Correção no Discord

### `src/lib/sender.ts`
- **Removido**: `fields[]` automáticos (Preço, De, Marketplace, Cupom)
- **Removido**: `content` com "NOVA OFERTA DISPONÍVEL"
- **Mantido**: embed com `title`, `url`, `description` (template renderizado), `image`, `footer`
- O template renderizado já contém todas as informações necessárias

### `supabase/functions/public-api/index.ts`
- **Removido**: `fields[]` automáticos no embed do Discord
- **Removido**: `content` com "NOVA OFERTA DISPONÍVEL"
- Embed limpo apenas com `description` baseada no template

---

## 5. Correção no Telegram

### Variáveis inteligentes (`TemplateService.ts` e `public-api`)
As linhas inteligentes agora geram formatação **nativa por canal**:

| Variável | Telegram (HTML) | Discord (Markdown) | WhatsApp |
|---|---|---|---|
| `{preco_original_linha}` | `De: <s>R$ 199,00</s>` | `De: ~~R$ 199,00~~` | `De: ~R$ 199,00~` |
| `{cupom_linha}` | `🎟️ <b>Cupom:</b> CODIGO` | `🎟️ **Cupom:** \`CODIGO\`` | `🎟️ *Cupom:* CODIGO` |
| `{marketplace_linha}` | `🛒 <b>Marketplace:</b> AMAZON` | `🛒 **Marketplace:** AMAZON` | `🛒 *Marketplace:* AMAZON` |

Antes, todas usavam `*texto*` (markdown) que não funciona com `parse_mode: HTML`.

### Template padrão Telegram atualizado
```
🔥 **{titulo}**

🔥 **Por apenas:** {preco_promocional}
{preco_original_linha}
{cupom_linha}

{marketplace_linha}
🔗 [Comprar agora]({link})
```

---

## 6. Limpeza do Título do Produto

### Antes
```
"Mixer Vertical Turbo Chef Elgin 3 em 1 200W Preto 110v : Amazon.com.br: Cozinha"
```

### Depois
```
"Mixer Vertical Turbo Chef Elgin 3 em 1 200W Preto 110v"
```

### Novos padrões removidos
- `": Amazon.com.br: Cozinha"` (marketplace + categoria)
- `": Mercado Livre: Casa e Jardim"` (idem)
- `": Cozinha"` (categoria solta no final)
- Espaços duplos
- Separadores residuais

### Função aplicada em 3 lugares
1. `src/services/ProductEnrichmentService.ts` (frontend)
2. `supabase/functions/public-api/index.ts` (API)
3. `supabase/functions/enrich-product/index.ts` (enriquecimento)

---

## 7. Campos Vazios

A regra de variáveis inteligentes garante:
- Se não houver cupom → `{cupom_linha}` = string vazia (linha desaparece)
- Se não houver preço original → `{preco_original_linha}` = string vazia
- Se não houver marketplace → `{marketplace_linha}` = string vazia
- Se não houver desconto → `{desconto_linha}` = string vazia

A limpeza de linhas vazias no renderizador remove linhas em branco consecutivas.

---

## 8. Link is.gd

O `{link}` usa a seguinte prioridade:
1. `short_affiliate_url` (is.gd pré-gerado) — se existir
2. Se não existir, gera is.gd em runtime
3. Se is.gd falhar, fallback para tinyurl
4. Se tudo falhar, `affiliate_link` original

Não usa `linkoferta.vercel.app/o/` quando `FEATURES.useDirectAffiliateLinkInChannels = true`.

---

## 9. Unificação Manual/API

Ambos usam a mesma lógica de renderização:
- **Manual (frontend)**: `TemplateService.renderTemplate()` → `sender.sendToDiscord()` / `sendTelegramPhoto()`
- **API (Edge Function)**: `renderMessageTemplate()` (cópia espelhada) → fetch direto

A `renderMessageTemplate` da Edge Function foi sincronizada com as mesmas correções do `TemplateService.renderTemplate`.

---

## 10. Arquivos Alterados

| Arquivo | Alteração |
|---|---|
| `src/services/ProductEnrichmentService.ts` | normalizeProductTitle reforçado |
| `src/lib/sender.ts` | Discord: removidos fields e content duplicados |
| `src/lib/dispatch-service.ts` | Removido import não utilizado de sendTelegramOffer |
| `src/services/TemplateService.ts` | Templates padrão limpos + variáveis inteligentes com formatação nativa por canal |
| `supabase/functions/public-api/index.ts` | Templates, normalizeProductTitle, variáveis inteligentes, Discord sem fields duplicados |
| `supabase/functions/enrich-product/index.ts` | normalizeProductTitle reforçado |

---

## 11. Testes Realizados

### Build
- `npm run build` → ✅ Sucesso (tsc -b + vite build)
- `npm run lint` → ⚠️ Erros pré-existentes (emojis em regex, não introduzidos por esta correção)

### Verificação de código
- Buscas globais por `NOVA OFERTA DISPONÍVEL`, `embed.fields`, `OFERTA ENCONTRADA`, `content:` confirmam que a duplicação foi eliminada
- Template padrão Discord agora inclui "NOVA OFERTA DISPONÍVEL" **dentro** do template (não como content separado)
- Nenhum arquivo envia `fields` automáticos junto com template renderizado

---

## 12. Deploy das Edge Functions

- `public-api` → Deploy executado com `--no-verify-jwt`
- `enrich-product` → Deploy executado com `--no-verify-jwt`

---

## 13. Resultado do Build

```
> ofertapro@0.0.0 build
> tsc -b && vite build

✓ 2457 modules transformed.
✓ built in 1.87s
```

---

## 14. Pendências Restantes

1. **Testes de integração reais**: disparar oferta teste no Telegram e Discord para confirmar visualmente
2. **Templates customizados de usuários**: usuários que salvaram templates antigos continuarão usando-os — os templates padrão só afetam quem não personalizou
3. **Função `sendTelegramOffer`**: é legada e não é chamada no fluxo atual, mas pode ser removida futuramente
4. **Preview de template no painel**: verificar se o preview na UI reflete as novas variáveis inteligentes corretamente
5. **Lint warnings**: erros `no-misleading-character-class` são pré-existentes (emojis em regex) e não afetam funcionamento
