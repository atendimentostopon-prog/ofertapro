# Painel Admin Aflyo, Operacao (SP1)

Procedimentos do dia a dia com o que existe no SP1. Runbooks de investigacao de
usuario, promocao, link, envio e webhook entram a partir do SP2/SP4 (marcados no
fim).

## Convidar um administrador

1. A pessoa precisa **ja ter uma conta no Aflyo** (`https://aflyo.com.br`). O
   convite nao cria conta.
2. No painel, `/admins` -> "Convidar admin" (visivel so para quem tem
   `admins.manage`).
3. Informar o e-mail exato da conta Aflyo e marcar os cargos. Para um
   desenvolvedor, marcar **DEVELOPER**.
4. Enviar. Se aparecer "Essa pessoa precisa criar uma conta no Aflyo primeiro",
   a conta nao existe ainda: peca para a pessoa se cadastrar no app do cliente e
   repita.
5. Se aparecer "Ja e administrador", a conta ja esta em `admin_accounts`. Ajuste
   os cargos em `/roles`.
6. A pessoa acessa `https://admin.aflyo.com.br`, loga e faz o enroll de MFA na
   primeira entrada.

## Atribuir ou revogar cargo

`/roles`, secao "Atribuir cargo" (so com `roles.manage`):

- Selecionar o administrador e o cargo, "Atribuir cargo".
- Cada cargo ja atribuido aparece como chip com um "revogar" ao lado.

Regras que o servidor impoe (a mensagem de erro explica):

- Nao da para revogar o cargo SUPER_ADMIN do **ultimo** SUPER_ADMIN ativo.
- Somente um SUPER_ADMIN pode **conceder** o cargo SUPER_ADMIN.

## Suspender ou reativar um admin

`/admins` (acoes so com `admins.manage`):

- **Suspender:** botao na linha -> modal com campo "Motivo" **obrigatorio** ->
  confirmar. A conta perde o acesso ao painel na hora. Grava no Audit Log.
- **Reativar:** botao na linha de uma conta suspensa.

Regras do servidor:

- Voce nao pode suspender a si mesmo.
- Nao da para suspender o ultimo SUPER_ADMIN ativo.

## Ler o Audit Log

`/audit` (`audit.read`):

- Lista paginada (25 por pagina), mais recente primeiro. A pagina fica na URL
  (`?page=`).
- Colunas: data, admin (e-mail), acao, entidade, motivo.
- Coluna "Detalhes" -> "ver" expande o `before` / `after` da mudanca em JSON.
- O log e **imutavel**. Nao existe editar nem apagar pela interface nem por RPC.

Acoes registradas no SP1: `ADMIN_INVITED`, `ADMIN_SUSPENDED`,
`ADMIN_REACTIVATED`, `ROLE_ASSIGNED`, `ROLE_REVOKED`.

## Interpretar o Dashboard

`/` , filtro de periodo hoje / 7 dias / 30 dias / 90 dias.

- Metrica com numero: veio de uma consulta real (usuarios, assinaturas,
  promocoes, links, cliques, envios, webhooks recebidos, taxa de sucesso de
  envio).
- Metrica com **"Dados indisponiveis"**: nao existe fonte confiavel no SP1. Elas
  voltam com numero quando a infraestrutura correspondente existir:
  - `jobs_failed`, `jobs_pending`, `queue_depth`: quando houver fila/worker (SP4).
  - `errors_24h`, `services_degraded`: quando houver observabilidade (SP5).
  - `webhooks_failed`: quando o registro de webhook guardar status de falha (SP4).
- "Atividade recente": ultimos eventos (cadastros, promocoes, envios, webhooks,
  acoes de admin) no periodo.

## Runbooks (a partir do SP2/SP4)

Estes procedimentos dependem de telas que ainda nao existem:

- Investigar um usuario (sessoes, notas, tags, suspensao, impersonation): **SP2**.
- Reprocessar / cancelar promocao, testar / desabilitar link, reenviar envio:
  **SP3**.
- Reconciliacao e observabilidade da Cakto: **SP4**.
- Reprocessar webhook, inspecionar jobs e filas, ler logs e erros: **SP4/SP5**.

Ate la, essas operacoes seguem pelo caminho atual (SQL direto no Supabase com
`service_role`, com cuidado, e sempre registrando o que foi feito).
