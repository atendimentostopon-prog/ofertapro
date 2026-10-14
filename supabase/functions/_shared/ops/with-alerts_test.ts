import { assertEquals, assertRejects, assertStrictEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { withAlerts, type AlertsOpts } from "./with-alerts.ts";
import type { EmitInput, RpcClient } from "./emit.ts";

const client: RpcClient = { rpc: () => Promise.resolve({ error: null }) };

function setup(opts: AlertsOpts & { slow?: boolean; throws?: boolean } = {}) {
  const calls: EmitInput[] = [];
  const emit = async (_c: RpcClient, input: EmitInput) => {
    calls.push(input);
    if (opts.throws) throw new Error("emit quebrou");
    if (opts.slow) await new Promise((r) => setTimeout(r, 300));
  };
  const { slow: _s, throws: _t, ...rest } = opts;
  // waitUntil: null por padrao nos testes (fallback com espera), salvo se informado.
  return { calls, o: { getClient: () => client, emit, waitUntil: null, ...rest } as AlertsOpts };
}

const req = () =>
  new Request("https://x.test/fn/rota?token=abc", { method: "POST", headers: { Authorization: "Bearer segredo" } });

Deno.test("sem alerta em 200/401/404", async () => {
  for (const status of [200, 401, 404]) {
    const { calls, o } = setup();
    const res = await withAlerts("f", () => new Response("x", { status }), o)(req());
    assertEquals(res.status, status);
    assertEquals(calls.length, 0);
  }
});

Deno.test("alerta em 5xx, mesmo objeto Response e corpo nao consumido", async () => {
  const { calls, o } = setup();
  const original = new Response("falhou", { status: 502 });
  const res = await withAlerts("f", () => original, o)(req());
  assertStrictEquals(res, original);
  assertEquals(original.bodyUsed, false);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].severity, "error");
  assertEquals(calls[0].title, "Function f respondeu 502");
});

Deno.test("critical vale tambem para resposta 5xx", async () => {
  const { calls, o } = setup({ critical: true });
  await withAlerts("f", () => new Response("x", { status: 500 }), o)(req());
  assertEquals(calls[0].severity, "critical");
});

Deno.test("excecao: alerta e relanca o mesmo objeto de erro", async () => {
  const { calls, o } = setup({ critical: true });
  const err = new TypeError("boom");
  const caught = await assertRejects(() => withAlerts("f", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
  assertEquals(calls[0].severity, "critical");
  assertEquals(calls[0].title, "Erro na function f");
  assertEquals(calls[0].detail, { funcao: "f", metodo: "POST", rota: "/fn/rota", erro: "boom", tipo: "TypeError" });
});

Deno.test("detail sem query string nem cabecalho", async () => {
  const { calls, o } = setup();
  await withAlerts("f", () => new Response("x", { status: 500 }), o)(req());
  const s = JSON.stringify(calls[0]);
  for (const bad of ["abc", "segredo", "Authorization"]) assertEquals(s.includes(bad), false);
});

Deno.test("fallback sem waitUntil respeita o teto", async () => {
  const { o } = setup({ slow: true, timeoutMs: 50 });
  const t = Date.now();
  await withAlerts("f", () => new Response("x", { status: 500 }), o)(req());
  const dt = Date.now() - t;
  assertEquals(dt >= 40 && dt < 250, true);
});

Deno.test("com waitUntil a resposta volta antes da emissao terminar", async () => {
  const pending: Promise<unknown>[] = [];
  const { o } = setup({ slow: true, waitUntil: (p) => pending.push(p) });
  const t = Date.now();
  await withAlerts("f", () => new Response("x", { status: 500 }), o)(req());
  assertEquals(Date.now() - t < 150, true);
  assertEquals(pending.length, 1);
  await Promise.all(pending);
});

Deno.test("emissao que lanca nao afeta resposta nem excecao", async () => {
  const { o } = setup({ throws: true });
  const original = new Response("x", { status: 500 });
  assertStrictEquals(await withAlerts("f", () => original, o)(req()), original);
  const err = new Error("orig");
  const caught = await assertRejects(() => withAlerts("g", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
});

Deno.test("AbortError nao emite e relanca", async () => {
  const { calls, o } = setup();
  const err = new DOMException("abortado", "AbortError");
  const caught = await assertRejects(() => withAlerts("f", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
  assertEquals(calls.length, 0);
});

Deno.test("throttle: 1 emissao por tipo a cada 10 s, sem RPC para descartados", async () => {
  let t = 1_000_000;
  const { calls, o } = setup({ now: () => t });
  const w = withAlerts("f", () => new Response("x", { status: 500 }), o);
  await w(req());
  t += 5_000;
  await w(req());
  assertEquals(calls.length, 1);
  const wErr = withAlerts("f", () => Promise.reject(new Error("e")), o);
  await assertRejects(() => wErr(req()));
  assertEquals(calls.length, 2); // tipo diferente nao e afetado
  t += 10_000;
  await w(req());
  assertEquals(calls.length, 3);
});

Deno.test("resposta nao 5xx nao consome o throttle", async () => {
  const { calls, o } = setup({ now: () => 1_000 });
  let status = 200;
  const w = withAlerts("f", () => new Response("x", { status }), o);
  await w(req());
  status = 500;
  await w(req());
  assertEquals(calls.length, 1);
});

Deno.test("cliente padrao e criado uma unica vez", async () => {
  let created = 0;
  const { calls, o } = setup({ throttleMs: 0, getClient: () => (created++, client) });
  const w = withAlerts("f", () => new Response("x", { status: 500 }), o);
  await w(req());
  await w(req());
  assertEquals(calls.length, 2);
  assertEquals(created, 1);
});

Deno.test("erro sem prototipo: relanca o original, sem lancar novo erro", async () => {
  const { calls, o } = setup();
  const err = Object.create(null);
  const caught = await assertRejects(() => withAlerts("f", () => Promise.reject(err), o)(req()));
  assertStrictEquals(caught, err);
  assertEquals(calls.length, 1);
});

Deno.test("erro objeto simples com message", async () => {
  const { calls, o } = setup();
  await assertRejects(() => withAlerts("f", () => Promise.reject({ message: "x" }), o)(req()));
  assertEquals((calls[0].detail as Record<string, unknown>).erro, "x");
});

Deno.test("handler devolvendo undefined: devolve como esta, sem emitir", async () => {
  const { calls, o } = setup();
  // deno-lint-ignore no-explicit-any
  const res = await withAlerts("f", (() => undefined) as any, o)(req());
  assertEquals(res, undefined);
  assertEquals(calls.length, 0);
});
