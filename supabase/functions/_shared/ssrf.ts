// Guarda anti-SSRF compartilhada (extraída de enrich-product, SEC-8).
// Use antes de qualquer fetch de URL vinda de usuário ou de mensagem, e em cada hop de redirect.

// =====================================================================
// SEC-8 — Guarda anti-SSRF
// =====================================================================
// A validação antiga (`hostname.startsWith('192.168.')` etc.) era furada:
// dava bypass com IP decimal (http://2130706433), octal, hex e com
// IPv4-mapeado em IPv6 (::ffff:169.254.169.254). Agora: valida protocolo,
// normaliza formas numéricas de IPv4, resolve DNS e recusa QUALQUER
// endereço em faixa privada / loopback / link-local / ULA / CGNAT /
// metadata de cloud (169.254.169.254). Roda antes do fetch inicial e de
// cada hop de redirect.

function isBlockedIpv4(ip: string): boolean {
  const p = ip.split('.').map((n) => Number(n))
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true
  const [a, b] = p
  if (a === 0) return true                          // 0.0.0.0/8
  if (a === 10) return true                         // 10/8
  if (a === 127) return true                        // loopback
  if (a === 169 && b === 254) return true           // link-local + 169.254.169.254 (metadata)
  if (a === 172 && b >= 16 && b <= 31) return true  // 172.16/12
  if (a === 192 && b === 168) return true           // 192.168/16
  if (a === 192 && b === 0 && p[2] === 0) return true // 192.0.0/24
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 (CGNAT)
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18/15 (benchmark)
  if (a >= 224) return true                         // multicast / reservado
  return false
}

function isBlockedIp(ipRaw: string): boolean {
  const ip = ipRaw.toLowerCase().trim()
  // IPv4-mapeado em IPv6: ::ffff:a.b.c.d
  const mapped = ip.match(/^(?:::ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
  if (mapped) return isBlockedIpv4(mapped[1])
  // IPv4-mapeado em hex: ::ffff:a9fe:a9fe
  const mappedHex = ip.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16)
    const lo = parseInt(mappedHex[2], 16)
    return isBlockedIpv4([(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join('.'))
  }
  if (ip.includes(':')) {
    if (ip === '::1' || ip === '::') return true
    const emb = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)
    if (emb) return isBlockedIpv4(emb[1])
    const first = parseInt(ip.split(':')[0] || '0', 16) || 0
    if ((first & 0xfe00) === 0xfc00) return true   // fc00::/7 (ULA)
    if ((first & 0xffc0) === 0xfe80) return true   // fe80::/10 (link-local)
    return false
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return isBlockedIpv4(ip)
  return true // forma desconhecida => bloqueia
}

// Converte http://2130706433, http://0x7f.1, http://0177.0.0.1, etc. em
// IPv4 pontilhado. Retorna null quando é um hostname comum.
function parseNumericIpv4(host: string): string | null {
  const parts = host.split('.')
  if (parts.length === 0 || parts.length > 4) return null
  const nums: number[] = []
  for (const part of parts) {
    if (part === '') return null
    let n: number
    if (/^0x[0-9a-f]+$/i.test(part)) n = parseInt(part, 16)
    else if (/^0[0-7]+$/.test(part)) n = parseInt(part, 8)
    else if (/^[0-9]+$/.test(part)) n = parseInt(part, 10)
    else return null
    if (!Number.isFinite(n) || n < 0) return null
    nums.push(n)
  }
  let value: number
  if (nums.length === 1) value = nums[0]
  else if (nums.length === 2) value = nums[0] * 2 ** 24 + nums[1]
  else if (nums.length === 3) value = nums[0] * 2 ** 24 + nums[1] * 2 ** 16 + nums[2]
  else value = nums[0] * 2 ** 24 + nums[1] * 2 ** 16 + nums[2] * 2 ** 8 + nums[3]
  if (value < 0 || value > 0xffffffff) return null
  return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255].join('.')
}

export async function assertPublicUrl(raw: string): Promise<void> {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    throw new Error('URL inválida.')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Protocolo não permitido (apenas http/https).')
  }
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host) throw new Error('Host ausente na URL.')
  if (/(^|\.)(localhost|local|internal|localdomain)$/.test(host) || host === 'metadata.google.internal') {
    throw new Error('Acesso a hosts internos não é permitido.')
  }

  const candidates: string[] = []
  const numericV4 = parseNumericIpv4(host)
  if (numericV4) {
    candidates.push(numericV4)
  } else if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    candidates.push(host)
  } else if (typeof (Deno as any).resolveDns === 'function') {
    const [aRes, aaaaRes] = await Promise.allSettled([
      (Deno as any).resolveDns(host, 'A'),
      (Deno as any).resolveDns(host, 'AAAA'),
    ])
    if (aRes.status === 'fulfilled') candidates.push(...aRes.value)
    if (aaaaRes.status === 'fulfilled') candidates.push(...aaaaRes.value)
    if (candidates.length === 0) throw new Error('Não foi possível resolver o host.')
  } else {
    // Runtime sem Deno.resolveDns: sem checagem de DNS-rebinding. As demais
    // barreiras (IP literal/numérico, localhost/.local/.internal, metadata)
    // continuam ativas.
    console.warn('[ssrf] Deno.resolveDns indisponível — checagem SSRF parcial.')
  }

  for (const ip of candidates) {
    if (isBlockedIp(ip)) {
      throw new Error('Destino aponta para um endereço de rede interna. Bloqueado.')
    }
  }
}
