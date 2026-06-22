# Correção Formatação Templates por Canal — Link Oferta

## 1. Resumo executivo
Este documento detalha o diagnóstico e a correção do bug de formatação de mensagens do Link Oferta. O bug fazia com que as mensagens enviadas para canais como Telegram exibissem a sintaxe de marcação Markdown (asteriscos, colchetes, etc.) de forma literal como texto puro. A solução envolveu a criação de renderização e formatação específicas por canal (Telegram, Discord, WhatsApp), escape de tags HTML e caracteres em campos dinâmicos e especificação do `parse_mode` como HTML para o Telegram.

## 2. Bug reproduzido
- Ao enviar mensagens para o Telegram com marcações como `**negrito**` ou `[Comprar agora](url)`, a formatação visual não era aplicada.
- A mensagem chegava ao Telegram com caracteres literais de marcação, por exemplo: `🔥 *💎 Escova de Dente Colgate...*`.
- Links no formato Markdown (`[Comprar agora](...)`) não se tornavam links clicáveis e exibiam a estrutura crua do Markdown.

## 3. Por que o Telegram mostrava asteriscos
O Telegram Bot API não formata mensagens automaticamente a menos que um parâmetro `parse_mode` seja explicitamente especificado na requisição do bot (`sendMessage`/`sendPhoto`). Como o `parse_mode` não estava configurado ou estava como texto sem processamento adequado, o Telegram exibia todo o conteúdo de forma literal como texto cru (incluindo marcações como asteriscos e colchetes). Além disso, a sintaxe padrão MarkdownV2 do Telegram exige o escape rigoroso de uma vasta lista de caracteres especiais do Markdown, o que gerava frequentes erros de parsing de mensagens.

## 4. Estratégia por canal
Para resolver o problema de modo robusto, o processamento de templates foi dividido em duas fases:
1. **Substituição de Variáveis**: Injeta os dados da oferta e do afiliado nas chaves correspondentes no template.
2. **Formatação de Sintaxe por Canal**: O texto resultante é interpretado de acordo com o canal de destino:
   - **Telegram**: Traduz comandos de formatação simples para tags HTML equivalentes e envia com `parse_mode: "HTML"`.
   - **Discord**: Usa Markdown padrão compatível com Discord.
   - **WhatsApp**: Converte marcações e transforma links Markdown em texto inline + URL direta.

## 5. Telegram com HTML parse_mode
O Telegram foi configurado para utilizar o `parse_mode: "HTML"`.
- A formatação simplificada do editor é convertida da seguinte forma antes do envio:
  - `**negrito**` ou `*negrito*` ➡️ `<b>negrito</b>`
  - `_itálico_` ➡️ `<i>itálico</i>`
  - `~riscado~` ➡️ `<s>riscado</s>`
  - `[Comprar agora](link)` ➡️ `<a href="link">Comprar agora</a>`
- **Escape de HTML**: Para garantir que o bot não quebre ao processar caracteres especiais presentes no título do produto ou cupons (como `<`, `>`, `&`, `"`), todos os valores das variáveis dinâmicas inseridas são higienizados por uma função `escapeHTML` antes de serem substituídos no template. Isso garante segurança completa contra injeção e quebras de parsing de tags mal formadas. No caso das URLs, o caractere `&` é escapado como `&amp;` em conformidade com o parser HTML do Telegram.

## 6. Discord com Markdown
O Discord utiliza Markdown clássico:
- Negritos são preservados como `**negrito**`.
- Itálicos são mantidos como `*itálico*` ou `_itálico_`.
- Riscado simplificado `~texto~` ou `~~texto~~` é convertido e garantido no padrão duplo do Discord: `~~texto~~`.
- Links Markdown `[texto](url)` são mantidos pois o Discord suporta links clicáveis no campo `description` de embeds.

## 7. WhatsApp com sintaxe própria
Para o WhatsApp:
- Negritos `**texto**` são convertidos para o padrão de asterisco único: `*texto*`.
- Riscado e itálico mantêm a sintaxe nativa (`~riscado~`, `_itálico_`).
- Como o WhatsApp não suporta links ancorados em texto Markdown, estruturas como `[Comprar agora]({link})` são convertidas automaticamente em texto puro + link inline:
  `Comprar agora:`
  `https://amzn.to/...`

## 8. Conversão de links
- Links ancorados em Markdown como `[Texto]({link})` funcionam de forma nativa e são convertidos dinamicamente de acordo com as regras de cada canal.
- A variável `{link}` é processada de forma a utilizar o link direto de afiliado (`affiliate_link`/`affiliateLink`), sem trafegar pelo redirecionador do Link Oferta.

## 9. Variáveis inteligentes
As variáveis inteligentes (`{preco_original_linha}`, `{cupom_linha}`, etc.) foram mantidas e aperfeiçoadas. Caso o valor do dado correspondente não esteja presente na oferta:
- A linha correspondente e sua quebra de linha são totalmente omitidas.
- A higienização de pós-renderização remove linhas vazias em duplicidade para manter a mensagem compacta e legível.

## 10. Arquivos alterados
- [TemplateService.ts](file:///d:/ofertapro/src/services/TemplateService.ts): Implementou funções `escapeHTML`, `formatTelegramHTML`, `formatDiscordMarkdown` e `formatWhatsAppText`, integrando-as na renderização base do `renderTemplate` conforme o canal.
- [Settings.tsx](file:///d:/ofertapro/src/pages/Settings.tsx): Adição do método `injectFormat` para formatação rápida com botões interativos na aba de templates, explicação resumida de regras de canais e atualização do preview real do Telegram interpretando o HTML gerado usando `dangerouslySetInnerHTML`.
- [dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts): Especificação explícita de `parse_mode: 'HTML'` no envio de mensagens de Telegram disparadas via painel manual.
- [telegram.ts](file:///d:/ofertapro/src/lib/telegram.ts): Configuração explícita de `parse_mode: 'Markdown'` em funções auxiliares legadas (`sendTelegramOffer` e `testTelegramConnection`) para garantir retrocompatibilidade.
- [index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts): Implementação dos formatadores de canais compatíveis com Deno na Edge Function e especificação de `parse_mode: 'HTML'` em todas as requisições de disparos de Telegram executadas via API.

## 11. Testes realizados
- **Validação de Formatação**: Confirmação visual no preview do painel do Telegram exibindo o texto formatado corretamente, interpretando tags de negrito, riscado e links clicáveis.
- **Validação de Inputs**: Botões de formatação no editor de templates testados com sucesso (inserindo tags nos placeholders ou envolvendo seleções de texto atuais do usuário).
- **Tratamento de Linhas**: Validação de ofertas sem cupom, confirmando que a linha inteligente some do preview.
- **Teste de Build**: Execução com sucesso do empacotador de produção.

## 12. Deploy da public-api, se houve
A Edge Function foi localmente atualizada e os testes de build de código passaram perfeitamente. O comando de deploy foi rodado:
`supabase functions deploy public-api --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt`
No entanto, o deploy retornou erro 403 (falta de privilégios/credenciais expiradas na sessão CLI local da conta Supabase). O arquivo local está corrigido e pronto para deploy assim que o login for restabelecido.

## 13. Resultado do build
- Compilação do TypeScript e empacotamento com Vite concluídos com sucesso via `npm run build`.

## 14. Pendências restantes
- Executar o comando de deploy da Edge Function `public-api` na nuvem Supabase assim que o login ou token de acesso CLI for atualizado localmente pelo usuário.
