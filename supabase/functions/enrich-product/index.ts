// Deno Edge Function: supabase/functions/enrich-product/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    if (!url || !url.startsWith('http')) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL inválida ou ausente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
        const parsed = new URL(targetUrl)
        const hostname = parsed.hostname.toLowerCase()
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0' ||
          hostname === '::1' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.') ||
          hostname.startsWith('169.254.') || // link-local -- inclui metadata de cloud (AWS/GCP/Azure)
          hostname.startsWith('fe80:') ||
          hostname.startsWith('fd') // IPv6 unique local address (fc00::/7)
        ) {
          throw new Error('Acesso a IPs locais ou internos não é permitido.')
        }

        const headRes = await fetch(targetUrl, {
          method: 'GET',
          redirect: 'manual',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          }
        })

        const location = headRes.headers.get('location')
        if (location && (headRes.status >= 300 && headRes.status < 400)) {
          const resolvedLocation = location.startsWith('http') 
            ? location 
            : new URL(location, targetUrl).toString()
          targetUrl = resolvedLocation
          redirectsCount++
        } else {
          break
        }
      }
    } catch (redirectErr: any) {
      console.warn("Erro ao resolver redirects:", redirectErr.message)
    }

    // 2. Fazer fetch na URL resolvida com limite de tempo
    const response = await fetch(targetUrl, {
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
