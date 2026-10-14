import { b64urlDecode, b64urlEncode, hmacSha256, timingSafeEqualBytes } from "./signature.ts";

const DEFAULT_TTL_MS = 10 * 60 * 1000;

export async function signState(
  uid: string,
  secret: string,
  nowMs: number = Date.now(),
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<string> {
  const payload = b64urlEncode(JSON.stringify({ uid, exp: nowMs + ttlMs, n: crypto.randomUUID() }));
  const sig = b64urlEncode(await hmacSha256(secret, payload));
  return `${payload}.${sig}`;
}

/** Devolve o uid se o state é autêntico e não expirou; senão null. */
export async function verifyState(
  token: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const expected = await hmacSha256(secret, parts[0]);
    if (!timingSafeEqualBytes(expected, b64urlDecode(parts[1]))) return null;
    const data = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (typeof data.uid !== "string" || typeof data.exp !== "number") return null;
    if (nowMs > data.exp) return null;
    return data.uid;
  } catch {
    return null;
  }
}
