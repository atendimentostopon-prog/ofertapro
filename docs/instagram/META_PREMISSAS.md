# Premissas da Meta (M1 a M10)

Preencher a coluna "Resultado" e a data na validação (Task 25). Se uma premissa cair, atualizar
o spec e o código afetado antes de seguir.

| # | Premissa | Onde o código depende | Resultado | Data |
|---|---|---|---|---|
| M1 | Instagram Login conecta conta profissional sem Página do Facebook | `ig-oauth-start`, `ig-oauth-callback` | pendente | |
| M2 | Webhook assinado com `X-Hub-Signature-256` (HMAC SHA-256, App Secret) | `signature.ts`, `ig-webhook` | pendente | |
| M3 | Private reply: 1 DM por comentário, dentro de uma janela de dias | `process.ts` (retentativas) | pendente | |
| M4 | Janela de 24h após resposta do usuário | F2 | pendente | |
| M5 | Perfil do contato expõe se segue a conta | F2 | pendente | |
| M6 | Botões/quick replies em DM | F2 | pendente | |
| M7 | Resposta pública a comentário via `/{comment-id}/replies` | `graph.ts` | pendente | |
| M8 | Token longo (~60 dias) renovável | `ig-token-refresh` | pendente | |
| M9 | Limites de taxa por conta/app | calibragem de F2 | pendente | |
| M10 | Callbacks de exclusão e desautorização com `signed_request` | `signature.ts`, `ig-deauthorize`, `ig-data-deletion` | pendente | |

## Payload real capturado
Colar aqui (sem dados pessoais) o JSON do webhook de comentário e atualizar
`supabase/functions/_shared/instagram/__fixtures__/comment_webhook.json`.

## Códigos de erro observados
| HTTP | code | subcode | situação | classe no código |
|---|---|---|---|---|
