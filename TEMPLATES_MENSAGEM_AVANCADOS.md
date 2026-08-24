# Templates de Mensagem Avançados — Link Oferta

## 1. Resumo executivo
Este documento resume as melhorias aplicadas no SaaS **Link Oferta** para flexibilizar a aba **Configurações → Templates de Mensagem**. O sistema de templates foi estendido de forma robusta e unificada para permitir customização total de títulos, emojis, ordem de linhas, informações opcionais e links diretos para disparos no Telegram, Discord e futuramente WhatsApp.

A mesma regra de renderização e customização se aplica tanto para os disparos manuais no painel quanto para os disparos automatizados executados via API pública (Edge Function).

## 2. O que mudou na tela de templates
- **Interface Aprimorada**: A aba de edição agora conta com um campo de documentação explicativa e botões interativos para todas as variáveis suportadas.
- **Inserção Inteligente**: Clicar nas variáveis insere os valores diretamente na posição atual do cursor dentro do editor (`textareaRef`).
- **Preview em Tempo Real**: Adicionado um container de visualização realística que simula o canal selecionado e atualiza à medida que o usuário edita a estrutura. O preview utiliza dados simulados de um produto realista (Notebook ASUS Vivobook 15).
- **Validação Dinâmica**: Verificação em tempo real de variáveis desconhecidas ou inválidas (ex: `{cupom_errado}`), alertando o usuário com mensagens informativas caso haja algum erro estrutural.
- **Contador de Caracteres**: Monitora o tamanho aproximado do template configurado e da mensagem final gerada após a renderização.
- **Disparo de Teste Integrado**: Botão "Testar no Canal" que localiza o primeiro canal configurado e ativo do tipo correspondente e envia uma oferta de teste real, facilitando a validação sem precisar sair da aba.

## 3. Variáveis disponíveis
Foram padronizadas e mapeadas as seguintes variáveis no editor:
- `{titulo}`: Nome/título do produto ou oferta.
- `{preco_original}`: Preço sem desconto formatado em Real (R$).
- `{preco_promocional}`: Preço promocional com desconto formatado em Real (R$).
- `{desconto}`: Percentual do desconto calculado (Ex: `17%`).
- `{cupom}`: Cupom de desconto associado à oferta.
- `{marketplace}`: Loja ou marketplace de origem em letras maiúsculas (Ex: `AMAZON`).
- `{categoria}`: Categoria cadastrada para a oferta.
- `{link}`: Link direto do afiliado (afiliado direto).
- `{imagem}`: URL da imagem do produto.
- `{nome_afiliado}`: Nome completo ou preferido do afiliado configurado em seu perfil.
- `{nome_vitrine}`: Nome do catálogo/vitrine pública do usuário.
- `{data}`: Data do envio no formato brasileiro (DD/MM/AAAA).
- `{hora}`: Hora do envio no formato 24 horas (HH:MM).

*Aliases suportados para retrocompatibilidade:*
- `{{titulo}}`, `{{preco_original}}`, `{{preco_promocional}}`, `{{cupom}}`, `{{link}}` são traduzidos automaticamente para as variáveis de chave única.

## 4. Linhas inteligentes
Para evitar mensagens quebradas com termos do tipo `undefined`, `null` ou vazios, foram criadas as **linhas inteligentes condicionais**. Elas geram o conteúdo formatado se o dado existir, e desaparecem sem deixar linhas em branco consecutivas se o dado estiver ausente:
- `{preco_original_linha}`: Se houver preço original, insere `De: ~R$ X.XXX,XX~` (ou com taxado markdown `~~` no Discord). Se não houver, some.
- `{cupom_linha}`: Se houver cupom, insere `🎟️ Cupom: *CUPOM*`. Se não houver, some.
- `{desconto_linha}`: Se houver desconto, insere `🔥 *X% OFF*`. Se não houver, some.
- `{marketplace_linha}`: Se houver marketplace, insere `🛒 Marketplace: *LOJA*`. Se não houver, some.
- `{categoria_linha}`: Se houver categoria, insere `📁 Categoria: *CAT*`. Se não houver, some.
- `{imagem_linha}`: Se houver imagem, insere `🖼️ Imagem: URL`. Se não houver, some.

## 5. Persistência no Supabase
- Os templates personalizados são armazenados na tabela `public.user_settings` vinculados ao `user_id`.
- Criado o script SQL `supabase/supabase_message_templates.sql` contendo a definição da tabela, chaves únicas, constraints e regras de Row Level Security (RLS) que asseguram que cada usuário pode acessar/atualizar exclusivamente seus próprios templates de canais.

## 6. Aplicação no envio manual
- A função central `dispatchOffer` localizada em `src/lib/dispatch-service.ts` lê as configurações de `user_settings` em runtime.
- Renderiza a mensagem por canal usando a função `TemplateService.renderTemplate` com os templates definidos pelo usuário ou recorre aos templates padrão caso não estejam customizados.

