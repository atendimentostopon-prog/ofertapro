# Design: E-mails com a marca Aflyo via Resend

Data: 2026-08-31
Branch de trabalho: branch dedicada `feat/emails-resend` a partir da `main`.
Independente do codigo do SEC-2; so o passo manual "Confirm email = ON" e
compartilhado (ver rollout).
Status: aprovado no brainstorming, aguardando review da spec

## Objetivo

Todos os e-mails que o SaaS Aflyo dispara passam a ter a identidade visual da
marca e a ser enviados pelo Resend. Cobre os e-mails de auth (Supabase) e um
conjunto de e-mails transacionais que hoje o app nao manda.

O usuario ja produziu os 8 templates HTML (aprovados). Este design trata da
infraestrutura de envio e dos disparadores, mais os ajustes finais nos templates.

## Fora de escopo

- E-mails de marketing / campanha / newsletter.
- Troca de e-mail (`email change`) e magic link: nao usados hoje. O hook trata
  com um fallback generico, sem template dedicado.
- Alterar qualquer comportamento ja correto de billing/webhook (cakto-webhook,
  trial gate, admin-api). Os sends entram como efeito colateral fire-and-forget.

## Contexto atual

- App em `app.aflyo.com.br`, projeto Supabase `zuqaccivowbzdfrpgekz`.
- Unicos e-mails hoje: confirmacao de cadastro (`Signup.tsx` -> `supabase.auth.signUp`,
  sem `emailRedirectTo`) e reset de senha (`ForgotPassword.tsx` ->
  `resetPasswordForEmail`, `redirectTo: ${getAppUrl()}/reset`). Enviados pelo SMTP
  default do Supabase, templates no dashboard. Sem SMTP custom, sem Resend.
- `cakto-webhook` (Deno, `index.ts` + `handlers.ts` + `lib.ts`) ja trata os eventos
  de billing: `purchase_approved`, `purchase_refused`, `subscription_created`,
  `subscription_renewed`, `subscription_renewal_refused`, `subscription_canceled`,
  `refund`, `chargeback`. `grantEntitlement()` roda em approved/created/renewed;
  `revokeEntitlement()` em refund/chargeback.
- Trial de 7 dias: `profiles.account_status` (`trialing`/`active`/`expired`/`canceled`),
  `profiles.trial_ends_at`. Cron `expire_trials` (`0 * * * *`) rebaixa trial vencido.
  `pg_cron` + `pg_net` disponiveis (usados em migrations anteriores).
- Marca: Graphite `#101418`, Cloud `#F6F7F9`, Slate `#6B7280`, Mint `#5EE7A5`
  (accent), Ice `#DFF8EE`. Space Grotesk (titulos) + Inter (corpo). Logos em
  `public/brand/` (servidos como estatico pelo Vercel, ex.:
  `https://app.aflyo.com.br/brand/logo-primary.png`).
- Regra de copy: sem travessao (em dash) em nenhum texto de produto.

## Decisoes tomadas no brainstorming

1. Escopo: auth + transacionais novos (boas-vindas, trial acabando, trial
   expirado, assinatura confirmada, falha de pagamento, cancelamento).
2. Auth via **Send Email Hook** do Supabase apontando pra uma Edge Function que
   renderiza o template e envia pela API do Resend (controle total, templates
   unificados com os transacionais).
3. Remetente: `Aflyo <ola@send.aflyo.com.br>`, `reply-to: suporte@aflyo.com.br`.
   Subdominio `send.aflyo.com.br` dedicado a envio.
4. Direcao visual: "cartao" (fundo Cloud, cartao branco 560px, logo centralizado,
   rodape fora do cartao). Ja refletida nos 8 templates do usuario.

## Os 8 templates

