import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  billingEventToOps,
  enrichWithSalesToday,
  invalidSecretToOps,
  requestInfoFromHeaders,
  shouldEmitInvalidSecret,
  webhookFailureToOps,
  webhookRecordFailureToOps,
} from "./ops.ts";

const UID = "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b";
const PAINEL = `https://admin.aflyo.com.br/users/${UID}`;

const FULL = {
  id: "ord_1",
  amount: 48.89,
  paymentMethod: "PIX",
  installments: 3,
  customer: { name: "Ana", email: "ana@x.com", phone: "+5511987654321" },
  metadata: { plan_code: "pro", billing_cycle: "monthly", supabase_user_id: UID },
  offer: { id: "off_1", name: "Pro mensal" },
};

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
  assertEquals((ev.detail as any).plano, "pro");
  assertEquals((ev.detail as any).ciclo, "monthly");
  assertEquals((ev.detail as any).valor, 48.89);
  assertEquals((ev.detail as any).oferta, "off_1");
  assertEquals((ev.detail as any).pedido, "ord_1");
  assertEquals((ev.detail as any).cliente_email, "ana@x.com");
});

Deno.test("refund e chargeback têm título próprio", () => {
  assertEquals(billingEventToOps("refund", { id: "o" })!.title, "Reembolso");
  assertEquals(billingEventToOps("chargeback", { id: "o" })!.title, "Chargeback");
  assertEquals(billingEventToOps("subscription_canceled", { id: "o" })!.title, "Assinatura cancelada");
});

Deno.test("todos os eventos mapeados mantêm título, severidade e categoria", () => {
  const titles: Record<string, string> = {
    purchase_approved: "Venda aprovada",
    purchase_refused: "Compra recusada",
    refund: "Reembolso",
    chargeback: "Chargeback",
    subscription_created: "Assinatura criada",
    subscription_canceled: "Assinatura cancelada",
    subscription_renewed: "Renovação paga",
    subscription_renewal_refused: "Renovação recusada",
  };
  for (const [e, title] of Object.entries(titles)) {
    const ev = billingEventToOps(e, FULL)!;
    assertEquals(ev.title, title);
    assertEquals(ev.severity, "business");
    assertEquals(ev.category, "billing");
    assertEquals((ev.detail as any).evento, e);
  }
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
  assertEquals((ev.detail as any).erro, "profiles by id: timeout");
  assertEquals((ev.detail as any).evento, "refund");
  assertEquals(
    (ev.detail as any).acao,
    "Verifique o webhook e reprocesse o evento em Cakto > Webhooks no painel admin",
  );
});

Deno.test("falha com valor não-Error vira string; evento ausente vira desconhecido", () => {
  const ev = webhookFailureToOps(undefined as unknown as string, "texto solto");
  assertEquals(ev.title, "Webhook Cakto falhou: desconhecido");
  assertEquals((ev.detail as any).erro, "texto solto");
  assertEquals((ev.detail as any).evento, "desconhecido");
});

Deno.test("falha do webhook com data carrega pedido, cliente, plano, painel e userId", () => {
  const ev = webhookFailureToOps("refund", new Error("x"), {
    id: "ord_9",
    customer: { name: "Ana", email: "ana@x.com" },
    metadata: { plan_code: "pro", supabase_user_id: UID },
  });
  assertEquals((ev.detail as any).pedido, "ord_9");
  assertEquals((ev.detail as any).cliente_nome, "Ana");
  assertEquals((ev.detail as any).cliente_email, "ana@x.com");
  assertEquals((ev.detail as any).plano, "pro");
  assertEquals((ev.detail as any).painel, PAINEL);
  assertEquals(ev.userId, UID);
  assertEquals(ev.dedupeKey, undefined);
  assertEquals(ev.title, "Webhook Cakto falhou: refund");
});

Deno.test("falha do webhook sem data ou com data vazio funciona e userId é null", () => {
  assertEquals(webhookFailureToOps("refund", new Error("x"), undefined).userId, null);
  const ev = webhookFailureToOps("refund", new Error("x"), {});
  assertEquals(ev.userId, null);
  assertEquals((ev.detail as any).pedido, undefined);
  assertEquals((ev.detail as any).cliente_email, undefined);
  assertEquals((ev.detail as any).plano, undefined);
  assertEquals((ev.detail as any).painel, undefined);
});

