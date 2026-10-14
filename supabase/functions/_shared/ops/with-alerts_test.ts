import { assertEquals, assertStrictEquals, assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { withAlerts } from "./with-alerts.ts";
import type { EmitInput, RpcClient } from "./emit.ts";

const client: RpcClient = { rpc: () => Promise.resolve({ error: null }) };

function setup(opts: { critical?: boolean; timeoutMs?: number; slow?: boolean; throws?: boolean } = {}) {
  const calls: EmitInput[] = [];
  const emit = async (_c: RpcClient, input: EmitInput) => {
    calls.push(input);
    if (opts.throws) throw new Error("emit quebrou");
    if (opts.slow) await new Promise((r) => setTimeout(r, 2000));
  };
  return { calls, o: { getClient: () => client, emit, critical: opts.critical, timeoutMs: opts.timeoutMs } };
}

const req = () => new Request("https://x.test/fn/rota?token=abc", { method: "POST", headers: { Authorization: "Bearer segredo" } });

Deno.test("sem alerta em 200/401/404", async () => {
  for (const status of [200, 401, 404]) {
    const { calls, o } = setup();
    const res = await withAlerts("f", () => new Response("x", { status }), o)(req());
    assertEquals(res.status, status);
    assertEquals(calls.length, 0);
  }
});

Deno.test("alerta em 500 retornado, mesmo objeto Response e corpo nao consumido", async () => {
  const { calls, o } = setup();
  const original = new Response("falhou", { status: 502 });
  const res = await withAlerts("f", () => original, o)(req());
  assertStrictEquals(res, original);
  assertEquals(original.bodyUsed, false);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].severity, "error");
  assertEquals(calls[0].category, "edge_error");
  assertEquals(calls[0].title, "Function f respondeu 502");
});

Deno.test("excecao: alerta e relanca o mesmo objeto de erro", async () => {
  const { calls, o } = setup({ critical: true });
  const err = new TypeError("boom");
  const caught = await assertRejects(() => withAlerts("f", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].severity, "critical");
  assertEquals(calls[0].title, "Erro na function f");
  assertEquals(calls[0].detail, { funcao: "f", metodo: "POST", rota: "/fn/rota", erro: "boom", tipo: "TypeError" });
});

Deno.test("detail sem query string nem cabecalho", async () => {
  const { calls, o } = setup();
  await withAlerts("f", () => new Response("x", { status: 500 }), o)(req());
  const s = JSON.stringify(calls[0]);
  assertEquals(s.includes("abc"), false);
  assertEquals(s.includes("segredo"), false);
  assertEquals(s.includes("Authorization"), false);
});

Deno.test("emissao lenta nao segura a resposta alem do teto", async () => {
  const { o } = setup({ slow: true, timeoutMs: 50 });
  const t = Date.now();
  await withAlerts("f", () => new Response("x", { status: 500 }), o)(req());
  assertEquals(Date.now() - t < 1000, true);
});

Deno.test("emissao que lanca nao afeta resposta nem excecao", async () => {
  const { o } = setup({ throws: true });
  const original = new Response("x", { status: 500 });
  assertStrictEquals(await withAlerts("f", () => original, o)(req()), original);
  const err = new Error("orig");
  const caught = await assertRejects(() => withAlerts("f", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
});

Deno.test("AbortError nao emite e relanca", async () => {
  const { calls, o } = setup();
  const err = new DOMException("abortado", "AbortError");
  const caught = await assertRejects(() => withAlerts("f", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
  assertEquals(calls.length, 0);
});