| # | arquivo | tipo | disparador | placeholders alem do padrao |
|---|---------|------|------------|-----------------------------|
| 1 | `confirmacao-conta.html` | auth | Send Email Hook (`signup`) | `CONFIRMATION_URL`, `EMAIL` |
| 2 | `boas-vindas.html` | transacional | trigger `auth.users.email_confirmed_at` null -> not null | `USER_NAME` |
| 3 | `recuperacao-senha.html` | auth | Send Email Hook (`recovery`) | `CONFIRMATION_URL`, `EMAIL` |
| 4 | `trial-acabando.html` | transacional | cron diario, thresholds 3 e 1 dias | `USER_NAME`, `DAYS_LEFT` |
| 5 | `trial-expirado.html` | transacional | cron diario, no dia da expiracao | `USER_NAME` |
| 6 | `assinatura-confirmada.html` | transacional | cakto-webhook `purchase_approved` / `subscription_created` (1a ativacao) | `USER_NAME`, `PLAN_NAME`, `AMOUNT`, `NEXT_BILLING_DATE` |
| 7 | `falha-pagamento.html` | transacional | cakto-webhook `subscription_renewal_refused` / `purchase_refused` | `USER_NAME`, `PLAN_NAME`, `AMOUNT` |
| 8 | `cancelamento.html` | transacional | cakto-webhook `subscription_canceled` | `USER_NAME`, `PLAN_NAME`, `ACCESS_UNTIL_DATE` |

### Ajustes finais nos templates (antes de versionar)

- **Encoding**: salvar todos em UTF-8 limpo (a copia que circulou veio com acento
  quebrado: `OlÃ¡`, `NÃ£o`, `Â·`).
- **Logo**: trocar os dois `<img src="data:image/png;base64,...">` de cada e-mail
  por URL hospedada: header `https://app.aflyo.com.br/brand/logo-primary.png`
  (130px), rodape `https://app.aflyo.com.br/brand/symbol-graphite.png` (20px).
  Manter `alt="Aflyo"` e `width`/`height`.
- **Placeholders**: padronizar tudo pro formato `{{CHAVE}}` (hoje os de auth usam
  a sintaxe Go do dashboard, `{{ .ConfirmationURL }}` / `{{ .Email }}`). Conjunto
  padrao aplicavel a qualquer template:
  `APP_URL`, `SUPPORT_URL`, `PREFERENCES_URL`, `UNSUBSCRIBE_URL`, `USER_NAME`,
  `USER_EMAIL`. Mais os especificos da tabela acima.
- **Boas-vindas**: a lista de passos vira exatamente:
  1. Conecte seu Telegram
  2. Cadastre os grupos que quer monitorar
  3. Defina o canal de disparo das ofertas
- **Rodape**: `{{APP_URL}} = https://app.aflyo.com.br`;
  `{{SUPPORT_URL}} = https://app.aflyo.com.br/suporte`;
  `{{PREFERENCES_URL}} = https://app.aflyo.com.br/configuracoes`.
  `{{UNSUBSCRIBE_URL}}` so e usado nos nao-essenciais (2 e 4); nos demais o link
  "Preferencias de email" aponta pra `{{PREFERENCES_URL}}`.
- **`AMOUNT`** (templates 6 e 7): recebe o **preco do plano** formatado em BRL
  (ex.: `R$ 47,90`), nao o valor cobrado pelo Cakto (que soma R$ 0,99 de taxa).
- Polish opcional, nao bloqueia o rollout: meta `color-scheme` + borda de 1px no
  botao Graphite pra sobreviver a clientes que forcam dark mode.

## Arquitetura

### Modulo compartilhado de e-mail

Local: `supabase/functions/_shared/emails/`

```
_shared/emails/
  templates/
    confirmacao-conta.html
    boas-vindas.html
    recuperacao-senha.html
    trial-acabando.html
    trial-expirado.html
    assinatura-confirmada.html
    falha-pagamento.html
    cancelamento.html
  subjects.ts       // mapa template -> assunto
  render.ts         // le o .html, substitui {{CHAVE}}, escapa valores dinamicos
  send.ts           // wrapper da API do Resend + gravacao em email_log
```

