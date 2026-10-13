// supabase/functions/_shared/instagram/connect_test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideConnect } from "./connect.ts";

const base = { existingOwnerId: null, userId: "U1", ownAccountCount: 0, maxAccounts: 1, allowInstagram: true, hasAccess: true };

Deno.test("conecta quando tudo permite", () => {
  assertEquals(decideConnect(base), "ok");
});

Deno.test("sem acesso ou plano sem módulo", () => {
  assertEquals(decideConnect({ ...base, hasAccess: false }), "not_allowed");
  assertEquals(decideConnect({ ...base, allowInstagram: false }), "not_allowed");
});

Deno.test("conta já pertence a outro usuário", () => {
  assertEquals(decideConnect({ ...base, existingOwnerId: "U2" }), "in_use");
});

Deno.test("reconectar a própria conta não conta contra o limite", () => {
  assertEquals(decideConnect({ ...base, existingOwnerId: "U1", ownAccountCount: 1, maxAccounts: 1 }), "ok");
});

Deno.test("limite de contas do plano", () => {
  assertEquals(decideConnect({ ...base, ownAccountCount: 1, maxAccounts: 1 }), "limit");
});
