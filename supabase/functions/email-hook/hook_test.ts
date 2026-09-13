// supabase/functions/email-hook/hook_test.ts
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildConfirmationUrl, pickTemplate, handleEmailHook, verifyHookSignature } from "./index.ts";

Deno.test("pickTemplate mapeia signup/recovery; desconhecido -> null", () => {
  assertEquals(pickTemplate("signup"), "confirmacao-conta");
  assertEquals(pickTemplate("recovery"), "recuperacao-senha");
  assertEquals(pickTemplate("magiclink"), null);
  assertEquals(pickTemplate("email_change"), null);
  assertEquals(pickTemplate("invite"), null);
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

Deno.test("email_action_type nao suportado -> 500 e NAO chama send", async () => {
  const secretRaw = "segredo";
  const body = JSON.stringify({
    user: { email: "a@b.c" },
    email_data: { token_hash: "th", email_action_type: "email_change" },
  });
  const { signBodyForTest } = await import("./index.ts");
  const sig = await signBodyForTest("whsec_" + btoa(secretRaw), "id1", "1700000000", body);
  const req = new Request("https://x", {
    method: "POST",
    body,
    headers: { "webhook-signature": sig, "webhook-id": "id1", "webhook-timestamp": "1700000000" },
  });
  let sendCalled = false;
  const r = await handleEmailHook(req, {
    hookSecret: "whsec_" + btoa(secretRaw),
    supabaseUrl: "https://proj.supabase.co",
    appUrl: "https://app.aflyo.com.br",
    send: async () => { sendCalled = true; return { status: "sent" as const }; },
  });
  assertEquals(r.status, 500);
  assertEquals(sendCalled, false);
  assertStringIncludes(JSON.stringify(await r.json()), "email_action_type nao suportado: email_change");
});

// Vetor canonico do Standard Webhooks / Svix: prova que verifyHookSignature bate
// contra uma assinatura gerada EXTERNAMENTE (o teste de round-trip nao pega bug
// de encoding porque compartilha hmacB64 com o verificador).
Deno.test("verifyHookSignature: vetor conhecido do Svix", async () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const body = '{"test": 2432232314}';
  const mkHeaders = () =>
    new Headers({
      "webhook-id": "msg_p5jXN8AQM9LWM0D4loKWxJek",
      "webhook-timestamp": "1614265330",
      "webhook-signature": "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=",
    });
  assertEquals(await verifyHookSignature(body, mkHeaders(), secret), true);
  // corpo adulterado -> assinatura nao bate
  assertEquals(await verifyHookSignature('{"test": 9999999999}', mkHeaders(), secret), false);
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
