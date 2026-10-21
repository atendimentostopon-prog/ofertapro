import { assertRejects } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { assertPublicUrl } from "./ssrf.ts";

Deno.test("bloqueia loopback, IP decimal, metadata e protocolo não http", async () => {
  await assertRejects(() => assertPublicUrl("http://127.0.0.1/x"));
  await assertRejects(() => assertPublicUrl("http://2130706433/"));
  await assertRejects(() => assertPublicUrl("http://169.254.169.254/latest"));
  await assertRejects(() => assertPublicUrl("http://[::ffff:169.254.169.254]/"));
  await assertRejects(() => assertPublicUrl("ftp://example.com/"));
  await assertRejects(() => assertPublicUrl("http://localhost/"));
});

Deno.test("aceita IP público literal", async () => {
  await assertPublicUrl("https://1.1.1.1/");
});
