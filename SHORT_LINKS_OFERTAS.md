# Short Links de Ofertas — Link Oferta

## 1. Resumo executivo
O objetivo desta alteração foi a substituição de links longos com formato baseado em UUID por URLs encurtadas, elegantes e de fácil leitura para compartilhamento nos canais (Discord, Telegram) e na vitrine pública. Para isso, foi implementado um sistema interno de códigos curtos (`short_code`), garantindo que o rastreamento por origem (`src=discord`, `src=telegram`, `src=public_page`, etc.) continue registrando os cliques de forma transparente sem quebrar links legados.

## 2. Formato antigo do link
```text
https://linkoferta.vercel.app/r/1b842df1-7cdf-4c3d-9677-c0284bdae853?src=discord
```

## 3. Formato novo do link
```text
https://linkoferta.vercel.app/o/h1yypc?src=discord
https://linkoferta.vercel.app/o/bzdwth?src=telegram
```

## 4. Migration criada
A migration foi salva no arquivo [supabase_short_links.sql](file:///d:/ofertapro/supabase_short_links.sql) e aplicada com total sucesso na base de dados de produção do Supabase. O script realiza as seguintes etapas de forma segura e não disruptiva:
1. Criação da função PL/pgSQL `generate_short_code()` para chaves únicas de 6 caracteres.
2. Adição da coluna `short_code` na tabela `offers`.
3. Preenchimento retroativo de códigos únicos para todas as ofertas existentes.
4. Definição do default na tabela para novas ofertas.
5. Inserção de restrição `UNIQUE` (índice único) sobre a coluna `short_code`.

## 5. Campos adicionados no banco
* **Tabela:** `public.offers`
* **Coluna:** `short_code` (Tipo: `TEXT`, restrição `UNIQUE`, default `public.generate_short_code()`).

## 6. Como o short_code é gerado
* **No Banco de Dados (Principal)**: Uma função SQL PL/pgSQL escolhe aleatoriamente 6 caracteres de um alfabeto de 36 caracteres contendo minúsculas e números (`[a-z0-9]`). Ela verifica em loop se o código já existe na tabela `offers`. Se colidir, gera um novo até obter um código único antes de retornar.
* **No Frontend (Fallback)**: Caso a oferta por algum motivo raro seja enviada sem um `short_code` gerado, o `dispatch-service` gera dinamicamente um código de 6 dígitos no mesmo padrão no frontend, tenta salvá-lo via UPDATE no Supabase e prossegue o disparo usando-o.

## 7. Arquivos alterados
* [src/types/index.ts](file:///d:/ofertapro/src/types/index.ts): Adição de propriedades `shortCode` e `short_code` no tipo `Offer`.
* [src/pages/Offers.tsx](file:///d:/ofertapro/src/pages/Offers.tsx): Mapeamento no `mapOfferToType` e repasse no método de reenvio de ofertas.
* [src/pages/History.tsx](file:///d:/ofertapro/src/pages/History.tsx): Repasse do `shortCode` na chamada de reenvio a partir do histórico.
* [src/hooks/useOfferForm.ts](file:///d:/ofertapro/src/hooks/useOfferForm.ts): Mapeamento no hook do formulário de ofertas para resgatar e transmitir o `shortCode` retornado pelo banco no momento da criação/edição.
* [src/lib/dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts): Resolução dinâmica de `shortCode` e atualização da geração de URLs curtas dos disparos de canais (Discord/Telegram).
* [src/lib/sender.ts](file:///d:/ofertapro/src/lib/sender.ts): Ajuste no payload do Webhook do Discord para que a URL do embed aponte para o link encurtado.
* [src/components/shared/OfferCard.tsx](file:///d:/ofertapro/src/components/shared/OfferCard.tsx): Atualização do botão "Copiar link encurtado" para gerar o link no formato curto `/o/{shortCode}`.
* [src/pages/PublicPage.tsx](file:///d:/ofertapro/src/pages/PublicPage.tsx): Atualização dos botões "Pegar Promoção" na vitrine pública para apontar para a rota curta.
* [src/pages/RedirectPage.tsx](file:///d:/ofertapro/src/pages/RedirectPage.tsx): Lógica para lidar com parâmetros tanto de ID antigo (UUID) quanto de shortCode, busca da oferta no banco, gravação segura de cliques usando o UUID mapeado e redirecionamento final.
* [src/App.tsx](file:///d:/ofertapro/src/App.tsx): Inclusão da rota `/o/:shortCode`.

## 8. Rotas adicionadas
* `/o/:shortCode` associada ao componente `RedirectPage`.

## 9. Compatibilidade com links antigos
Os links antigos `/r/:id` e `/l/:id` (baseados em UUID) foram 100% mantidos e funcionam normalmente. O componente `RedirectPage` identifica qual parâmetro foi fornecido na rota e faz o select correspondente para obter o link de afiliado, sem causar quebras no sistema.

## 10. Testes realizados
Os testes foram realizados de forma automatizada no ambiente local apontando para o Supabase de produção:
1. **Nova Oferta**: Uma nova oferta foi criada e gravada com sucesso, recebendo o short_code `bzdwth` diretamente pelo banco.
2. **Cópia de Link**: Ao clicar no botão de copiar link no card de ofertas do painel, o link copiado no clipboard foi `http://localhost:5174/o/bzdwth`, confirmando o novo formato curto.
3. **Disparos**: O disparo para o Discord foi enviado com sucesso com o link curto `/o/bzdwth?src=discord` no embed.
4. **Redirecionamento**: Acessar o link curto `/o/bzdwth` e a oferta antiga `/o/h1yypc` redirecionaram com sucesso imediato para o link de afiliado na Amazon.
5. **Estatísticas de Clicks**: Os cliques foram incrementados e gravados com total sucesso na tabela `clicks` do banco de dados para ambas as ofertas.

## 11. Resultado do build
O comando `npm run build` foi executado com sucesso sem apresentar nenhum erro de compilação do TypeScript, Lint ou Vite:
```bash
vite v8.0.11 building client environment for production...
✓ built in 1.57s
dist/assets/index-Yq6RCdIM.js           1,184.81 kB
```

## 12. Pendências restantes
Nenhuma pendência técnica. O sistema está 100% testado, compilado e pronto para deploy automático na Vercel através do push das alterações para a branch principal.
