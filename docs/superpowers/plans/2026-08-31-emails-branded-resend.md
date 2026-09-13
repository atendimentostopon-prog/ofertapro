# E-mails com a marca Aflyo via Resend — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todos os e-mails do SaaS Aflyo (auth + transacionais) passam a ter a identidade da marca e a ser enviados pelo Resend, com log e idempotência.

**Architecture:** Um módulo compartilhado `supabase/functions/_shared/emails/` (8 templates HTML + renderizador + wrapper do Resend). Uma Edge Function `email-hook` recebe o Send Email Hook do Supabase e envia os e-mails de auth. Uma Edge Function `send-email` (protegida por service_role) é chamada pelos gatilhos de banco (`pg_net`) para os transacionais. O `cakto-webhook` importa o módulo direto e dispara os e-mails de billing como efeito colateral fire-and-forget. Uma migration cria `email_log` (dedupe por chave única), o trigger de boas-vindas e o cron de lembretes de trial.

**Tech Stack:** Deno (Supabase Edge Functions), `@supabase/supabase-js@2`, API HTTP do Resend, `deno test` (`https://deno.land/std@0.224.0/assert/mod.ts`), Postgres + `pg_cron` + `pg_net`.

## Global Constraints

- Copy de produto **sem travessão** (em dash `—`). Usar `·`/`&middot;`, dois-pontos, parênteses ou ponto.
- Idioma: pt-BR em toda copy. Não traduzir nomes técnicos.
- Remetente fixo: `Aflyo <ola@send.aflyo.com.br>`; `reply_to: suporte@aflyo.com.br`.
- URL pública do app: `https://app.aflyo.com.br`. Landing: `https://aflyo.com.br`.
- Logos hospedados: header `https://app.aflyo.com.br/brand/logo-primary.png` (width 130), rodapé `https://app.aflyo.com.br/brand/symbol-graphite.png` (width 20). Nunca `data:` base64 em e-mail.
- Paleta: Graphite `#101418`, Cloud `#F6F7F9`, Slate `#6B7280`, Mint `#5EE7A5`, Ice `#DFF8EE`. Botão primário = fundo Graphite, texto branco.
- Placeholders de template no formato `{{CHAVE}}` (regex `\{\{(\w+)\}\}`). Chaves válidas: `APP_URL`, `SUPPORT_URL`, `PREFERENCES_URL`, `UNSUBSCRIBE_URL`, `USER_NAME`, `USER_EMAIL`, `CONFIRMATION_URL`, `PLAN_NAME`, `AMOUNT`, `NEXT_BILLING_DATE`, `ACCESS_UNTIL_DATE`, `DAYS_LEFT`.
- Deno tests colocados como `*_test.ts`, rodados com `deno test --allow-env --allow-read <path>`. Sem rede nos testes (usar DI com funções fake).
- Migrations: numeração `YYYYMMDDHHMMSS_`, idempotentes quando possível, comentário explicando o achado. `20260901000000` já está em uso (admin SP2); usar `20260901120000`.
- Projeto Supabase de produção: `zuqaccivowbzdfrpgekz`. **Não** aplicar migration/secret contra produção sem revisão humana; entregar arquivos.
- Segredo nunca vai pro repo: o `app.service_role_key` do `alter database` é aplicado à mão no SQL Editor, não no arquivo versionado.

---

## File Structure

Novos:
- `supabase/functions/_shared/emails/render.ts` — `escapeHtml`, `renderTemplate`, tipos.
- `supabase/functions/_shared/emails/subjects.ts` — `TEMPLATE_NAMES`, `TemplateName`, `SUBJECTS`, `PLACEHOLDER_KEYS`.
- `supabase/functions/_shared/emails/send.ts` — `sendEmail(deps, opts)` + tipos de DI.
- `supabase/functions/_shared/emails/deps.ts` — construtores das deps reais (`buildSendDeps`).
- `supabase/functions/_shared/emails/templates/*.html` — os 8 templates.
- `supabase/functions/_shared/emails/render_test.ts` — testes do renderizador + validação estrutural dos 8 templates.
- `supabase/functions/_shared/emails/send_test.ts` — testes do `sendEmail`.
- `supabase/functions/send-email/index.ts` + `deno.json` + `send_email_test.ts`.
- `supabase/functions/email-hook/index.ts` + `deno.json` + `hook_test.ts`.
- `supabase/functions/cakto-webhook/emails.ts` — `sendBillingEmail`.
- `supabase/functions/cakto-webhook/plan-prices.ts` — mapa plano → rótulo/preço.
- `supabase/functions/cakto-webhook/emails_test.ts`.
- `supabase/migrations/20260901120000_email_log_and_triggers.sql`.
- `supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql`.
- `docs/EMAILS_RESEND_ROLLOUT.md`.

Modificados:
- `supabase/functions/cakto-webhook/handlers.ts` — chamadas a `sendBillingEmail` em 5 handlers.

---

## Task 1: Renderizador e contrato de templates

**Files:**
- Create: `supabase/functions/_shared/emails/subjects.ts`
- Create: `supabase/functions/_shared/emails/render.ts`
- Test: `supabase/functions/_shared/emails/render_test.ts`

**Interfaces:**
- Produces:
  - `subjects.ts`: `TEMPLATE_NAMES: readonly string[]`, `type TemplateName`, `SUBJECTS: Record<TemplateName,string>`, `PLACEHOLDER_KEYS: readonly string[]`.
  - `render.ts`: `escapeHtml(s: string): string`, `renderTemplate(name: TemplateName, vars: Record<string,string>, opts?: { dir?: URL }): Promise<string>`.

- [ ] **Step 1: Criar `subjects.ts`**

```ts
// supabase/functions/_shared/emails/subjects.ts
export const TEMPLATE_NAMES = [
  "confirmacao-conta",
  "boas-vindas",
  "recuperacao-senha",
  "trial-acabando",
  "trial-expirado",
  "assinatura-confirmada",
  "falha-pagamento",
  "cancelamento",
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export const SUBJECTS: Record<TemplateName, string> = {
  "confirmacao-conta": "Confirme seu email para ativar sua conta",
  "boas-vindas": "Bem-vindo(a) à Aflyo",
  "recuperacao-senha": "Redefinir sua senha",
  "trial-acabando": "Seu teste grátis está acabando",
  "trial-expirado": "Sua conta Aflyo foi pausada",
  "assinatura-confirmada": "Assinatura confirmada",
  "falha-pagamento": "Não conseguimos processar seu pagamento",
  "cancelamento": "Sua assinatura foi cancelada",
};

export const PLACEHOLDER_KEYS = [
  "APP_URL", "SUPPORT_URL", "PREFERENCES_URL", "UNSUBSCRIBE_URL",
  "USER_NAME", "USER_EMAIL", "CONFIRMATION_URL",
  "PLAN_NAME", "AMOUNT", "NEXT_BILLING_DATE", "ACCESS_UNTIL_DATE", "DAYS_LEFT",
] as const;

export function isTemplateName(v: unknown): v is TemplateName {
  return typeof v === "string" && (TEMPLATE_NAMES as readonly string[]).includes(v);
}
```

- [ ] **Step 2: Escrever o teste que falha (`render_test.ts`)**

```ts
// supabase/functions/_shared/emails/render_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, renderTemplate } from "./render.ts";

const FIXTURE_DIR = new URL("./__fixtures__/", import.meta.url);

Deno.test("escapeHtml escapa & < > \"", () => {
  assertEquals(escapeHtml(`a & b < c > d "e"`), `a &amp; b &lt; c &gt; d &quot;e&quot;`);
});

Deno.test("renderTemplate troca {{CHAVE}} e escapa o valor", async () => {
  const html = await renderTemplate("boas-vindas", { USER_NAME: `<b>x</b> & y` }, { dir: FIXTURE_DIR });
  assertStringIncludes(html, "&lt;b&gt;x&lt;/b&gt; &amp; y");
});

Deno.test("renderTemplate: chave sem valor vira string vazia", async () => {
  const html = await renderTemplate("boas-vindas", {}, { dir: FIXTURE_DIR });
  assertEquals(html.includes("{{USER_NAME}}"), false);
  assertStringIncludes(html, "Olá , tudo bem");
});
```

- [ ] **Step 3: Criar o fixture usado pelos testes**

Criar `supabase/functions/_shared/emails/__fixtures__/boas-vindas.html`:

```html
<p>Olá {{USER_NAME}}, tudo bem</p>
```

- [ ] **Step 4: Rodar o teste e ver falhar**

Run: `deno test --allow-read supabase/functions/_shared/emails/render_test.ts`
Expected: FAIL com "Module not found ./render.ts".

- [ ] **Step 5: Implementar `render.ts`**

