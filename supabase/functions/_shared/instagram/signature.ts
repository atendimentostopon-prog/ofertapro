const enc = new TextEncoder();

export async function hmacSha256(secret: string, msg: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export function toHex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function b64urlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Header `X-Hub-Signature-256: sha256=<hex>` sobre o corpo cru. */
export async function verifyMetaSignature(
  rawBody: string,
  header: string,
  appSecret: string,
): Promise<boolean> {
  if (!appSecret || !header) return false;
  const m = /^sha256=([0-9a-f]{64})$/i.exec(header.trim());
  if (!m) return false;
  const expected = toHex(await hmacSha256(appSecret, rawBody));
  return timingSafeEqualBytes(enc.encode(expected), enc.encode(m[1].toLowerCase()));
}

/** `signed_request` dos callbacks de exclusao/desautorizacao: <sig>.<payload>. */
export async function parseSignedRequest(
  signed: string,
  appSecret: string,
): Promise<Record<string, unknown> | null> {
  if (!signed || !appSecret) return null;
  const parts = signed.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const expected = await hmacSha256(appSecret, parts[1]);
    if (!timingSafeEqualBytes(expected, b64urlDecode(parts[0]))) return null;
    return JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    return null;
  }
}