- `render(templateName, vars)`: le
  `Deno.readTextFile(new URL(\`./templates/${name}.html\`, import.meta.url))`,
  troca cada `{{CHAVE}}` pelo valor de `vars[CHAVE]`. Valores dinamicos passam por
  `escapeHtml()` (nome do usuario, plano etc.); URLs conhecidas nao. Chave sem
  valor -> string vazia. Cache em memoria do arquivo lido (o processo da function
  fica vivo entre invocacoes).
- `subjects.ts`: `{ 'boas-vindas': 'Bem-vindo(a) a Aflyo', ... }` (sem travessao).
- `send({ template, to, vars, dedupeKey, listUnsubscribe? })`:
  1. Se `dedupeKey` e ja existe row em `email_log` com esse `dedupe_key` e
     `status = 'sent'` -> retorna `{ skipped: true }` (idempotencia).
  2. `render()` + `subjects[template]`.
  3. `POST https://api.resend.com/emails` com
     `from: 'Aflyo <ola@send.aflyo.com.br>'`, `reply_to: 'suporte@aflyo.com.br'`,
     `to`, `subject`, `html`, e `headers: { 'List-Unsubscribe': ... }` quando
     `listUnsubscribe` for passado.
  4. Grava em `email_log` (`status 'sent'` + `resend_id`, ou `status 'error'` +
     `error`). Nunca lanca pra fora em caso de falha de rede do Resend, exceto no
     hook de auth (ver abaixo).

`RESEND_API_KEY` vira secret das Edge Functions do Supabase.

### Tabela `email_log` (migration nova)

```sql
create table public.email_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete set null,
  to_email     text not null,
  template     text not null,
  dedupe_key   text unique,               -- null = pode repetir
  resend_id    text,
  status       text not null default 'sent' check (status in ('sent','error')),
  error        text,
  created_at   timestamptz not null default now()
);
create index email_log_user_idx on public.email_log(user_id);
```

- RLS: ativa, **sem policy** pra `anon`/`authenticated` (so service_role le/escreve).
  E telemetria interna; nao vai pro front.
- `dedupe_key` unico: a corrida (cron roda 2x, webhook do Cakto re-tenta) resolve
  no banco. `send()` tenta o insert; violacao de unique -> trata como skip.
- Convencoes de `dedupe_key`:
  - `welcome:<user_id>`
  - `trial_ending_3:<user_id>` / `trial_ending_1:<user_id>`
  - `trial_expired:<user_id>` (por ciclo de trial; ver nota)
  - `sub_confirmed:<provider_subscription_id>`
  - `payment_failed:<provider_subscription_id>:<yyyy-mm-dd>`
  - `sub_canceled:<provider_subscription_id>`
  - Auth (confirmacao/reset): **sem** `dedupe_key` (o usuario pode legitimamente
    pedir de novo).

### Edge Function `email-hook` (auth)

Rota unica. Recebe o POST do Send Email Hook do Supabase.

- **Auth do hook**: valida o header `Webhook-Signature` com o secret do hook
  (`SEND_EMAIL_HOOK_SECRET`), comparacao constante em tempo (mesmo rigor do
  SEC-7: SHA-256 dos dois lados + XOR). Sem match -> 401.
- Payload: `{ user: { email, ... }, email_data: { token_hash, email_action_type,
  redirect_to, site_url, ... } }`.
- Monta a URL de verificacao apontando direto pro GoTrue (nao precisa de rota
  nova no front):
  `${SUPABASE_URL}/auth/v1/verify?token=${token_hash}&type=${email_action_type}&redirect_to=${redirect}`
  onde `redirect`:
  - `recovery` -> `email_data.redirect_to` (ja vem `${APP_URL}/reset`) ou fallback `${APP_URL}/reset`
  - `signup` -> `email_data.redirect_to` ou fallback `${APP_URL}/dashboard`
  - outro tipo -> fallback `${APP_URL}`
- Escolhe o template:
  - `signup` -> `confirmacao-conta`
  - `recovery` -> `recuperacao-senha`
  - outro -> `recuperacao-senha` como generico (raro; nao usamos hoje)
