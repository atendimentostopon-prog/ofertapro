# Auto-preenchimento de Oferta — OfertaPro

## 1. Resumo
O recurso de auto-preenchimento inteligente de ofertas do OfertaPro permite que o usuário simplesmente cole um link de afiliado no formulário para que o sistema identifique o marketplace correspondente e busque, de forma automática e segura no backend, informações do produto como título, imagens, preços e cupons disponíveis.

## 2. Marketplaces suportados
A auto-detecção e enriquecimento de links oferece suporte nativo aos seguintes domínios e seus respectivos encurtadores:
- **Amazon:** `amazon.com.br`, `amazon.com`, `amzn.to`
- **Mercado Livre:** `mercadolivre.com.br`, `mercadolivre.com`, `produto.mercadolivre.com.br`, `meli.to`
- **Shopee:** `shopee.com.br`, `shopee.com`, `shope.ee`
- **Magalu:** `magalu.com`, `magazineluiza.com.br`, `m.magazineluiza.com.br`
- **AliExpress:** `aliexpress.com`, `pt.aliexpress.com`, `s.click.aliexpress.com`

## 3. Como funciona
1. O usuário cola o link no campo "Link de Afiliado".
2. O sistema executa uma checagem local por expressões regulares para identificar e selecionar o marketplace correspondente no formulário, emitindo um aviso discreto de detecção.
3. Ao clicar em **"Buscar dados do produto"**, o frontend envia a URL via chamada POST segura para a Supabase Edge Function `enrich-product`.
4. A Edge Function resolve os encurtadores/redirecionamentos (até 5 níveis), faz a requisição na página de destino final e processa o HTML.
5. Os metadados encontrados são mapeados para preencher os campos do formulário que ainda estiverem vazios (nunca sobrescreve dados editados manualmente pelo usuário).

## 4. Edge Function
A lógica de scraping e resolução de links está isolada na Edge Function `enrich-product` (`supabase/functions/enrich-product/index.ts`). A chamada é realizada de forma totalmente assíncrona com tratamento contra falhas, evitando bloquear a UI do painel ou expor a aplicação a gargalos de performance.

## 5. O que pode ser preenchido
- **Título:** Extraído de tags de metadados Open Graph (`og:title`), Twitter Cards (`twitter:title`) ou tag HTML `<title>`.
- **Marketplace:** Reavaliado a partir da URL final redirecionada.
- **Preço Promocional (Venda):** Extraído de tags do tipo `product:price:amount` ou por meio de varredura inteligente por regex buscando o menor padrão de preço BRL (`R$ XX,XX`) no documento.
- **Preço Original (De):** Extraído do segundo maior valor de preço BRL localizado no documento de forma comparativa.
- **Cupom:** Identificado via parâmetros da URL final (ex: `?coupon=...`, `?cupom=...`, `?voucher=...`).
- **URL da Imagem:** Puxada das metatags de imagem (`og:image`, `og:image:secure_url`, `twitter:image`).

## 6. Limitações
- **Scraping de Preços:** Nem todas as plataformas disponibilizam o preço em formato padronizado de metatags. O preenchimento de preços serve como um facilitador baseado em melhor esforço e pode falhar em páginas protegidas por Cloudflare ou que utilizam renderização client-side dinâmica baseada em JS pesado.
- **Detecção de Cupons:** A captura de cupons depende exclusivamente de parâmetros visíveis de rastreamento na query da URL. Cupons em banners ou inseridos na descrição da página não são extraídos de forma garantida.
- **Metatags Ausentes:** Caso a página de destino não forneça tags Open Graph válidas, os dados não serão importados de forma automática, obrigando o preenchimento manual de determinados campos.

## 7. Preços
Os preços capturados na Edge Function são normalizados para ponto flutuante, convertidos em centavos no frontend e exibidos na máscara de moeda brasileira padrão (`R$ 0,00`). Caso nenhum preço seja identificado, o campo permanece vazio para que o usuário insira o valor manualmente. **Nunca inventamos dados.**

## 8. Cupom
Caso a URL não contenha cupons visíveis nos parâmetros de busca, o formulário deixará o campo de cupom em branco e exibirá a mensagem informativa: *"Cupom não encontrado automaticamente."*

## 9. Imagem
A URL de imagem retornada pela busca é inserida no campo opcional "URL da imagem externa". Se a imagem externa for válida, o preview é exibido imediatamente no formulário e no mockup do celular. Caso ocorra erro ao renderizar o preview da imagem remota, o modal não trava e um alerta é exibido permitindo a remoção do link quebrado. O upload de arquivo local sempre tem prioridade absoluta e substitui qualquer imagem externa.

## 10. Segurança
A Edge Function implementa restrições robustas de segurança:
- Rejeição e bloqueio automático de protocolos diferentes de `http` / `https`.
- Bloqueio de conexões a endereços IP locais (`localhost`, `127.0.0.1`, subredes `192.168.*`, `10.*`, `172.*`) para mitigar ataques de Server-Side Request Forgery (SSRF).
- Limite estrito de 5 redirecionamentos máximos para evitar loops de redirects.
- Timeout estrito de 8 segundos nas chamadas de fetch para evitar travamentos ou consumo excessivo de recursos.

## 11. Como testar
Cole links do formato:
- Amazon: `https://www.amazon.com.br/dp/B08TESTE123`
- Shopee: `https://shopee.com.br/product-i.123.456`
- Mercado Livre: `https://produto.mercadolivre.com.br/MLB-123456789-produto`

E verifique se:
1. O marketplace é selecionado de forma automática com o aviso discreto abaixo do campo.
2. O botão "Buscar dados do produto" aparece ativo.
3. Clicar no botão busca os dados sem travar a interface e preenche os campos vazios.

## 12. Futuras APIs oficiais
Para fins de escala e resiliência em ambiente de produção, é recomendada a transição do scraping baseado em metatags HTML para as APIs oficiais dos respectivos marketplaces parceiros (como *Amazon Product Advertising API*, *Shopee Open Platform* e *Mercado Livre API*), que garantem maior consistência, atualização em tempo real de preços e recuperação de dados mesmo em links altamente protegidos contra bots.
