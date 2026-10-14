import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextRunAt, runWorker } from "./worker.ts";
import type { GraphClient } from "./graph.ts";
import type { Store } from "./types.ts";

Deno.test("nextRunAt: backoff exponencial com teto de 1h", () => {
  const now = new Date("2026-10-13T12:00:00Z");
  assertEquals(nextRunAt(1, now).toISOString(), "2026-10-13T12:02:00.000Z");
  assertEquals(nextRunAt(3, now).toISOString(), "2026-10-13T12:08:00.000Z");
  assertEquals(nextRunAt(20, now).toISOString(), "2026-10-13T13:00:00.000Z");
});

function fakeAdmin(events: Array<Record<string, unknown>>) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  const admin = {
    rpc: async (_fn: string, _args: unknown) => ({ data: events, error: null }),
    from: (_t: string) => ({
      update: (patch: Record<string, unknown>) => ({
        eq: async (_col: string, id: string) => { updates.push({ id, patch }); return { error: null }; },
      }),
    }),
  };
  return { admin, updates };
}

const comment = { igUserId: "IG1", commentId: "C1", mediaId: "M1", fromId: "U1", fromUsername: "a", text: "x", parentId: null, timestamp: 1 };

Deno.test("worker grava done quando o motor termina", async () => {
  const { admin, updates } = fakeAdmin([{ id: "E1", attempts: 1, payload: comment }]);
  const store = { findAccountByIgUserId: async () => null } as unknown as Store;
  const graph = {} as GraphClient;
  const r = await runWorker({ admin, store, graph }, 10);
  assertEquals(r.processed, 1);
  assertEquals(updates[0].id, "E1");
  assertEquals(updates[0].patch.status, "ignored");
});

Deno.test("worker reagenda retry e dá up após 5 tentativas", async () => {
  const store = {
    findAccountByIgUserId: async () => ({ id: "A", user_id: "U", ig_user_id: "IG1", status: "connected" }),
    listActiveAutomations: async () => [{
      id: "AU", user_id: "U", ig_account_id: "A", target_scope: "any_media", media_id: null, match_mode: "any",
      keywords: [], exclude_keywords: [], public_replies: [], dm_text: "oi", link_url: null,
      once_per_contact: false, created_at: "2026-10-01T00:00:00Z",
    }],
    getAccess: async () => ({ hasAccess: true, allowInstagram: true, maxDmsMonth: 10 }),
    upsertContact: async () => "C",
    wasAlreadySentToContact: async () => false,
    getToken: async () => "T",
    claimMessage: async () => true,
    consumeDmQuota: async () => true,
    refundDmQuota: async () => {},
    releaseMessage: async () => {},
    finishMessage: async () => {},
    markAccountNeedsReconnect: async () => {},
  } as unknown as Store;
  const graph: GraphClient = {
    sendPrivateReply: async () => ({ ok: false, kind: "rate_limit", code: 4, message: "x" }),
    replyToComment: async () => ({ ok: true, data: { id: null } }),
  };

  const first = fakeAdmin([{ id: "E1", attempts: 2, payload: comment }]);
  await runWorker({ admin: first.admin, store, graph }, 10);
  assertEquals(first.updates[0].patch.status, "pending");
  assertEquals(typeof first.updates[0].patch.run_at, "string");

  const last = fakeAdmin([{ id: "E2", attempts: 5, payload: comment }]);
  await runWorker({ admin: last.admin, store, graph }, 10);
  assertEquals(last.updates[0].patch.status, "failed");
});

Deno.test("exceção inesperada no motor vira retry, nunca derruba o lote", async () => {
  const store = { findAccountByIgUserId: async () => { throw new Error("db fora"); } } as unknown as Store;
  const { admin, updates } = fakeAdmin([
    { id: "E1", attempts: 1, payload: comment },
    { id: "E2", attempts: 1, payload: comment },
  ]);
  const r = await runWorker({ admin, store, graph: {} as GraphClient }, 10);
  assertEquals(r.processed, 2);
  assertEquals(updates.length, 2);
  assertEquals(updates[0].patch.status, "pending");
});