- `vars`: `{ CONFIRMATION_URL, USER_EMAIL: user.email, APP_URL, SUPPORT_URL, PREFERENCES_URL }`.
- Chama `send()` **sem** `dedupeKey`. Se o Resend falhar (`res.ok === false` ou
  throw): retorna **500** pro Supabase, que reencaminha o fluxo de erro pro
  cliente (o usuario pode reenviar). Isso e a unica situacao em que `send()`
  propaga erro.
- Resposta de sucesso: `200 { }`.

### Edge Function `send-email` (transacional)

Rota unica, protegida por `Authorization: Bearer <SERVICE_ROLE_KEY>` (mesmo
padrao do `cleanup-storage`). So chamada por: os triggers de banco (`pg_net`) e
o `cakto-webhook` (import direto do modulo, ver abaixo).

- Body: `{ template, to, vars, dedupe_key?, list_unsubscribe? }`.
- Valida `template` contra a lista conhecida. Chama `send()`. Responde
  `200 { skipped | sent, resend_id? }`. Erro do Resend -> grava `email_log`
  status `error` e responde `200 { error }` (nao 500; quem chama nao deve
  re-tentar infinitamente por causa de e-mail).

Observacao: o `cakto-webhook` pode tanto (a) fazer `fetch` nesta function quanto
(b) `import { send } from "../_shared/emails/send.ts"` e chamar direto. Preferir
(b): menos hop de rede, mesmo runtime. A function `send-email` existe pros
disparadores de banco que so tem `pg_net`.

### Disparadores de banco (migration nova)

1. **Boas-vindas** - trigger em `auth.users`:

```sql
create or replace function public.on_email_confirmed_send_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    perform net.http_post(
      url     := current_setting('app.send_email_url'),      -- .../functions/v1/send-email
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')),
      body    := jsonb_build_object(
        'template', 'boas-vindas',
        'to', new.email,
        'dedupe_key', 'welcome:' || new.id::text,
        'list_unsubscribe', true,
        'vars', jsonb_build_object(
          'USER_NAME', coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          'APP_URL', current_setting('app.public_url'),
          'SUPPORT_URL', current_setting('app.public_url') || '/suporte',
          'PREFERENCES_URL', current_setting('app.public_url') || '/configuracoes',
          'UNSUBSCRIBE_URL', current_setting('app.public_url') || '/configuracoes'))
    );
  end if;
  return new;
end $$;

create trigger trg_email_confirmed_welcome
  after update of email_confirmed_at on auth.users
  for each row execute function public.on_email_confirmed_send_welcome();
```

   - Config: a migration faz
     `alter database postgres set app.public_url = 'https://app.aflyo.com.br'`,
     `... set app.send_email_url = 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/send-email'`,
     `... set app.service_role_key = '<service_role_key>'`. As funcoes de trigger
     sao `security definer`, entao `current_setting()` resolve. (O
     `service_role_key` num setting so e legivel por superuser/definer; e o
     mesmo padrao dos Database Webhooks do proprio Supabase.)
   - `pg_net` e assincrono (nao segura o signup). Falha de entrega vira ruido em
     `net._http_response`, nao quebra auth.

2. **Trial acabando / expirado** - cron novo `trial_email_reminders`
   (`0 12 * * *`, uma vez ao dia, meio-dia UTC ~ 9h BRT):

```sql
select cron.schedule('trial_email_reminders', '0 12 * * *', $$
  -- 3 dias
  select net.http_post(...,'template','trial-acabando',
    'dedupe_key','trial_ending_3:'||id, 'vars', jsonb_build_object('DAYS_LEFT','3', ...))
  from public.profiles
  where account_status = 'trialing'
    and trial_ends_at::date - now()::date = 3;
  -- 1 dia   (mesma estrutura, dedupe_key trial_ending_1, DAYS_LEFT '1')
  -- expirado: trial_ends_at < now() AND account_status in ('expired','trialing')
  --   dedupe_key 'trial_expired:'||id
$$);
```

   - Roda antes do `expire_trials` do dia nao importa: o e-mail de expirado usa
     `trial_ends_at < now()`, independente do `account_status` ja ter virado
     `expired`.
   - `trial_expired:<user_id>` sem sufixo de ciclo: assume-se 1 trial por conta
     (comportamento atual). Se um dia existir re-trial, trocar por
     `trial_expired:<user_id>:<trial_started_at>`.
   - Precisa juntar `auth.users.email` (profiles nao tem email confiavel em todo
     lugar; `handlers.ts` usa `profiles.email` com ILIKE mas pode faltar). Usar
     `join auth.users u on u.id = p.id` e `u.email`.