```ts
// supabase/functions/_shared/emails/render.ts
import type { TemplateName } from "./subjects.ts";

export function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const cache = new Map<string, string>();

export async function renderTemplate(
  name: TemplateName,
  vars: Record<string, string>,
  opts: { dir?: URL } = {},
): Promise<string> {
  const dir = opts.dir ?? new URL("./templates/", import.meta.url);
  const url = new URL(`${name}.html`, dir);
  let raw = cache.get(url.href);
  if (raw === undefined) {
    raw = await Deno.readTextFile(url);
    cache.set(url.href, raw);
  }
  return raw.replace(/\{\{(\w+)\}\}/g, (_m, key: string) =>
    key in vars ? escapeHtml(String(vars[key])) : "",
  );
}
```

- [ ] **Step 6: Rodar o teste e ver passar**

Run: `deno test --allow-read supabase/functions/_shared/emails/render_test.ts`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/emails/subjects.ts supabase/functions/_shared/emails/render.ts supabase/functions/_shared/emails/render_test.ts supabase/functions/_shared/emails/__fixtures__/boas-vindas.html
git commit -m "feat(emails): renderizador de template e contrato de placeholders"
```

---

## Task 2: Os 8 templates com a marca Aflyo

**Files:**
- Create: `supabase/functions/_shared/emails/templates/confirmacao-conta.html`
- Create: `supabase/functions/_shared/emails/templates/boas-vindas.html`
- Create: `supabase/functions/_shared/emails/templates/recuperacao-senha.html`
- Create: `supabase/functions/_shared/emails/templates/trial-acabando.html`
- Create: `supabase/functions/_shared/emails/templates/trial-expirado.html`
- Create: `supabase/functions/_shared/emails/templates/assinatura-confirmada.html`
- Create: `supabase/functions/_shared/emails/templates/falha-pagamento.html`
- Create: `supabase/functions/_shared/emails/templates/cancelamento.html`
- Modify: `supabase/functions/_shared/emails/render_test.ts` (adiciona validação estrutural)

**Interfaces:**
- Consumes: `TEMPLATE_NAMES`, `PLACEHOLDER_KEYS` (Task 1).
- Produces: os 8 arquivos `.html` finais consumidos por `renderTemplate`.

**Contexto:** os 8 templates derivam de drafts aprovados pelo usuário. Cada arquivo é montado como `WRAPPER_TOP` + `BODY` (por arquivo) + `WRAPPER_BOTTOM`. Escrever o arquivo **completo e em UTF-8** (sem mojibake).

**WRAPPER_TOP** (idêntico nos 8):

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<title>Aflyo</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr>
<td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td>
</tr>
```

**WRAPPER_BOTTOM** (idêntico nos 8):

```html
<tr>
<td style="padding:28px 40px 36px 40px;background-color:#F6F7F9;border-top:1px solid #ECEDF2;" align="center">
<img src="https://app.aflyo.com.br/brand/symbol-graphite.png" width="20" alt="" style="display:block;margin:0 auto 12px auto;border:0;">
<p style="margin:0 0 8px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Enviado para <strong style="color:#101418;">{{USER_EMAIL}}</strong>. Você tem uma conta na Aflyo.
</p>
<p style="margin:0 0 14px 0;font-size:12px;font-family:'Inter',sans-serif;color:#6B7280;">
Aflyo, ofertas no automático &middot; <a href="https://aflyo.com.br" style="color:#101418;text-decoration:none;font-weight:600;">aflyo.com.br</a>
</p>
<p style="margin:0;font-size:12px;font-family:'Inter',sans-serif;">
<a href="{{SUPPORT_URL}}" style="color:#6B7280;text-decoration:underline;">Suporte</a>
&nbsp;&middot;&nbsp;
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;text-decoration:underline;">Preferências de email</a>
</p>
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>
```

**Padrão do bloco do botão** (usado nos BODYs; `border:1px solid #101418` é o polish de dark mode):

```html
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="HREF" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">LABEL</a>
</td></tr>
</table>
```

- [ ] **Step 1: `confirmacao-conta.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">TRIAL DE 7 DIAS</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Confirme seu email para ativar sua conta</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá! Falta só um passo para você começar a monitorar e disparar ofertas automaticamente com a Aflyo.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Clique no botão abaixo para confirmar <strong style="color:#101418;">{{USER_EMAIL}}</strong> e ativar seu trial gratuito:</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{CONFIRMATION_URL}}" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Confirmar meu email</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Se o botão não funcionar, copie e cole este link no navegador:<br><a href="{{CONFIRMATION_URL}}" style="color:#101418;word-break:break-all;">{{CONFIRMATION_URL}}</a></p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Não foi você quem criou essa conta? Ignore este email com segurança.</p>
</div>
</td></tr>
```

- [ ] **Step 2: `boas-vindas.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM (lista de passos já com o texto final pedido pelo usuário)

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Bem-vindo(a) à Aflyo, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Sua conta está ativa e seu <strong style="color:#101418;">trial gratuito de 7 dias</strong> já começou. Agora é só configurar seus canais e deixar a Aflyo automatizar suas ofertas.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Primeiros passos recomendados:</p>
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 4px 0;">
<tr><td style="padding:12px 16px;background-color:#F6F7F9;border-radius:12px;">
<span style="font-family:'Inter',sans-serif;font-size:14px;color:#101418;font-weight:600;">1&nbsp;&nbsp;Conecte seu Telegram</span>
</td></tr>
<tr><td style="height:8px;line-height:8px;">&nbsp;</td></tr>
<tr><td style="padding:12px 16px;background-color:#F6F7F9;border-radius:12px;">
<span style="font-family:'Inter',sans-serif;font-size:14px;color:#101418;font-weight:600;">2&nbsp;&nbsp;Cadastre os grupos que quer monitorar</span>
</td></tr>
<tr><td style="height:8px;line-height:8px;">&nbsp;</td></tr>
<tr><td style="padding:12px 16px;background-color:#F6F7F9;border-radius:12px;">
<span style="font-family:'Inter',sans-serif;font-size:14px;color:#101418;font-weight:600;">3&nbsp;&nbsp;Defina o canal de disparo das ofertas</span>
</td></tr>
</table>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/dashboard" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Acessar meu painel</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Qualquer dúvida, é só responder este email, a gente te ajuda a configurar tudo.</p>
</div>
</td></tr>
```

- [ ] **Step 3: `recuperacao-senha.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Redefinir sua senha</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Recebemos uma solicitação para redefinir a senha da conta <strong style="color:#101418;">{{USER_EMAIL}}</strong>.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{CONFIRMATION_URL}}" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Redefinir minha senha</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Se o botão não funcionar, copie e cole este link:<br><a href="{{CONFIRMATION_URL}}" style="color:#101418;word-break:break-all;">{{CONFIRMATION_URL}}</a></p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Não foi você quem solicitou? Ignore este email. Sua senha atual continua válida.</p>
</div>
</td></tr>
```

- [ ] **Step 4: `trial-acabando.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">FALTAM {{DAYS_LEFT}} DIAS DE TRIAL</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Seu trial está acabando, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Seu período gratuito da Aflyo termina em <strong style="color:#101418;">{{DAYS_LEFT}} dias</strong>. Depois disso, sua conta fica pausada até você assinar um plano. Nenhum dado é perdido.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Assine agora e garanta que o disparo das suas ofertas não pare.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/planos" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Ver planos e assinar</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Dúvidas sobre qual plano escolher? Responda este email que a gente te ajuda.</p>
</div>
</td></tr>
```

- [ ] **Step 5: `trial-expirado.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Seu trial expirou, conta pausada</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá, {{USER_NAME}}. Seu período gratuito de 7 dias chegou ao fim e sua conta foi pausada. O monitoramento e o disparo automático de ofertas está parado até a reativação.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">A boa notícia: suas configurações, lojas monitoradas e canais continuam salvos. É só assinar um plano para voltar de onde parou.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/planos" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Reativar minha conta</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Precisa de mais tempo ou tem alguma dúvida antes de assinar? É só responder este email.</p>
</div>
</td></tr>
```

- [ ] **Step 6: `assinatura-confirmada.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">PAGAMENTO APROVADO</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Assinatura confirmada, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Seu pagamento foi aprovado e sua conta Aflyo está com acesso total liberado.</p>
</div>
<div style="text-align:left;width:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;border-radius:14px;margin:4px 0 20px 0;">
<tr><td style="padding:18px 22px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="padding-top:0;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Plano</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#101418;">{{PLAN_NAME}}</span>
</td></tr>
<tr><td style="padding-top:16px;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Valor</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#101418;">{{AMOUNT}} / mês</span>
</td></tr>
<tr><td style="padding-top:16px;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Próxima cobrança</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:16px;color:#101418;">{{NEXT_BILLING_DATE}}</span>
</td></tr>
</table>
</td></tr>
</table>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/dashboard" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Ir para meu painel</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Você pode gerenciar ou cancelar sua assinatura a qualquer momento em Configurações e Faturamento.</p>
</div>
</td></tr>
```

