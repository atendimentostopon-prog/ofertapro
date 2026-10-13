import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signState, verifyState } from "./state.ts";

const SECRET = "state-secret-de-teste";

Deno.test("state válido devolve o uid", async () => {
  const t = await signState("user-1", SECRET, 1_000_000);
  assertEquals(await verifyState(t, SECRET, 1_000_500), "user-1");
});

Deno.test("state expirado é rejeitado", async () => {
  const t = await signState("user-1", SECRET, 1_000_000, 600_000);
  assertEquals(await verifyState(t, SECRET, 1_000_000 + 600_001), null);
});

Deno.test("state adulterado ou com outro secret é rejeitado", async () => {
  const t = await signState("user-1", SECRET, 1_000_000);
  const [payload, sig] = t.split(".");
  assertEquals(await verifyState(`${payload}x.${sig}`, SECRET, 1_000_100), null);
  assertEquals(await verifyState(t, "outro-secret", 1_000_100), null);
  assertEquals(await verifyState("lixo", SECRET, 1_000_100), null);
});
