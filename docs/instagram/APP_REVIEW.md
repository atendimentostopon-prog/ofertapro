# App Review da Meta: como liberar o Instagram para todos os clientes

Objetivo: obter **Acesso Avançado** nas 3 permissões do módulo. Sem isso, só contas com papel
no app (admins, desenvolvedores e Testadores do Instagram) conseguem conectar. Publicar o app
(modo Live) não basta.

## 1. Pré-requisitos (marcar antes de submeter)

| # | Item | Quem | Como conferir |
|---|---|---|---|
| 1 | Verificação do negócio concluída | dono | Meta Business Suite > Configurações > Central de segurança |
| 2 | App publicado (Live) | dono | Painel do app > Publicar mostra "Publicado" |
| 3 | URL da política de privacidade aceita | dono | Configurações do app > Básico (campo sem erro vermelho) |
| 4 | URL dos termos de uso aceita | dono | idem |
| 5 | Exclusão de dados: callback `.../ig-data-deletion` | feito | já salvo; responde 200 com `confirmation_code` |
| 6 | Desautorização: callback `.../ig-deauthorize` | feito | já salvo; responde 200 |
| 7 | Ícone 1024x1024 e categoria | feito | Configurações do app > Básico |
| 8 | Conta Aflyo para o revisor (plano Pro, sem trial) | dono | ver seção 5 |
| 9 | Conta Instagram de teste com convite de testador aceito | dono | ver seção 5 |
| 10 | Vídeo gravado (seção 4) | dono | arquivo MP4 de até 3 a 5 min |

Observação sobre as URLs (itens 3 e 4): se a Meta recusar `app.aflyo.com.br` com
"should represent a valid URL", a Cloudflare provavelmente está desafiando o validador.
Liberar o User-Agent `facebookexternalhit` e o ASN 32934 em Security > WAF, ou desligar o
Bot Fight Mode temporariamente enquanto valida.

## 2. Passo a passo no painel (os nomes podem variar um pouco)

1. developers.facebook.com > seu app > **Revisão do app > Permissões e recursos**
   (App Review > Permissions and features).
2. Procure cada permissão abaixo e clique em **Solicitar acesso avançado** (Request advanced access):
   - `instagram_business_basic`
   - `instagram_business_manage_comments`
   - `instagram_business_manage_messages`
3. Para cada uma, o formulário pede: como o app usa a permissão, um vídeo (screencast) e
   instruções de teste. Use os textos da seção 3.
4. Em **Dados do app**, confirme a política de privacidade e a exclusão de dados.
5. Envie. A resposta chega por notificação e e-mail. Se pedirem ajuste, responda no próprio
   formulário e reenvie (costuma levar 1 ou 2 rodadas).

## 3. Textos para colar (em inglês, o revisor lê em inglês)

### Descrição geral do app
Aflyo is a SaaS for affiliates and creators. The creator connects their own Instagram
professional account and configures an automation: when someone comments a chosen keyword on
one of the creator's posts, Aflyo replies publicly and sends one direct message with the
content the creator configured. Messages are sent only in response to the commenter's own
action. No bulk messaging, no messages to people who did not comment.

### instagram_business_basic
We use it to identify the connected professional account (username and id) and to list the
creator's recent posts so they can choose which post an automation applies to. Shown in the
video at "Connect Instagram" and "Choose the post".

### instagram_business_manage_comments
We use it to receive comment events on the creator's posts (webhook `comments`) and to post
the optional public reply under the comment. Shown in the video when a comment is posted and
the public reply appears.

### instagram_business_manage_messages
We use it to send a single private reply (direct message) to the person who commented the
keyword, using the comment id. Each comment generates at most one message. Shown in the video
when the DM arrives on the commenter's phone.

### Test instructions (campo "instruções para o revisor")
1. Open https://app.aflyo.com.br and sign in with the reviewer account (credentials below).
2. Go to Instagram in the sidebar and click "Conectar Instagram".
3. Authorize the three permissions on the Instagram screen. You return to Aflyo and the
   account appears as connected.
