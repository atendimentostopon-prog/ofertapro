import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  b64urlDecode, b64urlEncode, hmacSha256, parseSignedRequest, timingSafeEqualBytes, toHex, verifyMetaSignature,
} from "./signature.ts";

const SECRET = "app-secret-de-teste";

async function sigHeader(body: string): Promise<string> {
  return `sha256=${toHex(await hmacSha256(SECRET, body))}`;
}

Deno.test("verifyMetaSignature aceita assinatura correta", async () => {
  const body = '{"object":"instagram","entry":[]}';
  assert(await verifyMetaSignature(body, await sigHeader(body), SECRET));
});

Deno.test("verifyMetaSignature rejeita corpo alterado, header vazio, formato errado e secret vazio", async () => {
  const body = '{"a":1}';
  const good = await sigHeader(body);
  assertFalse(await verifyMetaSignature('{"a":2}', good, SECRET));
  assertFalse(await verifyMetaSignature(body, "", SECRET));
  assertFalse(await verifyMetaSignature(body, "sha1=abc", SECRET));
  assertFalse(await verifyMetaSignature(body, good, ""));
});

Deno.test("b64url faz ida e volta", () => {
  const raw = "olá mundo ✓";
  assertEquals(new TextDecoder().decode(b64urlDecode(b64urlEncode(raw))), raw);
  assertFalse(b64urlEncode(new Uint8Array([251, 255, 254])).includes("+"));
});

Deno.test("timingSafeEqualBytes", () => {
  assert(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2])));
  assertFalse(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])));
  assertFalse(timingSafeEqualBytes(new Uint8Array([1, 2]), new Uint8Array([1])));
});

Deno.test("parseSignedRequest valida e devolve o payload", async () => {
  const payload = b64urlEncode(JSON.stringify({ user_id: "1789", algorithm: "HMAC-SHA256" }));
  const sig = b64urlEncode(await hmacSha256(SECRET, payload));
  const parsed = await parseSignedRequest(`${sig}.${payload}`, SECRET);
  assertEquals(parsed?.user_id, "1789");
});

Deno.test("parseSignedRequest rejeita assinatura inválida e lixo", async () => {
  const payload = b64urlEncode(JSON.stringify({ user_id: "1" }));
  assertEquals(await parseSignedRequest(`AAAA.${payload}`, SECRET), null);
  assertEquals(await parseSignedRequest("sem-ponto", SECRET), null);
  assertEquals(await parseSignedRequest("", SECRET), null);
});