- [ ] **Step 7: `falha-pagamento.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM (badge vermelho)

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#FDECEC;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#E5484D;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#B3261E;letter-spacing:0.2px;">PAGAMENTO NÃO APROVADO</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Não conseguimos processar seu pagamento</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá, {{USER_NAME}}. A cobrança do plano <strong style="color:#101418;">{{PLAN_NAME}}</strong> ({{AMOUNT}}) não foi aprovada. Pode ser saldo insuficiente, cartão vencido ou recusa do banco.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Atualize sua forma de pagamento para evitar a interrupção do serviço.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/faturamento" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Atualizar forma de pagamento</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Vamos tentar cobrar novamente em breve. Se o problema persistir, sua conta pode ser pausada.</p>
</div>
</td></tr>
```

- [ ] **Step 8: `cancelamento.html`** — WRAPPER_TOP + BODY abaixo + WRAPPER_BOTTOM

```html
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Sua assinatura foi cancelada</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Olá, {{USER_NAME}}. Confirmamos o cancelamento do plano <strong style="color:#101418;">{{PLAN_NAME}}</strong>. Você continua com acesso até <strong style="color:#101418;">{{ACCESS_UNTIL_DATE}}</strong>, quando o disparo automático será pausado.</p>
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Sentiremos sua falta. Se mudar de ideia, é só reativar quando quiser. Suas configurações continuam salvas.</p>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{APP_URL}}/planos" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Reativar assinatura</a>
</td></tr>
</table>
<div style="text-align:left;width:100%;margin-top:20px;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:13px;line-height:1.6;color:#6B7280;">Se o cancelamento foi por causa de algum problema, adoraríamos ouvir o que podemos melhorar. Responda este email.</p>
</div>
</td></tr>
```

- [ ] **Step 9: Adicionar validação estrutural ao `render_test.ts`**

```ts
import { TEMPLATE_NAMES, PLACEHOLDER_KEYS } from "./subjects.ts";

const TEMPLATES_DIR = new URL("./templates/", import.meta.url);

Deno.test("os 8 templates existem e passam no contrato", async () => {
  for (const name of TEMPLATE_NAMES) {
    const html = await Deno.readTextFile(new URL(`${name}.html`, TEMPLATES_DIR));
    // sem sintaxe Go do dashboard
    assertEquals(html.includes("{{ ."), false, `${name}: sobrou sintaxe {{ .X }}`);
    // sem logo base64
    assertEquals(html.includes("data:image"), false, `${name}: logo em base64`);
    // logo hospedado presente
    assertStringIncludes(html, "https://app.aflyo.com.br/brand/", );
    // todo {{X}} usa chave conhecida
    const keys = [...html.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
    for (const k of keys) {
      assertEquals(
        (PLACEHOLDER_KEYS as readonly string[]).includes(k),
        true,
        `${name}: placeholder desconhecido {{${k}}}`,
      );
    }
  }
});

Deno.test("boas-vindas tem o texto final dos 3 passos", async () => {
  const html = await Deno.readTextFile(new URL("boas-vindas.html", TEMPLATES_DIR));
  assertStringIncludes(html, "Conecte seu Telegram");
  assertStringIncludes(html, "Cadastre os grupos que quer monitorar");
  assertStringIncludes(html, "Defina o canal de disparo das ofertas");
});
```

- [ ] **Step 10: Rodar os testes**

Run: `deno test --allow-read supabase/functions/_shared/emails/render_test.ts`
Expected: PASS (5 testes). Se `Deno.readTextFile` falhar por permissão, adicionar `--allow-read`. Se algum template acusar placeholder desconhecido, revisar o arquivo.

- [ ] **Step 11: Commit**

```bash
git add supabase/functions/_shared/emails/templates/ supabase/functions/_shared/emails/render_test.ts
git commit -m "feat(emails): 8 templates com a marca Aflyo (logo hospedado, UTF-8, placeholders)"
```

---

## Task 3: Wrapper do Resend + gravação em `email_log`

**Files:**
- Create: `supabase/functions/_shared/emails/send.ts`
- Create: `supabase/functions/_shared/emails/deps.ts`
- Test: `supabase/functions/_shared/emails/send_test.ts`

**Interfaces:**
- Consumes: `renderTemplate` (Task 1), `SUBJECTS`, `TemplateName` (Task 1).
- Produces:
  - `send.ts`:
    - `interface ResendPayload { to: string; subject: string; html: string; headers: Record<string,string> }`
    - `interface SendDeps { fetchResend(p: ResendPayload): Promise<{ ok: boolean; id?: string; error?: string }>; claimLog(row: LogRow): Promise<{ id: string } | null>; finishLog(id: string, patch: { status: "sent"|"error"; resendId?: string; error?: string }): Promise<void> }`
    - `interface LogRow { user_id: string | null; to_email: string; template: TemplateName; dedupe_key: string | null }`
    - `interface SendOpts { template: TemplateName; to: string; vars: Record<string,string>; dedupeKey?: string; listUnsubscribe?: boolean; userId?: string }`
    - `interface SendResult { status: "sent"|"skipped"|"error"; resendId?: string; error?: string }`
    - `async function sendEmail(deps: SendDeps, opts: SendOpts): Promise<SendResult>`
  - `deps.ts`:
    - `function buildSendDeps(supabase: SupabaseClient, cfg: { apiKey: string; from: string; replyTo: string }): SendDeps`

- [ ] **Step 1: Escrever `send_test.ts` (falha)**

```ts
// supabase/functions/_shared/emails/send_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendEmail, type SendDeps } from "./send.ts";

function deps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    fetchResend: async () => ({ ok: true, id: "re_123" }),
    claimLog: async () => ({ id: "log_1" }),
    finishLog: async () => {},
    ...over,
  };
}

Deno.test("claim duplicado -> skipped, sem chamar o Resend", async () => {
  let called = false;
  const r = await sendEmail(
    deps({ claimLog: async () => null, fetchResend: async () => { called = true; return { ok: true }; } }),
    { template: "boas-vindas", to: "a@b.c", vars: { USER_NAME: "X" }, dedupeKey: "welcome:1" },
  );
  assertEquals(r.status, "skipped");
  assertEquals(called, false);
});

Deno.test("envio ok -> finishLog sent + retorna resendId", async () => {
  let patch: unknown;
  const r = await sendEmail(
    deps({ finishLog: async (_id, p) => { patch = p; } }),
    { template: "boas-vindas", to: "a@b.c", vars: { USER_NAME: "X" }, dedupeKey: "welcome:1" },
  );
  assertEquals(r.status, "sent");
  assertEquals(r.resendId, "re_123");
  assertEquals(patch, { status: "sent", resendId: "re_123", error: undefined });
});

Deno.test("Resend falha -> finishLog error + status error, sem throw", async () => {
  let patch: unknown;
  const r = await sendEmail(
    deps({
      fetchResend: async () => ({ ok: false, error: "resend 422: bad" }),
      finishLog: async (_id, p) => { patch = p; },
    }),
    { template: "boas-vindas", to: "a@b.c", vars: { USER_NAME: "X" } },
  );
  assertEquals(r.status, "error");
  assertEquals((patch as { status: string }).status, "error");
});

Deno.test("listUnsubscribe injeta header List-Unsubscribe", async () => {
  let sent: { headers: Record<string,string> } | undefined;
  await sendEmail(
    deps({ fetchResend: async (p) => { sent = p; return { ok: true, id: "x" }; } }),
    { template: "boas-vindas", to: "a@b.c", vars: { USER_NAME: "X", UNSUBSCRIBE_URL: "https://app.aflyo.com.br/configuracoes" }, listUnsubscribe: true },
  );
  assertEquals(sent!.headers["List-Unsubscribe"], "<https://app.aflyo.com.br/configuracoes>");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `deno test --allow-read supabase/functions/_shared/emails/send_test.ts`
Expected: FAIL "Module not found ./send.ts".

- [ ] **Step 3: Implementar `send.ts`**

```ts
// supabase/functions/_shared/emails/send.ts
import { renderTemplate } from "./render.ts";
import { SUBJECTS, type TemplateName } from "./subjects.ts";

export interface ResendPayload {
  to: string;
  subject: string;
  html: string;
  headers: Record<string, string>;
}

export interface LogRow {
  user_id: string | null;
  to_email: string;
  template: TemplateName;
  dedupe_key: string | null;
}

