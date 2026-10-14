// supabase/functions/_shared/instagram/connect_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideCompletion } from "./connect.ts";

const base = {
  existing: null,
  userId: "U1",
  ownAccountCount: 0,
  maxAccounts: 1,
  allowInstagram: true,
  hasAccess: true,
};

Deno.test("conta nova com folga: insert", () => {
  assertEquals(decideCompletion(base), "insert");
});

Deno.test("sem acesso ou plano sem módulo", () => {
  assertEquals(decideCompletion({ ...base, hasAccess: false }), "not_allowed");
  assertEquals(decideCompletion({ ...base, allowInstagram: false }), "not_allowed");
});

Deno.test("conta nova no limite do plano", () => {
  assertEquals(decideCompletion({ ...base, ownAccountCount: 1, maxAccounts: 1 }), "limit");
});

Deno.test("reconectar conta própria já contada (connected/needs_reconnect) não consome limite", () => {
  for (const status of ["connected", "needs_reconnect"] as const) {
    assertEquals(
      decideCompletion({ ...base, existing: { userId: "U1", status }, ownAccountCount: 1, maxAccounts: 1 }),
      "update_own",
    );
  }
});

Deno.test("reconectar conta própria desconectada respeita o limite", () => {
  const existing = { userId: "U1", status: "disconnected" as const };
  assertEquals(decideCompletion({ ...base, existing, ownAccountCount: 1, maxAccounts: 1 }), "limit");
  assertEquals(decideCompletion({ ...base, existing, ownAccountCount: 0, maxAccounts: 1 }), "update_own");
});

Deno.test("conta conectada de outro usuário: in_use (sequestro)", () => {
  assertEquals(decideCompletion({ ...base, existing: { userId: "U2", status: "connected" } }), "in_use");
  assertEquals(decideCompletion({ ...base, existing: { userId: "U2", status: "needs_reconnect" } }), "in_use");
});

Deno.test("conta desconectada de outro usuário: assume, respeitando o limite", () => {
  assertEquals(decideCompletion({ ...base, existing: { userId: "U2", status: "disconnected" } }), "replace_disconnected");
  assertEquals(
    decideCompletion({ ...base, existing: { userId: "U2", status: "disconnected" }, ownAccountCount: 1 }),
    "limit",
  );
});

Deno.test("acesso negado vence qualquer outra regra", () => {
  assertEquals(
    decideCompletion({ ...base, hasAccess: false, existing: { userId: "U2", status: "connected" } }),
    "not_allowed",
  );
});