Deno.test("falha do webhook com supabase_user_id não UUID gera userId null", () => {
  const ev = webhookFailureToOps("refund", new Error("x"), { id: "o", metadata: { supabase_user_id: "'; drop" } });
  assertEquals(ev.userId, null);
  assertEquals((ev.detail as any).painel, undefined);
});

Deno.test("recusas não têm dedupeKey (agregam); aprovada tem", () => {
  assertEquals(billingEventToOps("purchase_refused", { id: "o1" })!.dedupeKey, undefined);
  assertEquals(billingEventToOps("subscription_renewal_refused", { id: "o2" })!.dedupeKey, undefined);
  assertEquals(billingEventToOps("purchase_approved", { id: "o3" })!.dedupeKey, "cakto:purchase_approved:o3");
});

Deno.test("secret inválido é error/security", () => {
  const ev = invalidSecretToOps();
  assertEquals(ev.severity, "error");
  assertEquals(ev.category, "security");
  assert(ev.title.includes("secret"));
  assertEquals((ev.detail as any).rota, "/cakto-webhook");
  assertEquals((ev.detail as any).ip, undefined);
});

Deno.test("secret inválido carrega ip, país e user-agent (truncado a 120)", () => {
  const ev = invalidSecretToOps({ ip: "203.0.113.9", pais: "BR", userAgent: "u".repeat(300) });
  assertEquals((ev.detail as any).ip, "203.0.113.9");
  assertEquals((ev.detail as any).pais, "BR");
  assertEquals((ev.detail as any).user_agent.length, 120);
  assertEquals(ev.title, "Webhook Cakto com secret inválido");
  assertEquals(ev.severity, "error");
  assertEquals(ev.category, "security");
});

Deno.test("requestInfoFromHeaders: cf-connecting-ip tem prioridade, depois x-forwarded-for", () => {
  const h = new Headers({
    "cf-connecting-ip": "203.0.113.9",
    "x-forwarded-for": "10.0.0.1, 10.0.0.2",
    "cf-ipcountry": "BR",
    "user-agent": "Cakto/1.0",
  });
  assertEquals(requestInfoFromHeaders(h), { ip: "203.0.113.9", pais: "BR", userAgent: "Cakto/1.0" });
  const h2 = new Headers({ "x-forwarded-for": " 10.0.0.1 , 10.0.0.2" });
  assertEquals(requestInfoFromHeaders(h2), { ip: "10.0.0.1", pais: null, userAgent: null });
  assertEquals(requestInfoFromHeaders(new Headers()), { ip: null, pais: null, userAgent: null });
  assertEquals(requestInfoFromHeaders(undefined), { ip: null, pais: null, userAgent: null });
  const throwing = {
    get: (): string | null => {
      throw new Error("x");
    },
  };
  assertEquals(requestInfoFromHeaders(throwing), { ip: null, pais: null, userAgent: null });
});

Deno.test("cobrança carrega os campos ricos e painel com UUID válido", () => {
  const d = billingEventToOps("purchase_approved", FULL)!.detail as any;
  assertEquals(d, {
    evento: "purchase_approved",
    plano: "pro",
    ciclo: "monthly",
    valor: 48.89,
    forma_pagamento: "pix",
    parcelas: 3,
    pedido: "ord_1",
    oferta: "Pro mensal",
    cliente_nome: "Ana",
    cliente_email: "ana@x.com",
    cliente_telefone: "+5511987654321",
    acesso: "liberado, bot retomado",
    painel: PAINEL,
  });
});

