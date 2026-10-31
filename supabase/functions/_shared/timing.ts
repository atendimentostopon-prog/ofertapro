// SEC-7: comparação constante em tempo. Faz SHA-256 dos dois lados (sempre
// 32 bytes) antes de comparar byte a byte, então difere no tempo só quando
// os hashes diferem -- nunca vaza o comprimento nem o prefixo do secret.
export async function timingSafeEqual(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const ua = new Uint8Array(ha);
  const ub = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < ua.length; i++) diff |= ua[i] ^ ub[i];
  return diff === 0;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Chamada entre Edge Functions: Bearer <service_role> + x-aflyo-user-id.
// Devolve o user id só quando o token é a service role e o id é um UUID.
export async function internalUserId(token: string, headerUserId: string | null, serviceKey: string): Promise<string | null> {
  if (!serviceKey || !token || !headerUserId || !UUID_RE.test(headerUserId)) return null;
  return (await timingSafeEqual(token, serviceKey)) ? headerUserId : null;
}
