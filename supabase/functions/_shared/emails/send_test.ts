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
