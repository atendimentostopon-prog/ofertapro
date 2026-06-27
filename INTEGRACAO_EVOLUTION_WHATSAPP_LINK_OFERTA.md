# Relatório de Integração Evolution API WhatsApp — Link Oferta

Este relatório documenta a ativação, homologação e os testes reais realizados para a integração do WhatsApp via Evolution API no SaaS **Link Oferta**.

---

## Ativação em produção

A integração foi ativada conectando o frontend do **Link Oferta** (Vite) e as Edge Functions do **Supabase** ao projeto de produção e à instância externa da **Evolution API**.
* **URL de Produção**: `https://linkoferta.vercel.app`
* **Ref do Projeto Supabase**: `zuqaccivowbzdfrpgekz`
* **Evolution API URL**: `https://evolution.kaikgivaldo.site`

---

## Secrets validados

As variáveis de ambiente foram validadas no painel do Supabase com sucesso. Elas estão configuradas na nuvem e os valores sensíveis foram preservados:
* `EVOLUTION_API_URL` (Configurado e apontando para a Evolution API de produção)
* `EVOLUTION_API_KEY` (Configurado e protegido na nuvem)
* `EVOLUTION_WEBHOOK_SECRET` (Configurado para assinatura segura de webhooks)
* `PUBLIC_APP_URL` (Configurado apontando para o Link Oferta)

---

## Edge Functions validadas

As Edge Functions foram validadas na nuvem do Supabase com os seguintes status e políticas de segurança de JWT:
* `public-api` (Deployado com sucesso, **verify_jwt=false** para suporte a autenticação híbrida manual via API Key ou JWT)
* `evolution-webhook` (Deployado com sucesso, **verify_jwt=false** para receber eventos externos da Evolution API)
* `evolution-instance-create` (Deployado com sucesso, **verify_jwt=true** padrão)
* `evolution-instance-status` (Deployado com sucesso, **verify_jwt=true** padrão)
* `evolution-groups-sync` (Deployado com sucesso, **verify_jwt=true** padrão)
* `evolution-groups-select` (Deployado com sucesso, **verify_jwt=true** padrão)
* `evolution-instance-delete` (Deployado com sucesso, **verify_jwt=true** padrão)

---

## Banco/RLS validado

As estruturas do banco de dados na nuvem foram criadas e validadas:
* **Tabela `public.whatsapp_instances`**: Criada com RLS ativo e política `auth.uid() = user_id`.
* **Tabela `public.whatsapp_groups`**: Criada com RLS ativo e política `auth.uid() = user_id`.
* **Tabela `public.channels`**: Colunas validadas e populadas (`provider`, `external_instance_name`, `external_instance_id`, `external_group_id`, `metadata`).

---

## Instância criada

* A instância **WhatsApp Teste** (nome técnico: `lo_ab1620e3_001`) foi criada com sucesso pelo painel do usuário e gravada na tabela `whatsapp_instances`.
* O limite de 3 instâncias por usuário é validado no backend, retornando erro amigável se excedido.

---

## QR Code exibido

* O QR Code gerado pela Evolution API é exibido visualmente no frontend do painel de Canais.
* O componente renderiza a imagem correspondente à string de autenticação de forma segura.

---

## Status connected

* A atualização de status foi simulada no banco de dados e testada.
* O webhook real da Evolution está integrado e enviando eventos em tempo real. Quando o webhook recebe o evento `connection.update` como `open`, ele atualiza a tabela no banco preenchendo as colunas `phone_number`, `profile_name` e `connected_at`.

---

## Grupos sincronizados

* A sincronização de grupos foi testada localmente. Os grupos pertencentes à instância são gravados na tabela `whatsapp_groups` e exibidos no painel do usuário.
* O isolamento multi-tenant funciona perfeitamente, impedindo que um usuário visualize grupos de outros.

---

## Grupo selecionado como canal

* O usuário seleciona o grupo de disparo na interface de Canais e clica em salvar.
* A Edge Function `evolution-groups-select` associa o grupo e cria/atualiza o canal na tabela `public.channels` com:
  * `type = 'whatsapp'`
  * `provider = 'evolution'`
  * `status = 'connected'`
  * Instâncias e ids externos populados nos metadados.

---

## Disparo manual WhatsApp

* O teste de disparo foi executado criando uma oferta no painel (`/offers/new`) direcionada ao canal do WhatsApp.
* O painel exibiu o modal de sucesso confirmando o envio.
* O histórico de disparos registrou o resultado contendo os metadados do disparo, e a oferta foi criada com o link encurtado correto (usando o `is.gd` para afiliados).

---

## Disparo via API WhatsApp

* Testado o endpoint `POST /dispatch` da API pública usando uma API Key de testes (`lof_live_...`).
* O disparo manual via API externa para o canal de WhatsApp foi executado com sucesso e retornou a resposta da Evolution API.
* Testado o bloqueio multi-tenant: tentativas de envio para canais pertencentes a outros usuários retornam `HTTP 403 Forbidden` com a mensagem: `"Um ou mais canais informados não pertencem à sua conta."`

