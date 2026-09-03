# Rollout: e-mails branded via Resend

Ordem obrigatoria. Cada passo tem um jeito de verificar antes de seguir.

## 0. Se o Send Email Hook nao existir no projeto

Configurar Resend como SMTP em Authentication (: SMTP (host `smtp.resend.com`, port 465, user `resend`, pass = `RESEND_API_KEY`). Colar `confirmacao-conta.html` e `recuperacao-senha.html` em Authentication (: Email Templates, trocando `{{CONFIRMATION_URL}}` -> `{{ .ConfirmationURL }}` e `{{USER_EMAIL}}` -> `{{ .Email }}`. Pular os passos 4(5 para o `email-hook` (mas manter `send-email` para os transacionais).

## 1. Resend + DNS
- Criar conta/projeto no Resend.
- Adicionar o dominio `send.aflyo.com.br`. Publicar no DNS os registros gerados:
  SPF (`TXT`), DKIM (3x `CNAME`), DMARC (`TXT`).
- Esperar o Resend marcar o dominio como **Verified**.
- Gerar uma API key (escopo Sending). Guardar.
- Verificar: enviar um teste pelo painel do Resend para um Gmail e conferir
  cabecalhos `spf=pass dkim=pass dmarc=pass`.

## 2. Secrets no Supabase (Edge Functions)
```
supabase secrets set RESEND_API_KEY=re_xxx
supabase secrets set SEND_EMAIL_HOOK_SECRET=whsec_xxx   # gerar no passo 5
supabase secrets set APP_PUBLIC_URL=https://app.aflyo.com.br
```
Verificar: `supabase secrets list`.

## 3. Migration
- Revisar `supabase/migrations/20260901120000_email_log_and_triggers.sql`.
- Aplicar (SQL Editor ou `supabase db push`).
- **A mao** no SQL Editor (segredo, nao versionar):
  `alter database postgres set app.service_role_key = '<SERVICE_ROLE_KEY>';`
- Rodar `supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql`.
- Verificar: `select jobname from cron.job where jobname='trial_email_reminders';`
  retorna 1 linha; `select current_setting('app.service_role_key', true) is not null;`
  retorna `t`.

## 4. Deploy das Edge Functions
```
supabase functions deploy send-email
supabase functions deploy email-hook --no-verify-jwt
supabase functions deploy cakto-webhook
```
Nota: `--no-verify-jwt` porque o Send Email Hook do Supabase nao manda JWT; a autenticidade e checada pela assinatura Standard Webhooks (`SEND_EMAIL_HOOK_SECRET`) dentro da funcao.

Verificar `send-email` (deve dar 401 sem bearer):
```
curl -si https://<proj>.functions.supabase.co/send-email -d '{}' | head -1
```

## 5. Send Email Hook (dashboard)
- Authentication (: Hooks (: **Send Email Hook** (: Enable.
- Endpoint: `https://<proj>.functions.supabase.co/email-hook`.
- Secret: gerar; usar o mesmo valor de `SEND_EMAIL_HOOK_SECRET` (passo 2).
- Salvar.

## 6. Confirm email ON (coordena com o SEC-2)
- Authentication (: Sign In / Providers (: **Confirm email = ON**.
- A partir daqui, todo signup dispara o `email-hook`.

## 7. QA ponta a ponta (conta de teste)
- [ ] Signup novo (: chega `confirmacao-conta` do Resend; botao confirma; cai logado. **Se este e-mail NAO chegar, a verificacao de assinatura HMAC do `email-hook` esta errada** (nao ha teste de vetor conhecido para ela) (: checar `SEND_EMAIL_HOOK_SECRET` igual nos dois lados e os logs da funcao.
- [ ] Apos confirmar (: chega `boas-vindas` 1x (`select * from email_log where dedupe_key like 'welcome:%'`).
- [ ] `ForgotPassword` (: chega `recuperacao-senha`; link cai em `/reset`; troca de senha ok.
- [ ] Trial: `update profiles set trial_ends_at = now() + interval '3 days' where id = '<id>'`;
      rodar o corpo do cron `trial_email_reminders` na mao (: 1 e-mail `trial-acabando`;
      rodar de novo (: sem 2o e-mail.
- [ ] Trial expirado: `trial_ends_at = now() - interval '1 hour'` (: `trial-expirado` 1x.
- [ ] Billing: POST manual no `cakto-webhook` (secret valido) com payloads de
      `purchase_approved`, `subscription_renewal_refused`, `subscription_canceled`
      (: e-mails 6/7/8; webhook responde 200 mesmo com `RESEND_API_KEY` invalida;
      reenviar o mesmo evento (: nao duplica (`email_log`).
- [ ] mail-tester.com em 1 e-mail transacional (: score >= 8, SPF/DKIM/DMARC pass.

## Rollback
- Desligar o Send Email Hook (: Supabase volta ao template default do dashboard.
- `select cron.unschedule('trial_email_reminders');` para o cron.
- `drop trigger trg_email_confirmed_welcome on auth.users;` para boas-vindas.
- As Edge Functions podem ficar no ar (inertes sem o hook / sem o cron).