export interface SendDeps {
  fetchResend(p: ResendPayload): Promise<{ ok: boolean; id?: string; error?: string }>;
  claimLog(row: LogRow): Promise<{ id: string } | null>;
  finishLog(
    id: string,
    patch: { status: "sent" | "error"; resendId?: string; error?: string },
  ): Promise<void>;
}

export interface SendOpts {
  template: TemplateName;
  to: string;
  vars: Record<string, string>;
  dedupeKey?: string;
  listUnsubscribe?: boolean;
  userId?: string;
}

export interface SendResult {
  status: "sent" | "skipped" | "error";
  resendId?: string;
  error?: string;
}

export async function sendEmail(deps: SendDeps, opts: SendOpts): Promise<SendResult> {
  const claim = await deps.claimLog({
    user_id: opts.userId ?? null,
    to_email: opts.to,
    template: opts.template,
    dedupe_key: opts.dedupeKey ?? null,
  });
  if (!claim) return { status: "skipped" };

  const html = await renderTemplate(opts.template, opts.vars);
  const headers: Record<string, string> = {};
  if (opts.listUnsubscribe) {
    const url = opts.vars.UNSUBSCRIBE_URL || opts.vars.PREFERENCES_URL;
    if (url) headers["List-Unsubscribe"] = `<${url}>`;
  }

  const res = await deps.fetchResend({ to: opts.to, subject: SUBJECTS[opts.template], html, headers });
  if (res.ok) {
    await deps.finishLog(claim.id, { status: "sent", resendId: res.id, error: undefined });
    return { status: "sent", resendId: res.id };
  }
  await deps.finishLog(claim.id, { status: "error", error: res.error });
  return { status: "error", error: res.error };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `deno test --allow-read supabase/functions/_shared/emails/send_test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Implementar `deps.ts` (impl real, sem teste dedicado)**

```ts
// supabase/functions/_shared/emails/deps.ts
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SendDeps, ResendPayload, LogRow } from "./send.ts";

export function buildSendDeps(
  supabase: SupabaseClient,
  cfg: { apiKey: string; from: string; replyTo: string },
): SendDeps {
  return {
    async fetchResend(p: ResendPayload) {
      const body: Record<string, unknown> = {
        from: cfg.from,
        reply_to: cfg.replyTo,
        to: p.to,
        subject: p.subject,
        html: p.html,
      };
      if (Object.keys(p.headers).length > 0) body.headers = p.headers;
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (r.ok) {
        const j = await r.json().catch(() => ({}));
        return { ok: true, id: j.id };
      }
      return { ok: false, error: `resend ${r.status}: ${(await r.text()).slice(0, 300)}` };
    },

    async claimLog(row: LogRow) {
      // upsert com ignoreDuplicates: em conflito de dedupe_key nao insere e o
      // .select() volta vazio -> tratamos como "outro processo ja mandou".
      const { data, error } = await supabase
        .from("email_log")
        .upsert({ ...row, status: "pending" }, { onConflict: "dedupe_key", ignoreDuplicates: true })
        .select("id");
      if (error) {
        console.error("[emails] claimLog erro:", error.message);
        return null;
      }
      if (!data || data.length === 0) return row.dedupe_key ? null : { id: "" };
      return { id: data[0].id as string };
    },

    async finishLog(id, patch) {
      if (!id) return;
      const { error } = await supabase
        .from("email_log")
        .update({ status: patch.status, resend_id: patch.resendId ?? null, error: patch.error ?? null })
        .eq("id", id);
      if (error) console.error("[emails] finishLog erro:", error.message);
    },
  };
}
```

Nota: para os e-mails de auth (`dedupe_key` null) o upsert sempre insere (nulls não conflitam no unique do Postgres); `claimLog` devolve `{ id }` da row nova.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/emails/send.ts supabase/functions/_shared/emails/deps.ts supabase/functions/_shared/emails/send_test.ts
git commit -m "feat(emails): sendEmail com wrapper do Resend, dedupe e email_log"
```

---

## Task 4: Migration `email_log` + trigger de boas-vindas + cron de trial

**Files:**
- Create: `supabase/migrations/20260901120000_email_log_and_triggers.sql`
- Create: `supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql`

**Interfaces:**
- Produces: tabela `public.email_log` (colunas usadas pelo `deps.ts` do Task 3: `id, user_id, to_email, template, dedupe_key, resend_id, status, error, created_at`); settings de banco `app.public_url`, `app.send_email_url`; job de cron `trial_email_reminders`; trigger `trg_email_confirmed_welcome`.
- Consumes: extensões `pg_cron` e `pg_net`; a Edge Function `send-email` (Task 5) no path `/functions/v1/send-email`.

- [ ] **Step 1: Escrever a migration**

```sql
-- supabase/migrations/20260901120000_email_log_and_triggers.sql
-- =====================================================================
-- E-mails branded via Resend: log/idempotencia + disparadores de banco.
-- Depende das Edge Functions send-email e email-hook (deploy junto).
-- =====================================================================

create extension if not exists pg_net;
-- pg_cron ja existe no projeto (jobs expire_trials / expire_subscriptions).

-- 1) Log de e-mails enviados -----------------------------------------
create table if not exists public.email_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references public.profiles(id) on delete set null,
  to_email    text not null,
  template    text not null,
  dedupe_key  text unique,                -- null = pode repetir (e-mails de auth)
  resend_id   text,
  status      text not null default 'pending' check (status in ('pending','sent','error')),
  error       text,
  created_at  timestamptz not null default now()
);
create index if not exists email_log_user_idx    on public.email_log(user_id);
create index if not exists email_log_created_idx  on public.email_log(created_at desc);

alter table public.email_log enable row level security;
-- Sem policy para anon/authenticated: telemetria interna, so service_role acessa.
revoke all on public.email_log from anon, authenticated;

-- 2) Config do banco (nao-secreta) ---------------------------------
alter database postgres set app.public_url     = 'https://app.aflyo.com.br';
alter database postgres set app.send_email_url  = 'https://zuqaccivowbzdfrpgekz.functions.supabase.co/send-email';
-- app.service_role_key: aplicar A MAO no SQL Editor (nao versionar o segredo):
--   alter database postgres set app.service_role_key = '<SERVICE_ROLE_KEY>';

-- 3) Helper: dispara o send-email via pg_net ----------------------
create or replace function public.enqueue_transactional_email(
  p_template text,
  p_to       text,
  p_vars     jsonb,
  p_dedupe   text,
  p_list_unsub boolean default false
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := current_setting('app.service_role_key', true);
begin
  if v_key is null or v_key = '' then
    raise notice '[emails] app.service_role_key nao configurado; e-mail % ignorado', p_template;
    return;
  end if;
  perform net.http_post(
    url     := current_setting('app.send_email_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body    := jsonb_build_object(
      'template', p_template,
      'to', p_to,
      'dedupe_key', p_dedupe,
      'list_unsubscribe', p_list_unsub,
      'vars', p_vars
    )
  );
end;
$$;

-- 4) Boas-vindas: quando email_confirmed_at vira nao-nulo ---------
create or replace function public.on_email_confirmed_send_welcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_app text := current_setting('app.public_url', true);
  v_name text;
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    v_name := coalesce(
      new.raw_user_meta_data->>'full_name',
      split_part(new.email, '@', 1)
    );
    perform public.enqueue_transactional_email(
      'boas-vindas',
      new.email,
      jsonb_build_object(
        'USER_NAME', v_name,
        'USER_EMAIL', new.email,
        'APP_URL', v_app,
        'SUPPORT_URL', v_app || '/suporte',
        'PREFERENCES_URL', v_app || '/configuracoes',
        'UNSUBSCRIBE_URL', v_app || '/configuracoes'
      ),
      'welcome:' || new.id::text,
      true
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_email_confirmed_welcome on auth.users;
create trigger trg_email_confirmed_welcome
  after update of email_confirmed_at on auth.users
  for each row execute function public.on_email_confirmed_send_welcome();

-- 5) Cron: lembretes de trial (1x/dia, 12:00 UTC ~ 09:00 BRT) -----
select cron.schedule('trial_email_reminders', '0 12 * * *', $CRON$
  -- 3 dias para acabar
  select public.enqueue_transactional_email(
    'trial-acabando', u.email,
    jsonb_build_object(
      'USER_NAME', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
      'USER_EMAIL', u.email,
      'DAYS_LEFT', '3',
      'APP_URL', current_setting('app.public_url'),
      'SUPPORT_URL', current_setting('app.public_url') || '/suporte',
      'PREFERENCES_URL', current_setting('app.public_url') || '/configuracoes',
      'UNSUBSCRIBE_URL', current_setting('app.public_url') || '/configuracoes'),
    'trial_ending_3:' || p.id::text, true)
  from public.profiles p join auth.users u on u.id = p.id
  where p.account_status = 'trialing'
    and p.trial_ends_at::date - now()::date = 3;

  -- 1 dia para acabar
  select public.enqueue_transactional_email(
    'trial-acabando', u.email,
    jsonb_build_object(
      'USER_NAME', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
      'USER_EMAIL', u.email,
      'DAYS_LEFT', '1',
      'APP_URL', current_setting('app.public_url'),
      'SUPPORT_URL', current_setting('app.public_url') || '/suporte',
      'PREFERENCES_URL', current_setting('app.public_url') || '/configuracoes',
      'UNSUBSCRIBE_URL', current_setting('app.public_url') || '/configuracoes'),
    'trial_ending_1:' || p.id::text, true)
  from public.profiles p join auth.users u on u.id = p.id
  where p.account_status = 'trialing'
    and p.trial_ends_at::date - now()::date = 1;

  -- expirado (janela de 2 dias apos a expiracao; dedupe garante 1 envio)
  select public.enqueue_transactional_email(
    'trial-expirado', u.email,
    jsonb_build_object(
      'USER_NAME', coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email,'@',1)),
      'USER_EMAIL', u.email,
      'APP_URL', current_setting('app.public_url'),
      'SUPPORT_URL', current_setting('app.public_url') || '/suporte',
      'PREFERENCES_URL', current_setting('app.public_url') || '/configuracoes'),
    'trial_expired:' || p.id::text, false)
  from public.profiles p join auth.users u on u.id = p.id
  where p.account_status in ('trialing','expired')
    and p.trial_ends_at < now()
    and p.trial_ends_at > now() - interval '2 days';
$CRON$);

-- Verificacao: supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql
```