4. Click "Nova automação", choose a post, set the keyword "quero", write a message and save
   with "Ativar automação" on.
5. From another Instagram account, comment "quero" on that post. Each commenter receives the message once per automation ("Send only once per person" is on by default), so to repeat the test use a different commenting account or turn that option off in the automation.
6. Within seconds the public reply appears under the comment and the direct message is
   delivered (it may be in the Message Requests folder if the commenter does not follow the
   account).
7. To remove access: click "Desconectar" in Aflyo, or remove Aflyo in Instagram settings
   (Apps and websites). Data deletion instructions: https://app.aflyo.com.br/exclusao-de-dados

## 4. Roteiro do vídeo (3 a 5 minutos, tela cheia em 1080p, sem pressa)

Grave a tela do computador e, quando indicado, o celular. Legendas em inglês ajudam muito.

| Tempo | Cena | O que mostrar |
|---|---|---|
| 0:00 | Abertura | Barra de endereço com `app.aflyo.com.br` e o painel logado |
| 0:20 | Menu | Clicar em Instagram na lateral |
| 0:35 | Conectar | Clicar em Conectar Instagram; **a tela de autorização da Meta inteira**, com as 3 permissões |
| 1:00 | Retorno | Voltar ao Aflyo; conta conectada aparecendo |
| 1:20 | Automação | Nova automação: escolher o post (miniaturas), palavra-chave, mensagem e link; ativar |
| 2:20 | Comentário | Celular ou outra janela: comentar a palavra-chave no post |
| 2:50 | Resultado | Resposta pública sob o comentário **e** a DM chegando (mostrar a conversa) |
| 3:30 | Controle | Clicar em Desconectar; abrir a página de exclusão de dados |
| 4:00 | Fim | Mostrar a política de privacidade seção 10 (Instagram) |

Dicas: não corte a tela de autorização da Meta, mostre o nome do usuário que comentou e fale
(ou legende) cada permissão no momento em que ela é usada.

## 5. Credenciais para o revisor (NÃO versionar, preencher só no formulário da Meta)

- Conta Aflyo dedicada ao revisor, com plano Pro ativo (cortesia pelo SQL Editor, sem trial
  que expire durante a análise), e-mail e senha criados só para isso.
- Conta de Instagram profissional de teste adicionada em **Funções do app > Testadores do
  Instagram**, com o convite aceito, e **sem verificação em duas etapas** (o revisor precisa
  entrar).
- Uma segunda conta de Instagram para o revisor comentar, se o formulário pedir.
- Lembrete: cada pessoa recebe a DM **uma vez por automação** (opção ligada por padrão). Para o revisor repetir o teste, informe que ele deve usar outra conta para comentar, ou desmarcar "Enviar só uma vez por pessoa" na automação.

## 6. Motivos comuns de reprovação e como evitar

| Motivo | Como evitar |
|---|---|
| Vídeo não mostra a tela de autorização da Meta | gravar essa tela inteira, sem corte |
| Não dá para reproduzir o fluxo | conta de revisor funcionando e instruções passo a passo |
| URL de política/termos fora do ar ou sem seção do Instagram | conferir os links logo antes de enviar |
| Pede permissão que o vídeo não usa | já pedimos só as 3 que usamos |
| Mensagem parece spam | mostrar que só responde a quem comentou, uma vez por comentário |

## 7. Depois da aprovação

1. Confirmar em Revisão do app que as 3 permissões estão com **Acesso Avançado**.
2. Testar a conexão com uma conta **sem** papel no app.
3. Anunciar. A flag `VITE_FEATURE_INSTAGRAM` já está ligada em Production; se tiver sido
   desligada, religar e redeployar.
4. Remover o aviso de acesso antecipado do guia, se existir.
