// Deno Edge Function: supabase/functions/enrich-product/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

async function assertPublicUrl(raw: string): Promise<void> {
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
    console.warn('[enrich-product] Deno.resolveDns indisponível — checagem SSRF parcial.')
  }

  for (const ip of candidates) {
    if (isBlockedIp(ip)) {
      throw new Error('Destino aponta para um endereço de rede interna. Bloqueado.')
    }
  }
}

function normalizeProductTitle(
  rawTitle: string,
  rawDescription?: string,
  marketplace?: string
): string {
  if (!rawTitle) return '';
  
  let title = String(rawTitle).trim();
  
  // 1. Remover excesso de emojis no título (especialmente no início e fim)
  title = title.replace(/^[\s🔥⚡💎🎁🚀🎟️💰🛒📢👉✅❌🚨🛒✨🎉⚠️🔴📌🥇]*\s*/, '');
  title = title.replace(/\s*[🔥⚡💎🎁🚀🎟️💰🛒📢👉✅❌🚨🛒✨🎉⚠️🔴📌🥇\s]*$/, '');

  // 2. Remover frases de marketing / chamadas criativas comuns
  const marketingPhrases = [
    /^(?:prepare-se\s+para|cozinhe\s+como|economize|compre\s+j[áa]|aproveite|garanta\s+o\s+seu|n[ãa]o\s+perca|oferta\s+imperd[íi]vel|promo[çc][ãa]o\s+imperd[íi]vel|compre\s+agora|leia\s+mais|clique\s+e\s+confira|confira\s+esta\s+oferta|imperd[íi]vel|corre\s+para\s+ver|desconto\s+exclusivo|pre[çc]o\s+imbat[íi]vel|olha\s+esse\s+desconto)\s*[:!,-]?\s*/i
  ];

  for (const pattern of marketingPhrases) {
    title = title.replace(pattern, '');
  }

  // 3. Remover padrões de marketplace com categorias no final
  const marketplaceCategoryPatterns = [
    /\s*[:\-|•–—]\s*Amazon\.com\.br\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Mercado\s*Livre\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Shopee\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Magalu\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*Magazine\s*Luiza\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
    /\s*[:\-|•–—]\s*AliExpress\s*[:\-|•–—]\s*[^:\-|•–—]+$/i,
  ];

  for (const pattern of marketplaceCategoryPatterns) {
    title = title.replace(pattern, '');
  }

  // 4. Remover sufixos simples de marketplaces
  const suffixes = [
    /\s*[-|•–—:]*\s*Amazon\.com\.br\s*$/i,
    /\s*[-|•–—:]*\s*Amazon\s*$/i,
    /\s*[-|•–—:]*\s*Mercado\s*Livre\s*$/i,
    /\s*[-|•–—:]*\s*Shopee\s*$/i,
    /\s*[-|•–—:]*\s*Magalu\s*$/i,
    /\s*[-|•–—:]*\s*Magazine\s*Luiza\s*$/i,
    /\s*[-|•–—:]*\s*AliExpress\s*$/i,
    /\s*[-|•–—:]*\s*Compre\s*agora\s*$/i,
    /\s*[-|•–—:]*\s*Oferta\s*$/i,
    /\s*[-|•–—:]*\s*Promo[çc][ãa]o\s*$/i,
    /\s*[-|•–—:]*\s*Pre[çc]o\s*baixo\s*$/i,
  ];

  for (const suffixPattern of suffixes) {
    title = title.replace(suffixPattern, '');
  }

  // 5. Remover categorias soltas no final (ex: ": Cozinha")
  title = title.replace(/\s*:\s+[\w\sçãõáéíóúâêôàüÇÃÕÁÉÍÓÚÂÊÔÀÜ&]{1,30}$/, '');

  // 6. Limpar espaços e pontuação residual no fim do título
  title = title.replace(/\s*[-|•–—,;:]\s*$/, '').trim();

  // 7. Limpar espaços duplos
  title = title.replace(/\s{2,}/g, ' ').trim();

  // 8. Limitar a 120 caracteres de forma segura
  if (title.length > 120) {
    title = title.substring(0, 117) + '...';
  }

  return title;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Sem isso, qualquer um na internet usa este endpoint como proxy anônimo
  // de scraping (custo/DoS) e como vetor de SSRF gratuito. Só usuários
  // logados chamam isso hoje (fluxo de criar oferta, atrás de /offers no
  // ProtectedRoute), então exigir sessão real não quebra nada.
  const authHeader = req.headers.get('Authorization') ?? ''
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } }
  )
  const { data: { user } } = await supabaseClient.auth.getUser()
  if (!user) {
    return new Response(
      JSON.stringify({ success: false, error: 'Não autorizado.' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const { url, action, provider = 'none' } = await req.json()
    if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL inválida ou ausente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // SEC-8: recusa já na entrada URLs que resolvem para rede interna.
    if (action !== 'shorten') {
      try {
        await assertPublicUrl(url)
      } catch (ssrfErr: any) {
        return new Response(
          JSON.stringify({ success: false, error: ssrfErr?.message || 'URL não permitida.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Encurtamento por terceiro foi REMOVIDO do produto (nada de is.gd /
    // tinyurl). O único encurtador é o próprio (aflyo.com.br/o/<code>),
    // montado na hora do disparo. Mantém a ação só pra não quebrar callers
    // antigos: devolve a URL original sem tocar em serviço externo.
    // (Bitly opcional: só age se BITLY_ACCESS_TOKEN estiver setado E o caller
    //  pedir provider:'bitly' explicitamente.)
    if (action === 'shorten') {
      let shortUrl = url;
      let usedProvider: string = 'none';

      const bitlyToken = Deno.env.get('BITLY_ACCESS_TOKEN');
      if (provider === 'bitly' && bitlyToken) {
        try {
          const res = await fetch('https://api-ssl.bitly.com/v4/shorten', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${bitlyToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ long_url: url })
          });
          if (res.ok) {
            const data = await res.json();
            if (data.link) {
              shortUrl = data.link;
              usedProvider = 'bitly';
            }
          }
        } catch (err) {
          console.warn('Erro na chamada do Bitly (mantendo URL original):', err);
        }
      }

      return new Response(JSON.stringify({ success: true, shortUrl, provider: usedProvider }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Resolver redirects (encurtadores)
    let targetUrl = url
    let redirectsCount = 0
    const maxRedirects = 5

    try {
      while (redirectsCount < maxRedirects) {
        // SEC-8: revalida (DNS + faixas internas) a CADA hop, antes de sair.
        await assertPublicUrl(targetUrl)

        const headRes = await fetch(targetUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        })

        const location = headRes.headers.get('location')
        if (location && (headRes.status >= 300 && headRes.status < 400)) {
          const resolvedLocation = /^https?:\/\//i.test(location)
            ? location
            : new URL(location, targetUrl).toString()
          // Valida o destino do redirect ANTES de adotá-lo.
          await assertPublicUrl(resolvedLocation)
          targetUrl = resolvedLocation
          redirectsCount++
        } else {
          break
        }
      }
    } catch (redirectErr: any) {
      // Se um hop apontou pra rede interna, aborta -- não cai no fetch final.
      if (/rede interna|Protocolo não permitido|hosts internos|resolver o host/i.test(redirectErr?.message || '')) {
        return new Response(
          JSON.stringify({ success: false, error: redirectErr.message }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      console.warn("Erro ao resolver redirects:", redirectErr.message)
    }

    // 2. Fazer fetch na URL resolvida com limite de tempo
    // SEC-8: última checagem + redirect:'manual' pra não seguir um 3xx
    // tardio pra host interno.
    await assertPublicUrl(targetUrl)
    const response = await fetch(targetUrl, {
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) {
      throw new Error(`Falha ao buscar página: Status HTTP ${response.status}`)
    }

    const htmlText = await response.text()
    
    // 3. Detectar o Marketplace
    const detectMarketplace = (urlStr: string): string | undefined => {
      const u = urlStr.toLowerCase()
      if (u.includes('amazon.com.br') || u.includes('amazon.com') || u.includes('amzn.to')) return 'amazon'
      if (u.includes('mercadolivre.com.br') || u.includes('mercadolivre.com') || u.includes('produto.mercadolivre.com.br')) return 'mercadolivre'
      if (u.includes('shopee.com.br') || u.includes('shope.ee')) return 'shopee'
      if (u.includes('magalu.com') || u.includes('magazineluiza.com.br')) return 'magalu'
      if (u.includes('aliexpress.com') || u.includes('click.aliexpress.com')) return 'aliexpress'
      return undefined
    }
    const marketplace = detectMarketplace(targetUrl) || detectMarketplace(url)

    // 4. Extrair metadados via regex
    const extractMeta = (html: string, nameOrProp: string): string | undefined => {
      const regexes = [
        new RegExp(`<meta[^>]*property=["'](?:og:${nameOrProp})["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["'](?:og:${nameOrProp})["']`, 'i'),
        new RegExp(`<meta[^>]*name=["'](?:${nameOrProp})["'][^>]*content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*name=["'](?:${nameOrProp})["']`, 'i'),
      ]
      for (const regex of regexes) {
        const match = html.match(regex)
        if (match && match[1]) {
          return match[1]
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
        }
      }
      return undefined
    }

    const title = extractMeta(htmlText, 'title') || extractMeta(htmlText, 'twitter:title') || (() => {
      const titleMatch = htmlText.match(/<title[^>]*>([^<]+)<\/title>/i)
      return titleMatch ? titleMatch[1].trim() : undefined
    })()

    const imageUrl = extractMeta(htmlText, 'image') || extractMeta(htmlText, 'image:secure_url') || extractMeta(htmlText, 'twitter:image')

    // Tentar ler preço de metadados
    let currentPrice: number | undefined
    let originalPrice: number | undefined
    const priceAmount = extractMeta(htmlText, 'product:price:amount') || extractMeta(htmlText, 'music:price:amount')
    if (priceAmount) {
      const parsed = parseFloat(priceAmount.replace(',', '.'))
      if (!isNaN(parsed)) currentPrice = parsed
    }

    // Tentar ler preço com expressões regulares em R$ se não vier nos metadados
    if (!currentPrice) {
      const priceRegex = /R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*,\s*[0-9]{2})/gi
      const matches = htmlText.match(priceRegex)
      if (matches && matches.length > 0) {
        const cleanPrice = (valStr: string): number => {
          const numStr = valStr.replace(/[^\d,]/g, '').replace(',', '.')
          return parseFloat(numStr)
        }
        const prices = matches.map(cleanPrice).filter(p => p > 0)
        if (prices.length > 0) {
          if (prices.length >= 2) {
            const uniquePrices = Array.from(new Set(prices)).sort((a, b) => a - b)
            if (uniquePrices.length >= 2) {
              currentPrice = uniquePrices[0]
              originalPrice = uniquePrices[1]
            } else {
              currentPrice = uniquePrices[0]
            }
          } else {
            currentPrice = prices[0]
          }
        }
      }
    }

    // Detectar cupom na URL
    const detectCoupon = (urlStr: string): string | undefined => {
      try {
        const u = new URL(urlStr)
        const couponKeys = ['coupon', 'cupom', 'voucher', 'code', 'c']
        for (const key of couponKeys) {
          const val = u.searchParams.get(key)
          if (val && val.trim().length >= 3 && val.trim().length <= 15) {
            return val.trim().toUpperCase()
          }
        }
      } catch (_) {
        // Ignore URL parsing errors
      }
      return undefined
    }
    const coupon = detectCoupon(targetUrl) || detectCoupon(url)

    const warnings: string[] = []
    if (!currentPrice) {
      warnings.push("Preço não encontrado automaticamente. Preencha manualmente.")
    }
    if (!coupon) {
      warnings.push("Cupom não encontrado automaticamente.")
    }

    const payload = {
      success: true,
      marketplace,
      title: normalizeProductTitle(title || '', undefined, marketplace),
      imageUrl,
      currentPrice,
      originalPrice,
      coupon,
      finalUrl: targetUrl,
      source: 'opengraph',
      warnings,
    }

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Erro interno no enriquecimento.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