Deno.test("acesso por evento", () => {
  const acesso = (e: string) => (billingEventToOps(e, { id: "o" })!.detail as any).acesso;
  assertEquals(acesso("purchase_approved"), "liberado, bot retomado");
  assertEquals(acesso("refund"), "revogado e bot pausado");
  assertEquals(acesso("chargeback"), "revogado e bot pausado");
  assertEquals(acesso("subscription_canceled"), "cancelamento marcado; acesso segue até o fim do período");
  assertEquals(acesso("subscription_created"), "assinatura criada");
  assertEquals(acesso("subscription_renewed"), "renovação paga, acesso mantido");
  assertEquals(acesso("purchase_refused"), "sem alteração de acesso");
  assertEquals(acesso("subscription_renewal_refused"), "sem alteração de acesso");
});

Deno.test("variações de grafia: payment_method, metadata.installments, refusedReason, reason", () => {
  const a = billingEventToOps("purchase_refused", {
    id: "o",
    payment_method: "credit_card",
    metadata: { installments: "2" },
    refusedReason: { description: "cartão sem limite" },
  })!.detail as any;
  assertEquals(a.forma_pagamento, "credit_card");
  assertEquals(a.parcelas, 2);
  assertEquals(a.motivo, "cartão sem limite");
  const b = billingEventToOps("refund", { id: "o", reason: "pediu reembolso" })!.detail as any;
  assertEquals(b.motivo, "pediu reembolso");
  const c = billingEventToOps("purchase_refused", { id: "o", refusedReason: "insufficient_funds" })!.detail as any;
  assertEquals(c.motivo, "insufficient_funds");
});

Deno.test("payload incompleto ou com tipos errados nunca lança e só leva o essencial", () => {
  const bads: unknown[] = [
    {},
    null,
    undefined,
    "x",
    42,
    [],
    { customer: "ana", metadata: 5, offer: [], amount: {}, installments: "abc" },
  ];
  for (const bad of bads) {
    for (const e of ["purchase_approved", "refund", "subscription_renewal_refused"]) {
      const ev = billingEventToOps(e, bad)!;
      assertEquals(typeof (ev.detail as any).evento, "string");
      assertEquals((ev.detail as any).painel, undefined);
      assertEquals((ev.detail as any).valor, undefined);
      assertEquals(ev.userId, null);
    }
    const f = webhookFailureToOps("refund", new Error("x"), bad);
    assertEquals(f.severity, "critical");
    assertEquals((f.detail as any).evento, "refund");
  }
  assertEquals(billingEventToOps("purchase_approved", {})!.detail, {
    evento: "purchase_approved",
    acesso: "liberado, bot retomado",
  });
});

Deno.test("painel só existe com supabase_user_id UUID", () => {
  const withBad = billingEventToOps("refund", { id: "o", metadata: { supabase_user_id: "../x" } })!;
  assertEquals((withBad.detail as any).painel, undefined);
  const withGood = billingEventToOps("refund", { id: "o", metadata: { supabase_user_id: UID } })!;
  assertEquals((withGood.detail as any).painel, PAINEL);
});

Deno.test("e-mail e telefone do cliente ficam completos", () => {
  const d = billingEventToOps("refund", FULL)!.detail as any;
  assertEquals(d.cliente_email, "ana@x.com");
  assertEquals(d.cliente_telefone, "+5511987654321");
});

// ---------- enrichWithSalesToday ----------

function baseEv() {
  return billingEventToOps("purchase_approved", { id: "ord_9", amount: 47.9, metadata: { supabase_user_id: UID } })!;
}

Deno.test("enrichWithSalesToday acrescenta vendas_hoje e faturamento_hoje", async () => {
  const ev = baseEv();
  const out = await enrichWithSalesToday(
    { rpc: (fn) => { assertEquals(fn, "ops_sales_today"); return Promise.resolve({ data: { vendas: 3, faturamento: 143.7 }, error: null }); } },
    ev,
  );
  assertEquals((out.detail as any).vendas_hoje, 3);
  assertEquals((out.detail as any).faturamento_hoje, 143.7);
  assertEquals((out.detail as any).valor, 47.9);
  assertEquals(out.dedupeKey, ev.dedupeKey);
});

Deno.test("enrichWithSalesToday devolve o evento intacto quando a RPC retorna erro", async () => {
  const ev = baseEv();
  const out = await enrichWithSalesToday(
    { rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }) },
    ev,
  );
  assert(out === ev);
  assertEquals("vendas_hoje" in (out.detail as any), false);
});

