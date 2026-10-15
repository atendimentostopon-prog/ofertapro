import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { type EvolutionProbe, handleSync, type InstancePatch, type SyncDeps, type SyncInstance } from "./handler.ts";

const KEY = "service-role-secret";
const API_KEY = "evo-api-key-xyz";

function req(opts: { method?: string; auth?: string | null; body?: string } = {}): Request {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const auth = opts.auth === undefined ? `Bearer ${KEY}` : opts.auth;
  if (auth !== null) headers["Authorization"] = auth;
  return new Request("https://x.test/evolution-status-sync", {
    method: opts.method ?? "POST",
    headers,
    body: opts.method === "GET" ? undefined : (opts.body ?? "{}"),
  });
}

interface Calls {
  updates: { id: string; patch: InstancePatch }[];
  channels: { id: string; status: string }[];
  probes: string[];
  sleeps: number[];
  listLimit: number[];
}

function mk(
  instances: SyncInstance[],
  answers: Record<string, (EvolutionProbe | Error)[]>,
  over: Partial<SyncDeps> = {},
): { deps: SyncDeps; calls: Calls } {
  const calls: Calls = { updates: [], channels: [], probes: [], sleeps: [], listLimit: [] };
  const idx: Record<string, number> = {};
  const deps: SyncDeps = {
    serviceKey: KEY,
    listInstances: (limit) => {
      calls.listLimit.push(limit);
      return Promise.resolve(instances);
    },
    probe: (name) => {
      calls.probes.push(name);
      const seq = answers[name] ?? [{ http: 200, state: "open" }];
      const i = idx[name] ?? 0;
      idx[name] = i + 1;
      const a = seq[Math.min(i, seq.length - 1)];
      if (a instanceof Error) return Promise.reject(a);
      return Promise.resolve(a);
    },
    updateInstance: (id, patch) => {
      calls.updates.push({ id, patch });
      return Promise.resolve();
    },
    syncChannels: (id, status) => {
      calls.channels.push({ id, status });
      return Promise.resolve();
    },
    sleep: (ms) => {
      calls.sleeps.push(ms);
      return Promise.resolve();
    },
    now: () => "2026-10-15T12:00:00.000Z",
    ...over,
  };
  return { deps, calls };
}

const inst = (n: number, status: string): SyncInstance => ({
  id: `${String(n).padStart(8, "0")}-aaaa-bbbb-cccc-dddddddddddd`,
  instance_name: `inst_${n}`,
  status,
});

async function run(deps: SyncDeps, r: Request = req()) {
  const res = await handleSync(r, deps);
  return { res, body: await res.json() };
}

Deno.test("open em instancia desconectada => connected, limpa erro e qr e espelha canais", async () => {
  const i = inst(1, "disconnected");
  const { deps, calls } = mk([i], { inst_1: [{ http: 200, state: "open" }] });
  const { res, body } = await run(deps);
  assertEquals(res.status, 200);
  assertEquals(body.dry_run, false);
  assertEquals(body.verificadas, 1);
  assertEquals(body.mudancas, [{ instancia: "00000001", de: "disconnected", para: "connected" }]);
  assertEquals(calls.updates.length, 1);
  assertEquals(calls.updates[0].patch, {
    status: "connected",
    last_sync_at: "2026-10-15T12:00:00.000Z",
    connected_at: "2026-10-15T12:00:00.000Z",
    error_message: null,
    qr_code: null,
  });
  assertEquals(calls.channels, [{ id: i.id, status: "connected" }]);
});

Deno.test("close confirmado => disconnected com disconnected_at e espelha canais", async () => {
  const i = inst(2, "connected");
  const { deps, calls } = mk([i], { inst_2: [{ http: 200, state: "close" }, { http: 200, state: "close" }] });
  const { body } = await run(deps);
  assertEquals(calls.probes.length, 2);
  assertEquals(calls.sleeps, [3000]);
  assertEquals(body.mudancas, [{ instancia: "00000002", de: "connected", para: "disconnected" }]);
  assertEquals(calls.updates[0].patch, {
    status: "disconnected",
    last_sync_at: "2026-10-15T12:00:00.000Z",
    disconnected_at: "2026-10-15T12:00:00.000Z",
  });
  assertEquals(calls.channels, [{ id: i.id, status: "disconnected" }]);
});

Deno.test("close seguido de open na confirmacao => nenhuma mudanca e nenhuma escrita", async () => {
  const { deps, calls } = mk([inst(3, "connected")], { inst_3: [{ http: 200, state: "close" }, { http: 200, state: "open" }] });
  const { body } = await run(deps);
  assertEquals(body.sem_mudanca, 1);
  assertEquals(body.mudancas, []);
  assertEquals(calls.updates.length, 0);
  assertEquals(calls.channels.length, 0);
});

Deno.test("close seguido de falha 5xx na confirmacao => inconclusiva, sem escrita", async () => {
  const { deps, calls } = mk([inst(3, "connected")], { inst_3: [{ http: 200, state: "close" }, { http: 503 }] });
  const { body } = await run(deps);
  assertEquals(body.inconclusivas, 1);
  assertEquals(calls.updates.length, 0);
});

Deno.test("404 => disconnected sem precisar de confirmacao", async () => {
  const { deps, calls } = mk([inst(4, "connected")], { inst_4: [{ http: 404 }] });
  const { body } = await run(deps);
  assertEquals(calls.probes.length, 1);
  assertEquals(body.mudancas, [{ instancia: "00000004", de: "connected", para: "disconnected" }]);
  assertEquals(calls.updates[0].patch.status, "disconnected");
});

