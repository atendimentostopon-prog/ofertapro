// Deno Edge Function: supabase/functions/enrich-product/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { url } = await req.json()
    if (!url || !url.startsWith('http')) {
      return new Response(
        JSON.stringify({ success: false, error: 'URL inválida ou ausente.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('172.')
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
      title: title?.substring(0, 120),
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
