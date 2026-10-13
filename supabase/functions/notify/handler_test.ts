import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleNotify, type NotifyDeps } from "./handler.ts";
import type { OpsEvent } from "../_shared/ops/types.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const event: OpsEvent = {
  id: ID,
  created_at: "2026-10-13T15:00:00.000Z",
  severity: "business",
  category: "signup",
  title: "Novo cadastro",
  detail: {},
  user_id: null,
  occurrences: 1,
};

function mkDeps(over: Partial<NotifyDeps> = {}) {
  const marked: string[] = [];
  const deps: NotifyDeps = {
    serviceKey: "svc-key",
    loadEvent: async (id) => (id === ID ? event : null),
    markNotified: async (id) => { marked.push(id); },
    deliver: async () => ({ discord: "sent", telegram: "sent", errors: [] }),
    ...over,
  };
  return { deps, marked };
}

const req = (body: unknown, token = "svc-key", raw?: string) =>
  new Request("https://x.test/notify", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });

Deno.test("sem Authorization válido: 401", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req({ event_id: ID }, "errado"), deps)).status, 401);
});

Deno.test("serviceKey vazia nunca autoriza (nem com token vazio)", async () => {
  const { deps } = mkDeps({ serviceKey: "" });
  assertEquals((await handleNotify(req({ event_id: ID }, ""), deps)).status, 401);
});

Deno.test("JSON inválido: 400", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req(null, "svc-key", "{nao-json"), deps)).status, 400);
});

Deno.test("event_id que não é UUID: 400", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req({ event_id: "1; drop table" }), deps)).status, 400);
});

Deno.test("evento inexistente: 404", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req({ event_id: "22222222-2222-4222-8222-222222222222" }), deps)).status, 404);
});

Deno.test("entrega ok: 200, marca notified_at e devolve o resultado", async () => {
  const { deps, marked } = mkDeps();
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  assertEquals((await res.json()).discord, "sent");
  assertEquals(marked, [ID]);
});

Deno.test("falha parcial: 200 e marca (algum canal entregou)", async () => {
  const { deps, marked } = mkDeps({
    deliver: async () => ({ discord: "sent", telegram: "failed", errors: ["telegram:http_500"] }),
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  assertEquals(marked, [ID]);
});

Deno.test("nada entregue (todos failed): 502 e NÃO marca", async () => {
  const { deps, marked } = mkDeps({
    deliver: async () => ({ discord: "failed", telegram: "failed", errors: ["discord:http_500", "telegram:http_500"] }),
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 502);
  assertEquals(marked, []);
});

Deno.test("deliver lança: 502, nunca propaga exceção", async () => {
  const { deps } = mkDeps({ deliver: async () => { throw new Error("kaboom"); } });
  assertEquals((await handleNotify(req({ event_id: ID }), deps)).status, 502);
});

Deno.test("nenhum canal configurado (skipped): 200 sem marcar", async () => {
  const { deps, marked } = mkDeps({
    deliver: async () => ({ discord: "skipped", telegram: "skipped", errors: [] }),
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  assertEquals(marked, []);
});

Deno.test("serviceKey vazia com token nao vazio: 401 (isola guarda serviceKey)", async () => {
  let loadEventCalled = false;
  let deliverCalled = false;
  const { deps } = mkDeps({
    serviceKey: "",
    loadEvent: async () => { loadEventCalled = true; return null; },
    deliver: async () => { deliverCalled = true; return { discord: "sent", telegram: "sent", errors: [] }; },
  });
  assertEquals((await handleNotify(req({ event_id: ID }, "x"), deps)).status, 401);
  assertEquals(loadEventCalled, false);
  assertEquals(deliverCalled, false);
});

Deno.test("sem header Authorization: 401", async () => {
  let loadEventCalled = false;
  let deliverCalled = false;
  const { deps } = mkDeps({
    loadEvent: async () => { loadEventCalled = true; return null; },
    deliver: async () => { deliverCalled = true; return { discord: "sent", telegram: "sent", errors: [] }; },
  });
  const noAuthReq = new Request("https://x.test/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: ID }),
  });
  assertEquals((await handleNotify(noAuthReq, deps)).status, 401);
  assertEquals(loadEventCalled, false);
  assertEquals(deliverCalled, false);
});

Deno.test("schema nao-Bearer (Basic abc): 401", async () => {
  let loadEventCalled = false;
  let deliverCalled = false;
  const { deps } = mkDeps({
    loadEvent: async () => { loadEventCalled = true; return null; },
    deliver: async () => { deliverCalled = true; return { discord: "sent", telegram: "sent", errors: [] }; },
  });
  const basicAuthReq = new Request("https://x.test/notify", {
    method: "POST",
    headers: { Authorization: "Basic abc", "Content-Type": "application/json" },
    body: JSON.stringify({ event_id: ID }),
  });
  assertEquals((await handleNotify(basicAuthReq, deps)).status, 401);
  assertEquals(loadEventCalled, false);
  assertEquals(deliverCalled, false);
});

Deno.test("JSON null/array/string valido: 400", async () => {
  const { deps } = mkDeps();
  assertEquals((await handleNotify(req(null, "svc-key", "null"), deps)).status, 400);
  assertEquals((await handleNotify(req(null, "svc-key", "[]"), deps)).status, 400);
  assertEquals((await handleNotify(req(null, "svc-key", '"str"'), deps)).status, 400);
});

Deno.test("loadEvent lancando: 502 com error load_failed, deliver nao chamado", async () => {
  let deliverCalled = false;
  const { deps } = mkDeps({
    loadEvent: async () => { throw new Error("db connection lost"); },
    deliver: async () => { deliverCalled = true; return { discord: "sent", telegram: "sent", errors: [] }; },
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 502);
  assertEquals((await res.json()).error, "load_failed");
  assertEquals(deliverCalled, false);
});

Deno.test("markNotified lancando apos entrega ok: ainda 200 com resultado", async () => {
  const { deps } = mkDeps({
    markNotified: async () => { throw new Error("db down"); },
  });
  const res = await handleNotify(req({ event_id: ID }), deps);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.discord, "sent");
  assertEquals(body.telegram, "sent");
});
