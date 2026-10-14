# Pacote do App Review

## Pré-requisitos
- Verificação de negócio concluída.
- Política de privacidade, termos e página de exclusão no ar (Task 3).
- Callbacks de desautorização e exclusão respondendo 200.
- Ícone do app (1024x1024) e categoria.

## Por permissão
| Permissão | Por que precisamos | Onde aparece no vídeo |
|---|---|---|
| `instagram_business_basic` | identificar a conta conectada e listar posts para o seletor | Conectar e escolher post |
| `instagram_business_manage_comments` | receber comentários e responder publicamente | Comentário chegando e resposta pública |
| `instagram_business_manage_messages` | enviar a DM em resposta ao comentário | DM chegando no celular de teste |

## Roteiro do vídeo (3 a 5 min, tela + celular)
1. Login no Aflyo e acesso a /instagram.
2. Conectar o Instagram (tela de autorização da Meta visível). Depois do consentimento no
   Instagram, o navegador volta para /instagram e a conexão é concluída ali (a conta aparece
   como conectada).
3. Criar automação: post, palavra-chave, mensagem e link.
4. Em outro aparelho/conta: comentar a palavra-chave no post.
5. Mostrar a resposta pública e a DM recebida.
6. Mostrar "Desconectar" e a página de exclusão de dados.

## Texto de uso (colar no formulário)
"O Aflyo permite que afiliados e criadores respondam automaticamente, por mensagem direta,
a pessoas que comentam uma palavra-chave escolhida em uma publicação do próprio criador. A
mensagem é enviada uma única vez por comentário, apenas em resposta a essa ação explícita
do usuário, e contém o conteúdo configurado pelo criador. Não enviamos mensagens em massa
nem a quem não interagiu."

## Credenciais de teste para os revisores
Conta Aflyo com plano ativo e conta de Instagram de teste com convite aceito. (Não versionar.)