## 7. Aplicação no envio via API
- O endpoint `/dispatch` da Edge Function pública `public-api` foi aprimorado.
- Ele busca ativamente as configurações de `user_settings` correspondentes ao usuário dono da API Key.
- Utiliza a função unificada `renderMessageTemplate` implementada internamente no Deno para formatar o texto do disparo exatamente com o mesmo comportamento do frontend.

## 8. Aplicação no Telegram
- As mensagens do Telegram agora seguem 100% o texto gerado pelo template.
- Implementado tratamento inteligente para o limite de legendas (1024 caracteres) no Telegram:
  - Se a mensagem renderizada for menor ou igual a 1024 caracteres, ela é enviada na legenda da foto normalmente.
  - Se a mensagem exceder 1024 caracteres, a foto é disparada com uma legenda curta contendo o título da oferta, e em seguida a mensagem com o template renderizado é enviada como um texto completo em separado para evitar erros do bot.
  - Se a foto falhar, cai no fallback automático de enviar como mensagem de texto com o link da imagem ao final.

## 9. Aplicação no Discord
- O texto principal do Discord (ou o campo `description` do embed enviado via webhook) recebe integralmente o template do canal renderizado.
- O link principal do embed (`embed.url`) aponta diretamente para o link de afiliado direto (`affiliate_link`), respeitando a conformidade de conversão.

## 10. Link direto em {link}
- Garantiu-se que a variável `{link}` seja substituída unicamente pela URL de afiliado direta cadastrada (`affiliate_link`/`affiliateLink`), eliminando o uso do link curto da plataforma (`linkoferta.vercel.app/o/...`) nos canais de disparo quando a regra de link direto estiver ativa.

## 11. Segurança
- **Higienização de Entradas**: Sanitização de quebras de linha múltiplas consecutivas (`\n{3,}` -> `\n\n`) e remoção automática de linhas órfãs geradas por variáveis dinâmicas vazias.
- **Isolamento Multitenant**: RLS protegendo os dados no Supabase. O backend executa validação da chave de API via hashing SHA-256 e restringe o carregamento de templates aos recursos pertencentes exclusivamente ao `user_id` associado.

## 12. Arquivos alterados
- [TemplateService.ts](file:///d:/ofertapro/src/services/TemplateService.ts): Implementou motor de renderização, aliases, novos templates padrão e validador estático de chaves de templates.
- [Settings.tsx](file:///d:/ofertapro/src/pages/Settings.tsx): Reformulação visual da aba de templates, novos estados, ref para injeção no cursor do textarea, contador de caracteres dinâmico, preview interativo e função de teste de envio de canais.
- [dispatch-service.ts](file:///d:/ofertapro/src/lib/dispatch-service.ts): Integração do template na renderização das mensagens para disparos efetuados via Telegram no fluxo do painel.
- [telegram.ts](file:///d:/ofertapro/src/lib/telegram.ts): Adaptação do `sendTelegramPhoto` para realizar splits de mensagens quando a legenda ultrapassa o limite de 1024 caracteres.
- [index.ts](file:///d:/ofertapro/supabase/functions/public-api/index.ts): Implementação Deno de renderização de templates de canais e suporte ao `user_settings` e splits de mensagens do Telegram para envios automatizados via API pública.
- [supabase_message_templates.sql](file:///d:/ofertapro/supabase/supabase_message_templates.sql): Documentação da migration de banco para a tabela e políticas de segurança RLS.

## 13. Testes realizados
1. **Salvar Template**: Templates do Telegram editados no painel permanecem salvos e são persistidos no banco Supabase após clicar em salvar.
2. **Preview Interativo**: O preview responde em tempo real à digitação, substituindo dinamicamente as variáveis e alertando caso haja algum termo desconhecido.
3. **Restaurar Padrão**: Clicar no botão redefine para os novos templates padrão configurados.
4. **Disparo de Teste**: Validação de envio para canais reais do Discord e Telegram do usuário.
5. **Envio via API pública**: Validação de disparos automatizados simulando chamada de API que agora aplicam com sucesso os templates dinâmicos.
6. **Controle de Caption**: Envio de mensagens longas (> 1024 caracteres) com foto no Telegram, comprovando a fragmentação correta da legenda e corpo da mensagem.

## 14. Deploy de Edge Functions
- A Edge Function `public-api` foi deployada com sucesso:
  `supabase functions deploy public-api --project-ref zuqaccivowbzdfrpgekz --no-verify-jwt`

## 15. Resultado do build
- Compilação executada sem erros no compilador TypeScript e Vite:
  `tsc -b && vite build` (Completado com sucesso)

## 16. Pendências restantes
- Nenhuma pendência restante encontrada. Os requisitos especificados no objetivo foram todos implementados, testados e validados com êxito.