Deno.test("5xx, 401 e erro de rede sao inconclusivos e nao escrevem", async () => {
  const list = [inst(5, "connected"), inst(6, "connected"), inst(7, "connected"), inst(8, "connected")];
  const { deps, calls } = mk(list, {
    inst_5: [{ http: 500 }],
    inst_6: [{ http: 401 }],
    inst_7: [new Error("network down")],
    inst_8: [new DOMException("timeout", "TimeoutError")],
  });
  const { body } = await run(deps);
  assertEquals(body.verificadas, 4);
  assertEquals(body.inconclusivas, 4);
  assertEquals(body.mudancas, []);
  assertEquals(calls.updates.length, 0);
  assertEquals(calls.channels.length, 0);
});

Deno.test("connecting nao muda nada", async () => {
  const { deps, calls } = mk([inst(9, "connected")], { inst_9: [{ http: 200, state: "connecting" }] });
  const { body } = await run(deps);
  assertEquals(body.sem_mudanca, 1);
  assertEquals(calls.updates.length, 0);
});

Deno.test("conclusiva sem mudanca so atualiza last_sync_at", async () => {
  const i = inst(10, "connected");
  const { deps, calls } = mk([i], { inst_10: [{ http: 200, state: "open" }] });
  const { body } = await run(deps);
  assertEquals(body.sem_mudanca, 1);
  assertEquals(calls.updates, [{ id: i.id, patch: { last_sync_at: "2026-10-15T12:00:00.000Z" } }]);
  assertEquals(calls.channels.length, 0);
});

Deno.test("erro de limite de plano em uma linha nao interrompe as demais", async () => {
  const a = inst(11, "disconnected");
  const b = inst(12, "disconnected");
  const { deps, calls } = mk([a, b], { inst_11: [{ http: 200, state: "open" }], inst_12: [{ http: 200, state: "open" }] }, {
    updateInstance: (id, patch) => {
      calls.updates.push({ id, patch });
      if (id === a.id) return Promise.reject({ code: "23514", message: "limite de instancias excedido" });
      return Promise.resolve();
    },
  });
  const { res, body } = await run(deps);
  assertEquals(res.status, 200);
  assertEquals(body.erros, 1);
  assertEquals(body.erros_detalhe, [{ instancia: "00000011", motivo: "limite_de_plano" }]);
  assertEquals(body.mudancas, [{ instancia: "00000012", de: "disconnected", para: "connected" }]);
  assertEquals(calls.channels, [{ id: b.id, status: "connected" }]);
});

Deno.test("dry_run nao escreve nada mas lista as mudancas", async () => {
  const list = [inst(13, "connected"), inst(14, "connected")];
  const { deps, calls } = mk(list, { inst_13: [{ http: 404 }], inst_14: [{ http: 200, state: "open" }] });
  const { body } = await run(deps, req({ body: '{"dry_run":true}' }));
  assertEquals(body.dry_run, true);
  assertEquals(body.mudancas, [{ instancia: "00000013", de: "connected", para: "disconnected" }]);
  assertEquals(body.sem_mudanca, 1);
  assertEquals(calls.updates.length, 0);
  assertEquals(calls.channels.length, 0);
});

Deno.test("falha no espelho de canais nao aborta a execucao", async () => {
  const list = [inst(15, "disconnected"), inst(16, "disconnected")];
  const { deps, calls } = mk(list, {}, { syncChannels: () => Promise.reject(new Error("boom")) });
  const { body } = await run(deps);
  assertEquals(body.erros, 0);
  assertEquals(body.mudancas.length, 2);
  assertEquals(calls.updates.length, 2);
});

Deno.test("auth: ausente, errada e chave configurada vazia => 401", async () => {
  const { deps } = mk([inst(1, "connected")], {});
  assertEquals((await handleSync(req({ auth: null }), deps)).status, 401);
  assertEquals((await handleSync(req({ auth: "Bearer outra" }), deps)).status, 401);
  const empty = mk([], {}, { serviceKey: "" });
  assertEquals((await handleSync(req({ auth: "Bearer " }), empty.deps)).status, 401);
  assertEquals((await handleSync(req({ auth: "Bearer x" }), empty.deps)).status, 401);
  assertEquals(empty.calls.listLimit.length, 0);
});

Deno.test("metodo diferente de POST => 405", async () => {
  const { deps } = mk([], {});
  assertEquals((await handleSync(req({ method: "GET" }), deps)).status, 405);
});

Deno.test("corpo JSON invalido ou nao objeto vira {} sem 500", async () => {
  for (const b of ["{nao json", "[1,2]", "42", ""]) {
    const { deps } = mk([inst(1, "connected")], {});
    const { res, body } = await run(deps, req({ body: b }));
    assertEquals(res.status, 200);
    assertEquals(body.dry_run, false);
  }
});

Deno.test("limite de 100 instancias por execucao", async () => {
  const many = Array.from({ length: 130 }, (_, n) => inst(n, "connected"));
  const { deps, calls } = mk(many, {});
  const { body } = await run(deps);
  assertEquals(calls.listLimit, [100]);
  assertEquals(body.verificadas, 100);
});

Deno.test("resposta nunca carrega a chave da API nem URL", async () => {
  const { deps } = mk([inst(1, "connected"), inst(2, "connected")], {
    inst_1: [new Error(`falha com ${API_KEY} em https://evo.example.com`)],
    inst_2: [{ http: 404 }],
  });
  const res = await handleSync(req(), deps);
  const text = await res.text();
  assert(!text.includes(API_KEY));
  assert(!text.includes("evo.example.com"));
  assert(!text.includes(KEY));
});