3. **Billing** - dentro do `cakto-webhook/handlers.ts`, sem migration:
   - `purchaseApproved` e `subscriptionCreated`: apos `grantEntitlement`, um
     `void sendBillingEmail('assinatura-confirmada', userId, {
       PLAN_NAME, AMOUNT: precoPlanoBRL(plan), NEXT_BILLING_DATE }, 'sub_confirmed:'+subId)`.
     O `dedupe_key` por `subId` garante 1 e-mail mesmo os dois handlers rodando
     pro mesmo ciclo.
   - `subscriptionRenewalRefused` e `purchaseRefused`:
     `sendBillingEmail('falha-pagamento', userId, { PLAN_NAME, AMOUNT },
       'payment_failed:'+subId+':'+hoje)`.
   - `subscriptionCanceled`: `sendBillingEmail('cancelamento', userId,
     { PLAN_NAME, ACCESS_UNTIL_DATE: current_period_end }, 'sub_canceled:'+subId)`.
   - `refund`/`chargeback`: **sem e-mail** neste escopo (semantica diferente de
     cancelamento; decidir depois).
   - `sendBillingEmail` e um helper local que resolve o e-mail do usuario
     (`auth.users` via admin client), monta as `vars` de rodape e chama
     `send()` do modulo compartilhado, tudo em `try/catch` que so faz
     `console.error`. **Nunca** altera o status HTTP do webhook.
   - Precisa do e-mail e do `full_name` do usuario: `supabaseAdmin.auth.admin
     .getUserById(userId)` ou select em `auth.users`.
   - `precoPlanoBRL(plan)`: tabela estatica no handler (`starter`, `pro`,
     `business`) OU select em `plan_limits`/produto. Comeca com tabela estatica.

## Config e credenciais

Manuais (dashboard/DNS), fora do codigo:

1. **Resend**: criar conta/projeto, adicionar dominio `send.aflyo.com.br`,
   publicar os registros DNS gerados (SPF `TXT`, DKIM `CNAME` x3, DMARC `TXT`).
   Esperar verificacao. Gerar API key.
2. **Supabase secrets** (Edge Functions): `RESEND_API_KEY`, `SEND_EMAIL_HOOK_SECRET`.
3. **Supabase Auth**:
   - `Confirm email = ON` (Authentication -> Providers/Sign In). Ja e o passo
     manual do SEC-2; este design depende dele.
   - Habilitar o **Send Email Hook** apontando pra
     `https://<proj>.functions.supabase.co/email-hook`, com o secret acima.
4. **DNS `send.aflyo.com.br`**: alem dos registros do Resend, opcionalmente um
   `MX`/encaminhamento se quiser que `ola@` receba resposta; nao e necessario
   porque `reply-to` e `suporte@aflyo.com.br`.
5. **`app.public_url` / `app.send_email_url` / `app.service_role_key`**: setados na
   migration via `alter database postgres set ...`. O `service_role_key` entra
   como valor literal na migration (arquivo nao vai pro repo publico? confirmar;
   se for publico, aplicar esse `alter database` a mao no SQL Editor em vez de
   deixar a chave no arquivo versionado).

## Ordem de rollout

1. Verificar `send.aflyo.com.br` no Resend (lead time de DNS).
2. Setar secrets no Supabase.
3. Aplicar migration: `email_log` + trigger de boas-vindas + cron
   `trial_email_reminders` + settings do banco.