- [ ] **Step 2: Escrever o teste manual**

```sql
-- supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql
-- Rodar no SQL Editor DEPOIS de aplicar a migration e setar app.service_role_key.

-- (a) tabela e constraint
select 1/count(*) from information_schema.tables
  where table_schema='public' and table_name='email_log';           -- ok se nao der divisao por zero
select conname from pg_constraint
  where conrelid='public.email_log'::regclass and contype='u';       -- espera email_log_dedupe_key_key

-- (b) dedupe: segundo insert com mesma dedupe_key falha
insert into public.email_log(to_email,template,dedupe_key,status) values ('x@x.com','boas-vindas','t:dup','sent');
-- proxima linha deve dar erro de unique:
insert into public.email_log(to_email,template,dedupe_key,status) values ('x@x.com','boas-vindas','t:dup','sent');
delete from public.email_log where dedupe_key='t:dup';

-- (c) settings
select current_setting('app.public_url'), current_setting('app.send_email_url');
select current_setting('app.service_role_key', true) is not null as key_set;

-- (d) cron agendado
select jobname, schedule from cron.job where jobname='trial_email_reminders';

-- (e) trigger presente
select tgname from pg_trigger where tgrelid='auth.users'::regclass and tgname='trg_email_confirmed_welcome';

-- (f) simular boas-vindas: setar email_confirmed_at de uma conta de teste e
--     conferir net._http_response depois de alguns segundos.
--   update auth.users set email_confirmed_at = now() where email = '<conta_teste>' and email_confirmed_at is null;
--   select * from net._http_response order by created desc limit 3;
```

- [ ] **Step 3: Verificar sintaxe da migration**

Se houver Postgres local: `psql -f supabase/migrations/20260901120000_email_log_and_triggers.sql` num banco descartavel.
Caso contrario: revisar manualmente (blocos `$CRON$` e `$$` balanceados; `net.http_post` com nomes de parametro corretos).
Expected: sem erro de sintaxe.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260901120000_email_log_and_triggers.sql supabase/tests/manual/20260901120000_email_log_and_triggers.test.sql
git commit -m "feat(emails): migration email_log + trigger boas-vindas + cron de trial"
```

---

## Task 5: Edge Function `send-email`

**Files:**
- Create: `supabase/functions/send-email/index.ts`
- Create: `supabase/functions/send-email/deno.json`
- Test: `supabase/functions/send-email/send_email_test.ts`

**Interfaces:**
- Consumes: `sendEmail`, `SendDeps` (Task 3), `isTemplateName` (Task 1), `buildSendDeps` (Task 3).
- Produces: handler `handleSendEmail(req: Request, deps: { serviceKey: string; send: (opts: SendOpts) => Promise<SendResult> }): Promise<Response>`.

- [ ] **Step 1: `deno.json`**

```json
{ "imports": {} }
```

- [ ] **Step 2: Escrever `send_email_test.ts` (falha)**

```ts
// supabase/functions/send-email/send_email_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleSendEmail } from "./index.ts";

const KEY = "svc_test_key";
function deps(sendImpl = async () => ({ status: "sent" as const, resendId: "re_1" })) {
  return { serviceKey: KEY, send: sendImpl };
}
function req(body: unknown, auth?: string): Request {
  return new Request("https://x/functions/v1/send-email", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(auth ? { Authorization: auth } : {}) },
    body: JSON.stringify(body),
  });
}

Deno.test("sem bearer -> 401", async () => {
  const r = await handleSendEmail(req({ template: "boas-vindas", to: "a@b.c", vars: {} }), deps());
  assertEquals(r.status, 401);
});

Deno.test("bearer errado -> 401", async () => {
  const r = await handleSendEmail(req({ template: "boas-vindas", to: "a@b.c", vars: {} }, "Bearer nope"), deps());
  assertEquals(r.status, 401);
});

Deno.test("template invalido -> 400", async () => {
  const r = await handleSendEmail(req({ template: "xpto", to: "a@b.c", vars: {} }, `Bearer ${KEY}`), deps());
  assertEquals(r.status, 400);
});

Deno.test("ok -> 200 com status do envio", async () => {
  const r = await handleSendEmail(
    req({ template: "boas-vindas", to: "a@b.c", vars: { USER_NAME: "X" }, dedupe_key: "welcome:1" }, `Bearer ${KEY}`),
    deps(),
  );
  assertEquals(r.status, 200);
  assertEquals((await r.json()).status, "sent");
});

