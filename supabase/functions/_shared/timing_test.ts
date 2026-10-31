import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { internalUserId, timingSafeEqual } from "./timing.ts";

Deno.test("timingSafeEqual compara conteúdo", async () => {
  assertEquals(await timingSafeEqual("abc", "abc"), true);
  assertEquals(await timingSafeEqual("abc", "abd"), false);
  assertEquals(await timingSafeEqual("", "x"), false);
});

const U = "3f1c2b4a-1111-4222-8333-444455556666";
Deno.test("internalUserId só aceita service role + uuid", async () => {
  assertEquals(await internalUserId("svc", U, "svc"), U);
  assertEquals(await internalUserId("outro", U, "svc"), null);
  assertEquals(await internalUserId("svc", "nao-uuid", "svc"), null);
  assertEquals(await internalUserId("svc", null, "svc"), null);
  assertEquals(await internalUserId("", U, ""), null); // service key ausente nunca libera
});