4. Ajustar e versionar os 8 templates (encoding, logo hospedado, placeholders,
   texto do boas-vindas).
5. Deploy das Edge Functions `email-hook` e `send-email`.
6. Ligar o Send Email Hook no dashboard + confirmar `Confirm email = ON`.
7. Deploy do `cakto-webhook` com os sends de billing.
8. QA ponta a ponta (ver abaixo).

Nota: rollout coordenado com o do SEC-2 (Confirm email). Se o Send Email Hook
nao estiver no ar quando `Confirm email` for ligado, o Supabase cai no template
default do dashboard (feio, mas funcional). Aceitavel como janela curta.

## QA (manual, staging ou conta de teste em prod)

- **Confirmacao de cadastro**: signup novo -> chega e-mail branded do Resend,
  botao confirma, cai em `/dashboard` logado.
- **Boas-vindas**: apos confirmar -> chega `boas-vindas` uma unica vez
  (checar `email_log` `welcome:<id>`). Segundo update em `email_confirmed_at`
  nao reenvia.
- **Reset de senha**: `ForgotPassword` -> e-mail branded -> link cai em `/reset`,
  troca de senha funciona.
- **Trial acabando**: setar `trial_ends_at` de uma conta de teste pra daqui 3
  dias, rodar o cron na mao (`select cron.run(...)` ou o corpo direto) -> 1
  e-mail; rodar de novo -> skip.
- **Trial expirado**: `trial_ends_at` no passado -> 1 e-mail.
- **Assinatura confirmada / falha / cancelamento**: reproduzir os eventos do
  Cakto (ou POST manual no webhook com secret valido e payload de cada evento)
  -> e-mail correspondente, `email_log` com o `dedupe_key` certo, webhook
  responde 200 mesmo se o Resend estiver com key invalida.
- **Idempotencia do webhook**: reenviar o mesmo evento -> nao duplica e-mail.
- **Anti-spam basico**: rodar um dos e-mails pelo mail-tester.com, conferir
  SPF/DKIM/DMARC `pass` e score.

## Riscos e mitigacoes

- **`Deno.readTextFile` de arquivo relativo na Edge Function**: se o bundler do
  Supabase nao empacotar os `.html`, o fallback e converter os templates pra
  `.ts` exportando string. Validar no primeiro deploy.
- **`pg_net` desabilitado ou sem `net.http_post`**: as migrations anteriores
  citam `pg_net`, mas confirmar `create extension if not exists pg_net`. Sem ele,
  o trigger de boas-vindas e o cron nao disparam (o resto funciona).
- **Send Email Hook indisponivel no plano do projeto**: se o hook nao existir,
  cair pro plano B (Resend como SMTP + os 2 templates de auth colados no
  dashboard, que ja usam a sintaxe Go). Decisao so se o hook falhar no setup.
- **E-mail do usuario ausente/errado em `auth.users`**: `sendBillingEmail`
  aborta com `console.error` se nao achar e-mail; nao quebra o webhook.
- **Volume/custo Resend**: plano free do Resend cobre o volume atual (trial +
  billing esporadicos). Monitorar.

## Arquivos afetados (previsao)

Novos:
- `supabase/functions/_shared/emails/` (templates + `render.ts` + `send.ts` + `subjects.ts`)
- `supabase/functions/email-hook/index.ts`
- `supabase/functions/send-email/index.ts`
- `supabase/migrations/20260901120000_email_log_and_triggers.sql`
  (`20260901000000` ja esta em uso pelo admin SP2)

Alterados:
- `supabase/functions/cakto-webhook/handlers.ts` (sends de billing + helper)
- Docs de rollout / README de e-mail (opcional)

Sem mudanca de front prevista: `Signup.tsx` ja mostra a mensagem de "confirme seu
e-mail"; `ForgotPassword.tsx` ja passa `redirectTo`. A guarda de e-mail
verificado pra publicar oferta / ligar vitrine ja vem do SEC-2.
