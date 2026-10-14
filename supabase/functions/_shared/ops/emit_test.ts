import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { emitOps, type RpcClient } from "./emit.ts";

function fakeClient(result: { error: { message: string } | null } | Error) {
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const client: RpcClient = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, calls };
}

Deno.test("emitOps chama ops_emit com os parâmetros certos e detalhe sanitizado", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, {
    severity: "business",
    category: "billing",
    title: "Venda aprovada",
    detail: { customer: "ana@x.com", api_key: "segredo" },
    userId: "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b",
    dedupeKey: "cakto:purchase_approved:abc",
  });
  assertEquals(calls.length, 1);
  assertEquals(calls[0].fn, "ops_emit");
  assertEquals(calls[0].args.p_severity, "business");
  assertEquals(calls[0].args.p_category, "billing");
  assertEquals(calls[0].args.p_title, "Venda aprovada");
  assertEquals(calls[0].args.p_user_id, "3f2b8c1e-9a4d-4e6f-8b1a-2c3d4e5f6a7b");
  assertEquals(calls[0].args.p_dedupe_key, "cakto:purchase_approved:abc");
  assertEquals(calls[0].args.p_detail, { customer: "ana@x.com", api_key: "[redigido]" });
});

Deno.test("emitOps usa defaults quando faltam campos opcionais", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, { severity: "info", category: "cron", title: "ok" });
  assertEquals(calls[0].args.p_detail, {});
  assertEquals(calls[0].args.p_user_id, null);
  assertEquals(calls[0].args.p_dedupe_key, null);
});

Deno.test("emitOps engole erro do RPC (fail-open)", async () => {
  const { client } = fakeClient({ error: { message: "db down" } });
  await emitOps(client, { severity: "error", category: "edge_error", title: "x" });
});

Deno.test("emitOps engole exceção lançada pelo cliente (fail-open)", async () => {
  const { client } = fakeClient(new Error("rede caiu"));
  await emitOps(client, { severity: "error", category: "edge_error", title: "x" });
});

Deno.test("emitOps corta título acima de 200 caracteres", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, { severity: "error", category: "edge_error", title: "t".repeat(500) });
  assertEquals((calls[0].args.p_title as string).length, 200);
});

Deno.test("emitOps remove tokens (Bearer) e mascara emails do titulo", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, {
    severity: "error",
    category: "edge_error",
    title: "Falha com Bearer abc123 de ana@x.com",
  });
  const title = calls[0].args.p_title as string;
  assertEquals(title.includes("abc123"), false);
  assertEquals(title.includes("a***@x.com"), true);
});

Deno.test("emitOps mantem e-mail completo no detalhe mas redige Bearer na mesma string", async () => {
  const { client, calls } = fakeClient({ error: null });
  await emitOps(client, {
    severity: "error",
    category: "edge_error",
    title: "x",
    detail: { erro: "falha para joao@x.com com Bearer abc123", email: "ana@x.com" },
  });
  const d = calls[0].args.p_detail as Record<string, string>;
  assertEquals(d.email, "ana@x.com");
  assertEquals(d.erro.includes("joao@x.com"), true);
  assertEquals(d.erro.includes("abc123"), false);
});