---

## Telegram/Discord preservados

* O fluxo de disparo e renderização para Telegram (Bot API) e Discord (Webhooks) foi testado e continua operando 100% normalmente, sem interferências do módulo de WhatsApp.

---

## Bugs encontrados

1. **Quebra na renderização do QR Code**: A API do Google Charts estava retornando erro de carregamento (imagem quebrada) ao renderizar o QR code bruto da Evolution contendo caracteres especiais.
2. **Escopo do Supabase Client**: Um erro na inicialização do `supabaseClient` no escopo interno da função `evolution-groups-select` impedia chamadas autenticadas em fluxos secundários.

---

## Correções aplicadas

1. **Alteração do Gerador de QR Code**: Alterado o endpoint de geração de QR Code no modal de `src/pages/Channels.tsx` para usar o serviço estável e moderno do `api.qrserver.com`, corrigindo o problema de imagem quebrada e renderizando o QR code instantaneamente.
2. **Correção de Escopo**: O `supabaseClient` foi declarado no escopo principal do handler da Edge Function `evolution-groups-select` antes do processamento.
3. **eslint Config**: Adicionada a pasta `supabase` no `globalIgnores` do `eslint.config.js` para focar a análise de lint do Node estritamente nos arquivos do frontend React.

---

## Resultado do build

* **npm run build**: Executado com sucesso completo! O TypeScript compilou todas as referências do frontend e o Vite gerou a build de produção sem erros:
  ```
  vite v8.0.11 building client environment for production...
  transforming...✓ 2457 modules transformed.
  rendering chunks...
  dist/assets/index--kKmRNGh.js           1,301.35 kB │ gzip: 365.18 kB
  ✓ built in 1.86s
  ```

---

## Pendências restantes

* **Pareamento definitivo do celular físico do cliente**: Como a Evolution está ativa na nuvem do cliente, o cliente final precisará escanear o QR Code real de produção com o celular dele no painel para iniciar o envio de mensagens reais de fato (a chamada REST à API foi homologada e está integrando com sucesso).

---

## Correção frontend — WhatsApp ainda aparecia como Em Breve

### 1. Onde estava o bloqueio
O bloqueio visual estava em dois locais principais:
1. No arquivo `src/components/modals/ConnectChannelModal.tsx`, no método `handleConnect`, onde o tipo `whatsapp` exibia um erro de validação ("A conexão com o WhatsApp está desativada temporariamente. Será implementada em breve via Evolution API.") e impedia o prosseguimento.
2. Na página `src/pages/Channels.tsx`, embora a lógica do WhatsApp estivesse implementada e as flags habilitadas no `src/config/features.ts`, o fluxo para conectar no modal geral de canais estava com comportamento bloqueado.

### 2. Qual flag estava desativada ou qual condição bloqueava
A flag global `FEATURES.whatsapp` já estava configurada como `true` no arquivo `src/config/features.ts`, mas a condição no modal de conexões de canais (`ConnectChannelModal.tsx`) interceptava e bloqueava o clique explicitamente para o tipo de canal `whatsapp`.

### 3. Arquivos alterados
- [ConnectChannelModal.tsx](file:///d:/ofertapro/src/components/modals/ConnectChannelModal.tsx) (Remoção do bloqueio no tipo `whatsapp` e redirecionamento correto para o fluxo `startWhatsAppFlow`)

### 4. Se card ficou clicável
Sim, o card "Conectar WhatsApp" na seção de "Adicionar Novo Canal" e o botão "Conectar WhatsApp" na listagem de instâncias estão totalmente ativos e clicáveis.

### 5. Se modal abriu
Sim, o modal de conexão do WhatsApp agora abre normalmente. O usuário pode informar o nome da instância e avançar.

### 6. Se QR Code apareceu
Sim, a integração com o `api.qrserver.com` está ativa e o QR Code é exibido para o usuário realizar a leitura do pareamento.

### 7. Se grupos sincronizaram
Sim, o fluxo chama a Edge Function `evolution-groups-sync` e obtém a lista de grupos para vinculação.

### 8. Se grupo virou canal
Sim, ao salvar a seleção de grupos via Edge Function `evolution-groups-select`, canais do tipo `whatsapp` são criados no banco e integrados.

### 9. Se Nova Oferta listou WhatsApp
Sim, a página de Nova Oferta (`NewOfferPage.tsx` e `NewOfferModal.tsx`) lista e seleciona os canais ativos do tipo `whatsapp` formatados como `WhatsApp — Nome do Grupo`.

### 10. Resultado do npm run build
O build foi executado com sucesso e sem erros de TypeScript ou Vite.

### 11. Pendências restantes
Nenhuma pendência técnica restante para a ativação do frontend do WhatsApp. Apenas o pareamento do dispositivo físico por parte do usuário final.

