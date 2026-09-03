// supabase/functions/send-email/send_email_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleSendEmail } from "./index.ts";
import type { SendOpts, SendResult } from "../_shared/emails/send.ts";

const KEY = "svc_test_key";
function deps(sendImpl: (opts: SendOpts) => Promise<SendResult> = async () => ({ status: "sent" as const, resendId: "re_1" })) {
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
