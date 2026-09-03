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
    { sendImpl: async (opts) => { captured = opts as unknown as Record<string, unknown>; return { status: "sent" as const }; } },
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
