# Correção Salvar Oferta com Imagem — OfertaPro

## 1. Resumo executivo
Esta correção resolve o erro crítico de timeout de 10s ao salvar ofertas no banco de dados e traz melhorias essenciais de usabilidade para o fluxo de uploads e gerenciamento de imagens do SaaS OfertaPro. O fluxo foi otimizado para que somente strings simples de URLs (sejam do Supabase Storage ou externas) ou `null` sejam salvas no banco de dados, garantindo que o payload permaneça leve e as transações sejam executadas rapidamente.

## 2. Causa do timeout
O timeout ocorria por dois fatores principais:
1. **Fallback de Base64 silencioso:** No arquivo `src/lib/image-utils.ts`, a função `uploadImage` continha um bloco `catch` que convertia o arquivo local em uma string base64 de tamanho massivo caso o upload para o Supabase Storage falhasse ou demorasse. Essa string gigantesca era enviada no payload do banco de dados na coluna `image` da tabela `offers`, fazendo com que a transação excedesse o tempo limite de 10s e travasse a aplicação.
2. **Restrição NOT NULL no banco:** A coluna `image` da tabela `offers` estava configurada no PostgreSQL como `NOT NULL`. Isso forçava o envio de strings ou caía em erros de restrição do banco. A restrição foi removida (`DROP NOT NULL`) e a coluna agora é nullable, permitindo salvar ofertas sem imagem de forma nativa.

## 3. Payload da oferta
O payload enviado ao Supabase foi higienizado tanto no hook `useOfferForm.ts` quanto no serviço `OfferService.ts`. Agora ele é composto exclusivamente por tipos primitivos simples:
- `image`: Contém apenas a URL pública final da imagem (string) ou `null`. Nunca envia objetos `File`, `Blob`, URIs locais do tipo `blob:` ou strings em `base64`.
- Log seguro debug adicionado em `useOfferForm.ts` antes de persistir:
  `console.log("[OFFER_PAYLOAD_DEBUG]", ...)` sem logar tokens ou links sensíveis de afiliados.

## 4. Upload manual
O fluxo de upload manual agora executa os seguintes passos:
1. **Validação:** Valida formato (JPG, PNG, WEBP) e tamanho (máximo 5MB).
2. **Preview Rápido:** Cria uma URL de preview local (`URL.createObjectURL(file)`) para renderização imediata na UI sem latência de rede.
3. **Compressão:** Comprime a imagem localmente (com limite de 15s) usando `browser-image-compression` (com WebWorker desativado para compatibilidade com Electron/sandboxes).
4. **Persistência no Storage:** Faz o upload para o bucket `offers` com timeout de 20s.
5. **URL Pública:** Gera a URL pública e atribui ao estado `uploadedImageUrl`.
6. **Controle de Bloqueio:** Enquanto o upload está ativo, o salvamento da oferta fica bloqueado, exibindo a mensagem: *"Aguarde a imagem terminar de carregar ou remova a imagem antes de salvar."*

## 5. Imagem externa
Caso a imagem seja importada do auto-preenchimento ou colada manualmente via campo URL de imagem externa:
- O sistema grava a URL externa de forma direta na propriedade `externalImageUrl`.
- Não tenta baixar a imagem no frontend nem convertê-la para Blob, File ou base64.
- Exibe o preview de imagem. Se a URL externa estiver quebrada e falhar no carregamento, um aviso de erro amigável é exibido, permitindo a remoção da imagem com facilidade.

## 6. Botão remover imagem
A interface do modal de novas ofertas agora exibe os botões **Trocar Imagem** e **Remover Imagem** sobre o preview:
- Ao clicar em **Remover Imagem**, todos os estados (`imageFile`, `imagePreviewUrl`, `uploadedImageUrl`, `externalImageUrl`, `imageSource`, `imageError`) são devidamente limpos.
- A área de upload retorna ao estado inicial.
- O usuário pode salvar a oferta imediatamente sem imagem (gravará `null`).
- Em caso de falha de upload ou link externo quebrado, o botão de remoção rápida *"Remover imagem e continuar"* é exibido.

## 7. OfferService
O arquivo `src/services/OfferService.ts` foi auditado e aprimorado:
- Higienização robusta do payload antes de qualquer envio.
- Adoção de timeout de 15s em todas as operações de escrita no banco de dados.
- Tratamento explícito de erros com mensagens claras para violações de políticas de segurança (RLS - erro `42501`) e colunas ausentes no banco de dados (erro `42703`).
- Medição de performance por console com `console.time("[OFFER_SERVICE] ...")`.

## 8. Testes realizados
- **Build de Produção:** Executado com `npm run build` que compila os assets e executa o typecheck do TypeScript (`tsc -b`). O build passou sem erros de compilação.
- **Auditoria de Tipagem:** Corrigidas as checagens com `instanceof` que causavam reclamações de tipos disjuntos no compilador TypeScript.
- **Nullable constraint:** Executada alteração de DDL no Supabase para tornar a coluna `image` da tabela `offers` nullable (`ALTER COLUMN image DROP NOT NULL`).

## 9. Resultado do build
O comando `npm run build` completou com sucesso:
```bash
vite v8.0.11 building client environment for production...
transforming...✓ 2441 modules transformed.
rendering chunks...
dist/index.html                             0.94 kB
dist/assets/index-B-9F4UAk.css             71.22 kB
dist/assets/HistoryService-CAD9gFTh.js      0.32 kB
dist/assets/index-ClAu0OP8.js           1,130.72 kB
✓ built in 1.62s
```

## 10. Pendências restantes
Nenhuma pendência técnica crítica foi encontrada. Recomenda-se realizar testes manuais no painel para validar a nova UX.
