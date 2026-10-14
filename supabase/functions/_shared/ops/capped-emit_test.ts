import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { createCappedEmitter } from "./capped-emit.ts";
import type { EmitInput, RpcClient } from "./emit.ts";

const client: RpcClient = { rpc: () => Promise.resolve({ error: null }) };
const ev: EmitInput = { severity: "error", category: "edge_error", title: "t" };

Deno.test("capped emitter: nao aguarda com waitUntil e cria o cliente uma vez", async () => {
  let created = 0;
  let done = 0;
  const pending: Promise<unknown>[] = [];
  const emit = async () => {
    await new Promise((r) => setTimeout(r, 100));
    done++;
  };
  const e = createCappedEmitter({
    getClient: () => (created++, client),
    emit,
    waitUntil: (p) => pending.push(p),
  });
  await e(ev);
  await e(ev);
  assertEquals(done, 0);
  await Promise.all(pending);
  assertEquals(done, 2);
  assertEquals(created, 1);
});

Deno.test("capped emitter: sem waitUntil respeita o teto e nunca lanca", async () => {
  const slow = createCappedEmitter({
    getClient: () => client,
    emit: () => new Promise(() => {}),
    waitUntil: null,
    timeoutMs: 30,
  });
  await slow(ev);
  const broken = createCappedEmitter({
    getClient: () => {
      throw new Error("sem cliente");
    },
    waitUntil: null,
  });
  await broken(ev);
});