Deno.test("Resend erro -> ainda 200 (nao 500)", async () => {
  const r = await handleSendEmail(
    req({ template: "boas-vindas", to: "a@b.c", vars: {} }, `Bearer ${KEY}`),
    deps(async () => ({ status: "error" as const, error: "boom" })),
  );
  assertEquals(r.status, 200);
  assertEquals((await r.json()).status, "error");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `deno test --allow-env --allow-read supabase/functions/send-email/send_email_test.ts`
Expected: FAIL "Module not found ./index.ts".

- [ ] **Step 4: Implementar `index.ts`**

```ts
// supabase/functions/send-email/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isTemplateName } from "../_shared/emails/subjects.ts";
import { sendEmail, type SendOpts, type SendResult } from "../_shared/emails/send.ts";
import { buildSendDeps } from "../_shared/emails/deps.ts";

const FROM = "Aflyo <ola@send.aflyo.com.br>";
const REPLY_TO = "suporte@aflyo.com.br";

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ua = enc.encode(a);
  const ub = enc.encode(b);
  if (ua.length !== ub.length) return false;
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

export async function handleSendEmail(
  req: Request,
  deps: { serviceKey: string; send: (opts: SendOpts) => Promise<SendResult> },
): Promise<Response> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!deps.serviceKey || !token || !timingSafeEqual(token, deps.serviceKey)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), { status: 400 });
  }

  const { template, to, vars, dedupe_key, list_unsubscribe } = body as {
    template?: unknown; to?: unknown; vars?: unknown; dedupe_key?: unknown; list_unsubscribe?: unknown;
  };
  if (!isTemplateName(template)) {
    return new Response(JSON.stringify({ error: "template invalido" }), { status: 400 });
  }
  if (typeof to !== "string" || !to.includes("@")) {
    return new Response(JSON.stringify({ error: "to invalido" }), { status: 400 });
  }

  const result = await deps.send({
    template,
    to,
    vars: (vars && typeof vars === "object" ? vars : {}) as Record<string, string>,
    dedupeKey: typeof dedupe_key === "string" ? dedupe_key : undefined,
    listUnsubscribe: list_unsubscribe === true,
  });
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

serve((req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    serviceKey,
    { auth: { persistSession: false } },
  );
  const sendDeps = buildSendDeps(supabase, {
    apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
    from: FROM,
    replyTo: REPLY_TO,
  });
  return handleSendEmail(req, {
    serviceKey,
    send: (opts) => sendEmail(sendDeps, opts),
  });
});
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test --allow-env --allow-read supabase/functions/send-email/send_email_test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/send-email/
git commit -m "feat(emails): Edge Function send-email (service_role, transacionais)"
```

---

## Task 6: Edge Function `email-hook` (auth)

**Files:**
- Create: `supabase/functions/email-hook/index.ts`
- Create: `supabase/functions/email-hook/deno.json`
- Test: `supabase/functions/email-hook/hook_test.ts`

**Interfaces:**
- Consumes: `sendEmail`, `SendOpts`, `SendResult` (Task 3), `buildSendDeps` (Task 3).
- Produces:
  - `verifyHookSignature(rawBody: string, headers: Headers, secret: string): Promise<boolean>`
  - `buildConfirmationUrl(supabaseUrl: string, appUrl: string, ed: { token_hash: string; email_action_type: string; redirect_to?: string }): string`
  - `pickTemplate(action: string): "confirmacao-conta" | "recuperacao-senha"`
  - `handleEmailHook(req, deps): Promise<Response>`

- [ ] **Step 1: `deno.json`**

```json
{ "imports": {} }
```

- [ ] **Step 2: Escrever `hook_test.ts` (falha)**

```ts
// supabase/functions/email-hook/hook_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConfirmationUrl, pickTemplate, handleEmailHook } from "./index.ts";

Deno.test("pickTemplate mapeia signup/recovery", () => {
  assertEquals(pickTemplate("signup"), "confirmacao-conta");
  assertEquals(pickTemplate("recovery"), "recuperacao-senha");
  assertEquals(pickTemplate("magiclink"), "recuperacao-senha");
});

Deno.test("buildConfirmationUrl: signup usa /auth/v1/verify e redirect default", () => {
  const u = buildConfirmationUrl("https://proj.supabase.co", "https://app.aflyo.com.br", {
    token_hash: "abc", email_action_type: "signup",
  });
  assertStringIncludes(u, "https://proj.supabase.co/auth/v1/verify?token=abc&type=signup&redirect_to=");
  assertStringIncludes(u, encodeURIComponent("https://app.aflyo.com.br/dashboard"));
});

Deno.test("buildConfirmationUrl: recovery respeita redirect_to do payload", () => {
  const u = buildConfirmationUrl("https://proj.supabase.co", "https://app.aflyo.com.br", {
    token_hash: "t1", email_action_type: "recovery", redirect_to: "https://app.aflyo.com.br/reset",
  });
  assertStringIncludes(u, "type=recovery");
  assertStringIncludes(u, encodeURIComponent("https://app.aflyo.com.br/reset"));
});

Deno.test("assinatura invalida -> 401", async () => {
  const req = new Request("https://x", { method: "POST", body: "{}", headers: { "webhook-signature": "v1,zzz", "webhook-id": "i", "webhook-timestamp": "1" } });
  const r = await handleEmailHook(req, {
    hookSecret: "whsec_" + btoa("segredo"),
    supabaseUrl: "https://proj.supabase.co",
    appUrl: "https://app.aflyo.com.br",
    send: async () => ({ status: "sent" as const }),
  });
  assertEquals(r.status, 401);
});

Deno.test("Resend erro -> 500 com objeto error", async () => {
  // assinatura valida: geramos ela igual ao verify (helper exportado abaixo em index.ts como signBody nos testes)
  const secretRaw = "segredo";
  const body = JSON.stringify({
    user: { email: "a@b.c" },
    email_data: { token_hash: "th", email_action_type: "signup" },
  });
  const { signBodyForTest } = await import("./index.ts");
  const sig = await signBodyForTest("whsec_" + btoa(secretRaw), "id1", "1700000000", body);
  const req = new Request("https://x", {
    method: "POST",
    body,
    headers: { "webhook-signature": sig, "webhook-id": "id1", "webhook-timestamp": "1700000000" },
  });
  const r = await handleEmailHook(req, {
    hookSecret: "whsec_" + btoa(secretRaw),
    supabaseUrl: "https://proj.supabase.co",
    appUrl: "https://app.aflyo.com.br",
    send: async () => ({ status: "error" as const, error: "boom" }),
  });
  assertEquals(r.status, 500);
  assertStringIncludes(JSON.stringify(await r.json()), "error");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `deno test --allow-env --allow-read supabase/functions/email-hook/hook_test.ts`
Expected: FAIL "Module not found ./index.ts".

- [ ] **Step 4: Implementar `index.ts`**

```ts
// supabase/functions/email-hook/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail, type SendOpts, type SendResult } from "../_shared/emails/send.ts";
import { buildSendDeps } from "../_shared/emails/deps.ts";

const FROM = "Aflyo <ola@send.aflyo.com.br>";
const REPLY_TO = "suporte@aflyo.com.br";

// --- Standard Webhooks (esquema do Supabase Auth Hook) ---
function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64(bytes: ArrayBuffer): string {
  const b = new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
async function hmacB64(secretB64: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", b64ToBytes(secretB64), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return bytesToB64(sig);
}
function ctEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// exportado so pra teste
export async function signBodyForTest(hookSecret: string, id: string, ts: string, body: string): Promise<string> {
  const secretB64 = hookSecret.replace(/^whsec_/, "");
  const s = await hmacB64(secretB64, `${id}.${ts}.${body}`);
  return `v1,${s}`;
}

export async function verifyHookSignature(rawBody: string, headers: Headers, hookSecret: string): Promise<boolean> {
  const id = headers.get("webhook-id") ?? "";
  const ts = headers.get("webhook-timestamp") ?? "";
  const sigHeader = headers.get("webhook-signature") ?? "";
  if (!id || !ts || !sigHeader || !hookSecret) return false;
  const secretB64 = hookSecret.replace(/^whsec_/, "");
  const expected = await hmacB64(secretB64, `${id}.${ts}.${rawBody}`);
  // header pode ter varias assinaturas separadas por espaco, cada uma "v1,<b64>"
  for (const part of sigHeader.split(" ")) {
    const val = part.includes(",") ? part.split(",")[1] : part;
    if (ctEq(val, expected)) return true;
  }
  return false;
}

export function pickTemplate(action: string): "confirmacao-conta" | "recuperacao-senha" {
  return action === "signup" ? "confirmacao-conta" : "recuperacao-senha";
}

export function buildConfirmationUrl(
  supabaseUrl: string,
  appUrl: string,
  ed: { token_hash: string; email_action_type: string; redirect_to?: string },
): string {
  let redirect = ed.redirect_to;
  if (!redirect) {
    if (ed.email_action_type === "recovery") redirect = `${appUrl}/reset`;
    else if (ed.email_action_type === "signup") redirect = `${appUrl}/dashboard`;
    else redirect = appUrl;
  }
  const base = supabaseUrl.replace(/\/+$/, "");
  return `${base}/auth/v1/verify?token=${encodeURIComponent(ed.token_hash)}` +
    `&type=${encodeURIComponent(ed.email_action_type)}` +
    `&redirect_to=${encodeURIComponent(redirect)}`;
}

export async function handleEmailHook(
  req: Request,
  deps: {
    hookSecret: string;
    supabaseUrl: string;
    appUrl: string;
    send: (opts: SendOpts) => Promise<SendResult>;
  },
): Promise<Response> {
  const raw = await req.text();
  if (!(await verifyHookSignature(raw, req.headers, deps.hookSecret))) {
    return new Response(JSON.stringify({ error: { http_code: 401, message: "assinatura invalida" } }), { status: 401 });
  }

  let payload: {
    user?: { email?: string };
    email_data?: { token_hash: string; email_action_type: string; redirect_to?: string };
  };
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(JSON.stringify({ error: { http_code: 400, message: "json invalido" } }), { status: 400 });
  }

  const email = payload.user?.email;
  const ed = payload.email_data;
  if (!email || !ed?.token_hash || !ed?.email_action_type) {
    return new Response(JSON.stringify({ error: { http_code: 400, message: "payload incompleto" } }), { status: 400 });
  }

  const template = pickTemplate(ed.email_action_type);
  const confirmationUrl = buildConfirmationUrl(deps.supabaseUrl, deps.appUrl, ed);

  const result = await deps.send({
    template,
    to: email,
    vars: {
      CONFIRMATION_URL: confirmationUrl,
      USER_EMAIL: email,
      APP_URL: deps.appUrl,
      SUPPORT_URL: `${deps.appUrl}/suporte`,
      PREFERENCES_URL: `${deps.appUrl}/configuracoes`,
    },
  });

  if (result.status === "error") {
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: result.error ?? "falha no envio" } }),
      { status: 500 },
    );
  }
  return new Response(JSON.stringify({}), { status: 200, headers: { "Content-Type": "application/json" } });
}