Deno.test("enrichWithSalesToday engole excecao lancada pelo cliente", async () => {
  const ev = baseEv();
  const out = await enrichWithSalesToday({ rpc: () => { throw new Error("rede"); } }, ev);
  assert(out === ev);
  const out2 = await enrichWithSalesToday({ rpc: () => Promise.reject(new Error("rede")) }, ev);
  assert(out2 === ev);
});

Deno.test("enrichWithSalesToday ignora formato inesperado", async () => {
  const ev = baseEv();
  for (const data of [null, "x", 5, [], {}, { vendas: "a", faturamento: 1 }, { vendas: 1 }, { vendas: 1, faturamento: null }]) {
    const out = await enrichWithSalesToday({ rpc: () => Promise.resolve({ data, error: null }) }, ev);
    assert(out === ev);
  }
});

Deno.test("enrichWithSalesToday nao muta o objeto de entrada", async () => {
  const ev = baseEv();
  const snapshot = JSON.stringify(ev);
  const out = await enrichWithSalesToday(
    { rpc: () => Promise.resolve({ data: { vendas: 1, faturamento: 47.9 }, error: null }) },
    ev,
  );
  assert(out !== ev);
  assertEquals(JSON.stringify(ev), snapshot);
  assertEquals("vendas_hoje" in (ev.detail as any), false);
});

Deno.test("webhookRecordFailureToOps: critical billing com evento, pedido e erro", () => {
  const ev = webhookRecordFailureToOps(
    { event: "purchase_approved", secret: "nao-vazar", data: { id: "ord_9", customer: { email: "a@x.com" } } },
    new Error("db fora"),
  );
  assertEquals(ev.severity, "critical");
  assertEquals(ev.category, "billing");
  assertEquals(ev.title, "Webhook Cakto não gravou o evento");
  assertEquals(ev.detail, { evento: "purchase_approved", pedido: "ord_9", erro: "db fora" });
});

Deno.test("webhookRecordFailureToOps: payload invalido nao lanca", () => {
  const ev = webhookRecordFailureToOps(null, "falhou");
  assertEquals(ev.detail, { evento: "desconhecido", erro: "falhou" });
});

Deno.test("shouldEmitInvalidSecret: libera na 1a, bloqueia em 60 s, libera depois", () => {
  const state = { last: 0 };
  assertEquals(shouldEmitInvalidSecret(1_000_000, state), true);
  assertEquals(shouldEmitInvalidSecret(1_030_000, state), false);
  assertEquals(shouldEmitInvalidSecret(1_059_999, state), false);
  assertEquals(shouldEmitInvalidSecret(1_060_000, state), true);
  assertEquals(shouldEmitInvalidSecret(1_061_000, state), false);
});

Deno.test("enrichWithSalesToday: estouro do teto devolve o evento sem vendas do dia", async () => {
  const ev = { severity: "business", category: "billing", title: "Venda aprovada", detail: { a: 1 } } as any;
  const never = { rpc: () => new Promise(() => {}) } as any;
  const t = Date.now();
  const out = await enrichWithSalesToday(never, ev, 50);
  assertEquals(out, ev);
  assert(Date.now() - t < 500);
});

Deno.test("enrichWithSalesToday: resposta rapida ainda enriquece", async () => {
  const ev = { severity: "business", category: "billing", title: "Venda", detail: {} } as any;
  const ok = { rpc: () => Promise.resolve({ data: { vendas: 2, faturamento: 10 }, error: null }) } as any;
  const out = await enrichWithSalesToday(ok, ev, 500);
  assertEquals(out.detail, { vendas_hoje: 2, faturamento_hoje: 10 });
});

Deno.test("falhas leem message de objeto simples e toleram objeto sem prototipo", () => {
  assertEquals(webhookRecordFailureToOps({ event: "x" }, { message: "pg fora" }).detail?.erro, "pg fora");
  assertEquals(webhookFailureToOps("x", Object.create(null)).detail?.erro, "erro desconhecido");
});
