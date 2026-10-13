import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { billingEventToOps, invalidSecretToOps, webhookFailureToOps } from "./ops.ts";

const UID = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";

Deno.test("purchase_approved vira business/billing com dedupeKey estável", () => {
  const ev = billingEventToOps("purchase_approved", {
    id: "ord_1",
    amount: 48.89,
    customer: { email: "ana@x.com" },
    metadata: { plan_code: "pro", billing_cycle: "monthly", supabase_user_id: UID },
    offer: { id: "off_1" },
  })!;
  assertEquals(ev.severity, "business");
  assertEquals(ev.category, "billing");
  assertEquals(ev.title, "Venda aprovada");
  assertEquals(ev.userId, UID);
  assertEquals(ev.dedupeKey, "cakto:purchase_approved:ord_1");
  assertEquals((ev.detail as any).plan, "pro");
  assertEquals((ev.detail as any).amount, 48.89);
});

Deno.test("refund e chargeback têm título próprio", () => {
  assertEquals(billingEventToOps("refund", { id: "o" })!.title, "Reembolso");
  assertEquals(billingEventToOps("chargeback", { id: "o" })!.title, "Chargeback");
  assertEquals(billingEventToOps("subscription_canceled", { id: "o" })!.title, "Assinatura cancelada");
});

Deno.test("evento não tratado devolve null", () => {
  assertEquals(billingEventToOps("evento_estranho", { id: "o" }), null);
});

Deno.test("payload incompleto não lança (sem id, metadata, customer)", () => {
  const ev = billingEventToOps("purchase_approved", {})!;
  assertEquals(ev.dedupeKey, undefined);
  assertEquals(ev.userId, null);
  billingEventToOps("refund", undefined);
  billingEventToOps("refund", null);
});

Deno.test("supabase_user_id que não é UUID é ignorado", () => {
  const ev = billingEventToOps("refund", { id: "o", metadata: { supabase_user_id: "'; drop" } })!;
  assertEquals(ev.userId, null);
});

Deno.test("falha do webhook é critical e carrega o nome do evento e a mensagem", () => {
  const ev = webhookFailureToOps("refund", new Error("profiles by id: timeout"));
  assertEquals(ev.severity, "critical");
  assertEquals(ev.category, "billing");
  assertEquals(ev.title, "Webhook Cakto falhou: refund");
  assertEquals((ev.detail as any).error, "profiles by id: timeout");
});

Deno.test("falha com valor não-Error vira string; evento ausente vira desconhecido", () => {
  const ev = webhookFailureToOps(undefined as unknown as string, "texto solto");
  assertEquals(ev.title, "Webhook Cakto falhou: desconhecido");
  assertEquals((ev.detail as any).error, "texto solto");
});

Deno.test("secret inválido é error/security", () => {
  const ev = invalidSecretToOps();
  assertEquals(ev.severity, "error");
  assertEquals(ev.category, "security");
  assert(ev.title.includes("secret"));
});