serve((req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const sendDeps = buildSendDeps(supabase, {
    apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
    from: FROM,
    replyTo: REPLY_TO,
  });
  return handleEmailHook(req, {
    hookSecret: Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "",
    supabaseUrl,
    appUrl: Deno.env.get("APP_PUBLIC_URL") ?? "https://app.aflyo.com.br",
    send: (opts) => sendEmail(sendDeps, opts),
  });
});
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test --allow-env --allow-read supabase/functions/email-hook/hook_test.ts`
Expected: PASS (5 testes).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/email-hook/
git commit -m "feat(emails): Edge Function email-hook (Send Email Hook -> Resend)"
```

---

## Task 7: E-mails de billing no `cakto-webhook`

**Files:**
- Create: `supabase/functions/cakto-webhook/plan-prices.ts`
- Create: `supabase/functions/cakto-webhook/emails.ts`
- Modify: `supabase/functions/cakto-webhook/handlers.ts`
- Test: `supabase/functions/cakto-webhook/emails_test.ts`

**Interfaces:**
- Consumes: `sendEmail` (Task 3), `buildSendDeps` (Task 3).
- Produces:
  - `plan-prices.ts`: `PLAN_INFO: Record<string, { label: string; priceBRL: string }>`, `planLabel(code): string`, `planAmount(code): string`.
  - `emails.ts`: `sendBillingEmail(supabase, template, userId, extraVars, dedupeKey): Promise<void>` (nunca lanca).

- [ ] **Step 1: `plan-prices.ts`**

```ts
// supabase/functions/cakto-webhook/plan-prices.ts
// Espelho de src/config/planCatalog.ts (starter 47,90 / pro 97 / enterprise 197).
// plan_code interno no banco: 'starter' | 'pro' | 'enterprise'.
export const PLAN_INFO: Record<string, { label: string; priceBRL: string }> = {
  starter: { label: "Starter", priceBRL: "R$ 47,90" },
  pro: { label: "Profissional", priceBRL: "R$ 97,00" },
  enterprise: { label: "Business", priceBRL: "R$ 197,00" },
};

export function planLabel(code: string | null | undefined): string {
  return (code && PLAN_INFO[code]?.label) || "seu plano";
}
export function planAmount(code: string | null | undefined): string {
  return (code && PLAN_INFO[code]?.priceBRL) || "";
}
```

- [ ] **Step 2: Escrever `emails_test.ts` (falha)**

```ts
// supabase/functions/cakto-webhook/emails_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sendBillingEmail } from "./emails.ts";

function fakeSupabase(user: { email?: string; full_name?: string } | null) {
  return {
    auth: {
      admin: {
        getUserById: async (_id: string) => ({
          data: user ? { user: { email: user.email, user_metadata: { full_name: user.full_name } } } : { user: null },
          error: null,
        }),
      },
    },
    from() { return this as unknown as Record<string, unknown>; },
    upsert() { return { select: async () => ({ data: [{ id: "log1" }], error: null }) }; },
    update() { return { eq: async () => ({ error: null }) }; },
  };
}

Deno.test("sem e-mail do usuario -> nao lanca, nao envia", async () => {
  let sent = 0;
  await sendBillingEmail(
    fakeSupabase(null) as never,
    "cancelamento",
    "u1",
    { PLAN_NAME: "Starter" },
    "sub_canceled:s1",
    { sendImpl: async () => { sent++; return { status: "sent" as const }; } },
  );
  assertEquals(sent, 0);
});

Deno.test("happy path chama sendEmail com vars de rodape + extras", async () => {
  let captured: Record<string, unknown> | undefined;
  await sendBillingEmail(
    fakeSupabase({ email: "a@b.c", full_name: "Fulano" }) as never,
    "assinatura-confirmada",
    "u1",
    { PLAN_NAME: "Profissional", AMOUNT: "R$ 97,00", NEXT_BILLING_DATE: "10/10/2026" },
    "sub_confirmed:u1",
    { sendImpl: async (opts) => { captured = opts as Record<string, unknown>; return { status: "sent" as const }; } },
  );
  const vars = (captured!.vars as Record<string, string>);
  assertEquals(vars.USER_NAME, "Fulano");
  assertEquals(vars.PLAN_NAME, "Profissional");
  assertEquals(vars.SUPPORT_URL, "https://app.aflyo.com.br/suporte");
  assertEquals(captured!.dedupeKey, "sub_confirmed:u1");
});

Deno.test("sendEmail lanca -> engolido", async () => {
  await sendBillingEmail(
    fakeSupabase({ email: "a@b.c" }) as never,
    "falha-pagamento",
    "u1",
    { PLAN_NAME: "Starter" },
    "payment_failed:s1:2026-09-01",
    { sendImpl: async () => { throw new Error("boom"); } },
  );
  // se chegou aqui sem throw, passou
  assertEquals(true, true);
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `deno test --allow-env --allow-read supabase/functions/cakto-webhook/emails_test.ts`
Expected: FAIL "Module not found ./emails.ts".

- [ ] **Step 4: Implementar `emails.ts`**

```ts
// supabase/functions/cakto-webhook/emails.ts
import { sendEmail, type SendOpts, type SendResult } from "../_shared/emails/send.ts";
import { buildSendDeps } from "../_shared/emails/deps.ts";
import type { TemplateName } from "../_shared/emails/subjects.ts";

const APP_URL = "https://app.aflyo.com.br";

export async function sendBillingEmail(
  supabase: any,
  template: TemplateName,
  userId: string,
  extraVars: Record<string, string>,
  dedupeKey: string,
  testHooks?: { sendImpl?: (opts: SendOpts) => Promise<SendResult> },
): Promise<void> {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error || !data?.user?.email) {
      console.error("[emails] sendBillingEmail: sem e-mail para", userId, error?.message ?? "");
      return;
    }
    const email: string = data.user.email;
    const name: string = data.user.user_metadata?.full_name || email.split("@")[0];

    const opts: SendOpts = {
      template,
      to: email,
      userId,
      dedupeKey,
      vars: {
        USER_NAME: name,
        USER_EMAIL: email,
        APP_URL,
        SUPPORT_URL: `${APP_URL}/suporte`,
        PREFERENCES_URL: `${APP_URL}/configuracoes`,
        ...extraVars,
      },
    };

    const send = testHooks?.sendImpl ??
      ((o: SendOpts) => sendEmail(
        buildSendDeps(supabase, {
          apiKey: Deno.env.get("RESEND_API_KEY") ?? "",
          from: "Aflyo <ola@send.aflyo.com.br>",
          replyTo: "suporte@aflyo.com.br",
        }),
        o,
      ));

    await send(opts);
  } catch (e) {
    console.error("[emails] sendBillingEmail falhou:", (e as Error).message);
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `deno test --allow-env --allow-read supabase/functions/cakto-webhook/emails_test.ts`
Expected: PASS (3 testes).

- [ ] **Step 6: Ligar os sends no `handlers.ts`**

Adicionar o import no topo (junto dos outros):

```ts
import { sendBillingEmail } from "./emails.ts";
import { planLabel, planAmount } from "./plan-prices.ts";
```

Adicionar helper de data perto de `nowIso()`:

```ts
function fmtDateBR(d: string | null | undefined): string {
  if (!d) return "";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "" : dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}
```

Em `purchaseApproved`, logo apos `await grantEntitlement(supabase, userId, plan, "purchase_approved");`:

```ts
    await sendBillingEmail(supabase, "assinatura-confirmada", userId, {
      PLAN_NAME: planLabel(plan),
      AMOUNT: planAmount(plan),
      NEXT_BILLING_DATE: fmtDateBR(data.subscription?.next_payment_date ?? data.next_payment_date),
    }, "sub_confirmed:" + userId);
```

Em `subscriptionCreated`, **somente no ramo sem row previa**, logo apos
`await grantEntitlement(supabase, userId, plan, "subscription_created");`:

```ts
    await sendBillingEmail(supabase, "assinatura-confirmada", userId, {
      PLAN_NAME: planLabel(plan),
      AMOUNT: planAmount(plan),
      NEXT_BILLING_DATE: fmtDateBR(data.subscription?.next_payment_date ?? data.next_payment_date),
    }, "sub_confirmed:" + userId);
```

Em `purchaseRefused` (hoje so faz `console.log`): resolver o usuario e mandar
falha-pagamento. Substituir o corpo por:

```ts
export async function purchaseRefused(data: any): Promise<void> {
  console.log("[cakto-webhook] purchase_refused: pagamento recusado", data?.id ?? null);
  const supabase = getSupabaseAdmin();
  const userId = await resolveUserId(supabase, data);
  if (!userId) return;
  const { plan } = resolvePlan(data);
  await sendBillingEmail(supabase, "falha-pagamento", userId, {
    PLAN_NAME: planLabel(plan),
    AMOUNT: planAmount(plan),
  }, "payment_failed:" + providerSubId(data) + ":" + nowIso().slice(0, 10));
}
```

Em `subscriptionRenewalRefused`, apos o `update` de `subscriptions`, antes do
fim da funcao:

```ts
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id, plan_code")
    .eq("provider_subscription_id", subId)
    .maybeSingle();
  if (sub?.user_id) {
    await sendBillingEmail(supabase, "falha-pagamento", sub.user_id, {
      PLAN_NAME: planLabel(sub.plan_code),
      AMOUNT: planAmount(sub.plan_code),
    }, "payment_failed:" + subId + ":" + nowIso().slice(0, 10));
  }
```

Em `subscriptionCanceled`, apos o `update` de `subscriptions`:

```ts
  const { data: sub } = await supabase
    .from("subscriptions")
    .select("user_id, plan_code, current_period_end")
    .eq("provider_subscription_id", subId)
    .maybeSingle();
  if (sub?.user_id) {
    await sendBillingEmail(supabase, "cancelamento", sub.user_id, {
      PLAN_NAME: planLabel(sub.plan_code),
      ACCESS_UNTIL_DATE: fmtDateBR(sub.current_period_end),
    }, "sub_canceled:" + subId);
  }
```

- [ ] **Step 7: Rodar toda a suite deno das functions**

Run: `deno test --allow-env --allow-read supabase/functions/`
Expected: PASS. Os testes que ja existiam (`admin-api/*`) continuam verdes; os novos de emails passam. Se `handlers.ts` nao tiver teste, o `deno test` so type-checa o modulo ao importar `emails_test.ts` nao o cobre; garantir que `deno check supabase/functions/cakto-webhook/handlers.ts` passa.

Run: `deno check supabase/functions/cakto-webhook/handlers.ts`
Expected: sem erro de tipos.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/cakto-webhook/
git commit -m "feat(emails): e-mails de billing (confirmada, falha, cancelamento) no cakto-webhook"
```

---

## Task 8: Runbook de rollout

**Files:**
- Create: `docs/EMAILS_RESEND_ROLLOUT.md`

**Interfaces:** nenhuma (documento).

- [ ] **Step 1: Escrever o runbook**

```markdown
# Rollout: e-mails branded via Resend

Ordem obrigatoria. Cada passo tem um jeito de verificar antes de seguir.

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
supabase functions deploy email-hook
supabase functions deploy cakto-webhook
```
Verificar `send-email` (deve dar 401 sem bearer):
```
curl -si https://<proj>.functions.supabase.co/send-email -d '{}' | head -1
```

## 5. Send Email Hook (dashboard)
- Authentication -> Hooks -> **Send Email Hook** -> Enable.
- Endpoint: `https://<proj>.functions.supabase.co/email-hook`.
- Secret: gerar; usar o mesmo valor de `SEND_EMAIL_HOOK_SECRET` (passo 2).
- Salvar.

## 6. Confirm email ON (coordena com o SEC-2)
- Authentication -> Sign In / Providers -> **Confirm email = ON**.
- A partir daqui, todo signup dispara o `email-hook`.

## 7. QA ponta a ponta (conta de teste)
- [ ] Signup novo -> chega `confirmacao-conta` do Resend; botao confirma; cai logado.
- [ ] Apos confirmar -> chega `boas-vindas` 1x (`select * from email_log where dedupe_key like 'welcome:%'`).
- [ ] `ForgotPassword` -> chega `recuperacao-senha`; link cai em `/reset`; troca de senha ok.
- [ ] Trial: `update profiles set trial_ends_at = now() + interval '3 days' where id = '<id>'`;
      rodar o corpo do cron `trial_email_reminders` na mao -> 1 e-mail `trial-acabando`;
      rodar de novo -> sem 2o e-mail.
- [ ] Trial expirado: `trial_ends_at = now() - interval '1 hour'` -> `trial-expirado` 1x.
- [ ] Billing: POST manual no `cakto-webhook` (secret valido) com payloads de
      `purchase_approved`, `subscription_renewal_refused`, `subscription_canceled`
      -> e-mails 6/7/8; webhook responde 200 mesmo com `RESEND_API_KEY` invalida;
      reenviar o mesmo evento -> nao duplica (`email_log`).
- [ ] mail-tester.com em 1 e-mail transacional -> score >= 8, SPF/DKIM/DMARC pass.

## Rollback
- Desligar o Send Email Hook -> Supabase volta ao template default do dashboard.
- `select cron.unschedule('trial_email_reminders');` para o cron.
- `drop trigger trg_email_confirmed_welcome on auth.users;` para boas-vindas.
- As Edge Functions podem ficar no ar (inertes sem o hook / sem o cron).
```

- [ ] **Step 2: Commit**

```bash
git add docs/EMAILS_RESEND_ROLLOUT.md
git commit -m "docs(emails): runbook de rollout do Resend"
```

---

## Self-Review

**1. Spec coverage:**
- Modulo compartilhado `_shared/emails/` -> Tasks 1, 2, 3. OK.
- 8 templates (encoding, logo hospedado, placeholders, texto boas-vindas) -> Task 2. OK.
- `email-hook` (Send Email Hook, verificacao de assinatura, URL de verify, pick de template, 500 no erro do Resend) -> Task 6. OK.
- `send-email` (bearer service_role, valida template, sempre 200) -> Task 5. OK.
- Tabela `email_log` + RLS fechada + dedupe -> Task 4. OK.
- Trigger boas-vindas em `auth.users.email_confirmed_at` -> Task 4. OK.
- Cron `trial_email_reminders` (3 e 1 dia + expirado com janela) -> Task 4. OK.
- Billing no `cakto-webhook` (confirmada / falha / cancelamento, fire-and-forget, nao derruba webhook) -> Task 7. OK.
- `AMOUNT` = preco do plano -> Task 7 (`plan-prices.ts`). OK.
- Rollout + QA + riscos -> Task 8 + notas nas tasks. OK.
- Risco `Deno.readTextFile` -> Task 2 Step 10 (fallback: se falhar no deploy do Supabase, converter os `.html` em `.ts` exportando string e ajustar `renderTemplate` para `import`; validado no primeiro `supabase functions deploy send-email`). OK.
- Risco `pg_net` -> Task 4 Step 1 (`create extension if not exists pg_net`). OK.
- Fallback SMTP se o hook nao existir -> Task 8 (nota no passo 5: se o Hook nao estiver disponivel, configurar Resend como SMTP em Authentication -> SMTP e colar `confirmacao-conta.html` / `recuperacao-senha.html` no dashboard trocando `{{CONFIRMATION_URL}}`/`{{USER_EMAIL}}` por `{{ .ConfirmationURL }}`/`{{ .Email }}`).

**Gap corrigido:** adicionar essa nota de fallback SMTP ao runbook (Task 8 Step 1) e a nota do fallback `.ts` ao Task 2 Step 10 (abaixo).

**2. Placeholder scan:** sem "TBD"/"TODO". Os blocos de codigo estao completos. `plan-prices.ts` usa valores reais de `src/config/planCatalog.ts`.

**3. Type consistency:** `SendDeps`/`SendOpts`/`SendResult` definidos no Task 3 e usados igual nos Tasks 5, 6, 7. `TemplateName` do Task 1 usado em 3/5/6/7. `buildSendDeps(supabase, { apiKey, from, replyTo })` mesma assinatura nos 3 consumidores. `enqueue_transactional_email(...)` (Task 4) so e chamado de dentro da propria migration. OK.

### Ajustes aplicados no proprio plano apos o self-review

- **Task 2, Step 10** — acrescentar ao final: "Se `supabase functions deploy send-email` (Task 5) falhar lendo os `.html` no runtime, converter cada template para `templates/<name>.ts` exportando `export default \`...\`;` e trocar em `render.ts` o `Deno.readTextFile` por um `import` estatico com `switch(name)`. Os testes estruturais passam a ler o `.ts` via regex no lugar do `.html`."
- **Task 8, Step 1** — acrescentar secao "## 0. Se o Send Email Hook nao existir no projeto": "Configurar Resend como SMTP em Authentication -> SMTP (host `smtp.resend.com`, port 465, user `resend`, pass = `RESEND_API_KEY`). Colar `confirmacao-conta.html` e `recuperacao-senha.html` em Authentication -> Email Templates, trocando `{{CONFIRMATION_URL}}` -> `{{ .ConfirmationURL }}` e `{{USER_EMAIL}}` -> `{{ .Email }}`. Pular os passos 4-5 para o `email-hook` (mas manter `send-email` para os transacionais)."
