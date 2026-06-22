import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

const USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS = true;

// Helper para formatar moeda BRL
const formatCurrency = (val: number): string => {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);
};

function getDefaultTemplate(channelType: string): string {
  switch (channelType) {
    case 'whatsapp':
      return `🔥 *OFERTA ENCONTRADA*

*{titulo}*

{preco_original_linha}
💰 *Por:* {preco_promocional}
{cupom_linha}

👉 Comprar agora:
{link}`;
    case 'telegram':
      return `🔥 OFERTA ENCONTRADA

{titulo}

{preco_original_linha}
💰 Por: {preco_promocional}
{cupom_linha}

Comprar agora:
{link}`;
    case 'discord':
      return `🔥 OFERTA ENCONTRADA

{titulo}

{preco_original_linha}
💰 Por: {preco_promocional}
{cupom_linha}

Comprar agora:
{link}`;
    default:
      return `{titulo} - {preco_promocional} {link}`;
  }
}

function escapeHTML(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTelegramHTML(text: string): string {
  if (!text) return '';
  let formatted = text;
  
  // 1. Links markdown: [texto](url) -> <a href="url">texto</a>
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, anchorText, url) => {
    const safeUrl = url.replace(/&amp;/g, '&').replace(/&/g, '&amp;');
    return `<a href="${safeUrl}">${anchorText}</a>`;
  });
  
  // 2. Negrito: **texto** ou *texto* -> <b>texto</b>
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<b>$1</b>');
  
  // 3. Itálico: _texto_ -> <i>texto</i>
  formatted = formatted.replace(/_([^_]+)_/g, '<i>$1</i>');
  
  // 4. Riscado: ~texto~ -> <s>texto</s>
  formatted = formatted.replace(/~([^~]+)~/g, '<s>$1</s>');
  
  return formatted;
}

function formatDiscordMarkdown(text: string): string {
  if (!text) return '';
  let formatted = text;
  
  // Riscado: ~texto~ ou ~~texto~~ -> ~~texto~~
  formatted = formatted.replace(/~~([^~]+)~~/g, '~~$1~~');
  formatted = formatted.replace(/(?<!~)~([^~]+)~(?!~)/g, '~~$1~~');
  
  // Negrito: **texto** ou *texto* -> **texto**
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '**$1**');
  formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '**$1**');
  
  return formatted;
}

function formatWhatsAppText(text: string): string {
  if (!text) return '';
  let formatted = text;
  
  // Links markdown: [texto](url) -> texto:\nurl
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1:\n$2');
  
  // Negrito: **texto** -> *texto*
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  
  return formatted;
}

function normalizeProductTitle(
  rawTitle: string,
  rawDescription?: string,
  marketplace?: string
): string {
  if (!rawTitle) return '';
  let title = String(rawTitle).trim();
  title = title.replace(/^[\s🔥⚡💎🎁🚀🎟️💰🛒📢👉✅❌🚨🛒✨🎉⚠️🔴📌🥇]*\s*/, '');
  title = title.replace(/\s*[🔥⚡💎🎁🚀🎟️💰🛒📢👉✅❌🚨🛒✨🎉⚠️🔴📌🥇\s]*$/, '');

  const marketingPhrases = [
    /^(?:prepare-se\s+para|cozinhe\s+como|economize|compre\s+j[áa]|aproveite|garanta\s+o\s+seu|n[ãa]o\s+perca|oferta\s+imperd[íi]vel|promo[çc][ãa]o\s+imperd[íi]vel|compre\s+agora|leia\s+mais|clique\s+e\s+confira|confira\s+esta\s+oferta|imperd[íi]vel|corre\s+para\s+ver|desconto\s+exclusivo|pre[çc]o\s+imbat[íi]vel|olha\s+esse\s+desconto)\s*[:!,-]?\s*/i
  ];
  for (const pattern of marketingPhrases) {
    title = title.replace(pattern, '');
  }

  const suffixes = [
    /\s*[-|•–—]*\s*Amazon\.com\.br\s*$/i,
    /\s*[-|•–—]*\s*Amazon\s*$/i,
    /\s*[-|•–—]*\s*Mercado\s*Livre\s*$/i,
    /\s*[-|•–—]*\s*Shopee\s*$/i,
    /\s*[-|•–—]*\s*Magalu\s*$/i,
    /\s*[-|•–—]*\s*Magazine\s*Luiza\s*$/i,
    /\s*[-|•–—]*\s*AliExpress\s*$/i,
    /\s*[-|•–—]*\s*Compre\s*agora\s*$/i,
    /\s*[-|•–—]*\s*Oferta\s*$/i,
    /\s*[-|•–—]*\s*Promo[çc][ãa]o\s*$/i,
    /\s*[-|•–—]*\s*Pre[çc]o\s*baixo\s*$/i,
  ];
  for (const suffixPattern of suffixes) {
    title = title.replace(suffixPattern, '');
  }

  title = title.replace(/\s*[-|•–—,;:]\s*$/, '').trim();
  if (title.length > 120) {
    title = title.substring(0, 117) + '...';
  }
  return title;
}

async function shortenLink(url: string, provider = 'isgd'): Promise<string> {
  if (!url || provider === 'none') return url;
  
  let shortUrl = url;
  let usedProvider = provider;
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
        }
      } else {
        console.warn('Erro ao encurtar com Bitly, caindo para isgd:', res.statusText);
        usedProvider = 'isgd';
      }
    } catch (err) {
      console.warn('Erro na chamada do Bitly, caindo para isgd:', err);
      usedProvider = 'isgd';
    }
  } else if (provider === 'bitly' && !bitlyToken) {
    usedProvider = 'isgd';
  }

  if (usedProvider === 'isgd') {
    try {
      const res = await fetch(`https://is.gd/create.php?format=json&url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.shorturl) {
          shortUrl = data.shorturl.trim();
        } else if (data && data.errormessage) {
          console.warn('Erro retornado pela API do is.gd, tentando fallback tinyurl:', data.errormessage);
          usedProvider = 'tinyurl';
        }
      } else {
        console.warn('is.gd retornou status de erro, tentando fallback tinyurl:', res.statusText);
        usedProvider = 'tinyurl';
      }
    } catch (err) {
      console.warn('Erro ao encurtar com is.gd, tentando fallback tinyurl:', err);
      usedProvider = 'tinyurl';
    }
  }

  if (usedProvider === 'tinyurl' && shortUrl === url) {
    try {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`, {
        signal: AbortSignal.timeout(6000)
      });
      if (res.ok) {
        const text = await res.text();
        if (text && text.startsWith('http')) {
          shortUrl = text.trim();
        }
      }
    } catch (err) {
      console.warn('Erro ao encurtar com TinyURL:', err);
    }
  }

  return shortUrl;
}

function renderMessageTemplate(
  template: string,
  offer: any,
  profile: any,
  trackingLink: string,
  channelType: string
): string {
  if (!template) return '';

  const originalPriceCents = offer.original_price !== undefined
    ? parseFloat(offer.original_price)
    : (offer.originalPrice ? parseFloat(offer.originalPrice) : 0);

  const salePriceCents = offer.sale_price !== undefined
    ? parseFloat(offer.sale_price)
    : (offer.salePrice ? parseFloat(offer.salePrice) : 0);

  const originalPriceFormatted = originalPriceCents > 0
    ? formatCurrency(originalPriceCents)
    : '';

  const salePriceFormatted = salePriceCents > 0
    ? formatCurrency(salePriceCents)
    : '';

  let couponVal = offer.coupon && String(offer.coupon) !== 'null' && String(offer.coupon) !== 'undefined'
    ? String(offer.coupon).trim()
    : '';

  let marketplaceVal = offer.marketplace && String(offer.marketplace) !== 'null' && String(offer.marketplace) !== 'undefined'
    ? String(offer.marketplace).trim()
    : '';

  let categoryVal = offer.category && String(offer.category) !== 'null' && String(offer.category) !== 'undefined'
    ? String(offer.category).trim()
    : '';

  const discountVal = offer.discount
    ? parseInt(String(offer.discount))
    : (originalPriceCents > salePriceCents && originalPriceCents > 0
        ? Math.round((1 - (salePriceCents / originalPriceCents)) * 100)
        : 0);

  let titleVal = offer.name || offer.offerName || offer.title || '';
  const imageVal = offer.image || offer.offerImage || offer.imageUrl || '';
  let affiliateName = profile?.full_name || profile?.preferred_name || 'Afiliado';
  let vitrineName = profile?.public_name || profile?.public_display_name || profile?.username || 'Vitrine';

  // Obter data/hora no fuso horário do Brasil (America/Sao_Paulo)
  const now = new Date();
  const dateVal = now.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const timeVal = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

  const type = channelType.toLowerCase();
  const isTelegram = type === 'telegram';
  const isDiscord = type === 'discord';
  const isWhatsApp = type === 'whatsapp';

  // Se for Telegram, precisamos escapar valores dinâmicos antes de injetar
  if (isTelegram) {
    titleVal = escapeHTML(titleVal);
    couponVal = escapeHTML(couponVal);
    marketplaceVal = escapeHTML(marketplaceVal);
    categoryVal = escapeHTML(categoryVal);
    affiliateName = escapeHTML(affiliateName);
    vitrineName = escapeHTML(vitrineName);
  }

  let rendered = template;

  // Substituir aliases/versões antigas
  rendered = rendered
    .replace(/{{titulo}}/g, '{titulo}')
    .replace(/{{preco_original}}/g, '{preco_original}')
    .replace(/{{preco_promocional}}/g, '{preco_promocional}')
    .replace(/{{cupom}}/g, '{cupom}')
    .replace(/{{link}}/g, '{link}');

  // 1. Substituir Linhas Inteligentes
  const originalPriceLine = originalPriceCents > 0
    ? (isDiscord ? `De: ~~${originalPriceFormatted}~~` : `De: ~${originalPriceFormatted}~`)
    : '';
  rendered = rendered.replace(/{preco_original_linha}/g, originalPriceLine);

  const couponLine = couponVal
    ? (isDiscord ? `🎟️ **Cupom:** \`${couponVal}\`` : `🎟️ Cupom: *${couponVal}*`)
    : '';
  rendered = rendered.replace(/{cupom_linha}/g, couponLine);

  const discountLine = discountVal > 0
    ? (isDiscord ? `🔥 **${discountVal}% OFF**` : `🔥 *${discountVal}% OFF*`)
    : '';
  rendered = rendered.replace(/{desconto_linha}/g, discountLine);

  const marketplaceLine = marketplaceVal
    ? (isDiscord ? `🛒 **Marketplace:** ${marketplaceVal.toUpperCase()}` : `🛒 Marketplace: *${marketplaceVal.toUpperCase()}*`)
    : '';
  rendered = rendered.replace(/{marketplace_linha}/g, marketplaceLine);

  const categoryLine = categoryVal
    ? (isDiscord ? `📁 **Categoria:** ${categoryVal}` : `📁 Categoria: *${categoryVal}*`)
    : '';
  rendered = rendered.replace(/{categoria_linha}/g, categoryLine);

  const imageLine = imageVal
    ? (isDiscord ? `🖼️ **Imagem:** ${imageVal}` : `🖼️ Imagem: ${imageVal}`)
    : '';
  rendered = rendered.replace(/{imagem_linha}/g, imageLine);

  // 2. Substituir Variáveis Simples
  let descriptionVal = offer.description || offer.headline || offer.copy || '';
  if (isTelegram) {
    descriptionVal = escapeHTML(descriptionVal);
  }

  rendered = rendered
    .replace(/{titulo}/g, titleVal)
    .replace(/{chamada}/g, descriptionVal)
    .replace(/{preco_original}/g, originalPriceFormatted)
    .replace(/{preco_promocional}/g, salePriceFormatted)
    .replace(/{desconto}/g, discountVal > 0 ? `${discountVal}%` : '')
    .replace(/{cupom}/g, couponVal)
    .replace(/{marketplace}/g, marketplaceVal.toUpperCase())
    .replace(/{categoria}/g, categoryVal)
    .replace(/{link}/g, trackingLink)
    .replace(/{imagem}/g, imageVal)
    .replace(/{nome_afiliado}/g, affiliateName)
    .replace(/{nome_vitrine}/g, vitrineName)
    .replace(/{data}/g, dateVal)
    .replace(/{hora}/g, timeVal);

  // 3. Limpeza de Linhas Vazias e Espaços Extras
  rendered = rendered.replace(/\n{3,}/g, '\n\n');

  rendered = rendered
    .split('\n')
    .filter((line, i, arr) => {
      if (line.trim() === '') {
        return i === 0 || arr[i - 1].trim() !== '';
      }
      return true;
    })
    .join('\n')
    .trim();

  // 4. Formatação pós-processamento específica por canal
  if (isTelegram) {
    rendered = formatTelegramHTML(rendered);
  } else if (isDiscord) {
    rendered = formatDiscordMarkdown(rendered);
  } else if (isWhatsApp) {
    rendered = formatWhatsAppText(rendered);
  }

  return rendered;
}

serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const pathname = url.pathname

  // 1. Extração e validação do header Authorization
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer lof_live_')) {
    return new Response(
      JSON.stringify({ error: 'Não autorizado. Use a API Key em: Authorization: Bearer lof_live_...' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  const apiKey = authHeader.replace('Bearer ', '').trim()

  try {
    // 2. Calcular o hash da chave recebida para autenticação segura
    const encoder = new TextEncoder()
    const keyData = encoder.encode(apiKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    // 3. Inicializar o cliente Supabase Admin para verificar a API Key
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: keyRow, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('*')
      .eq('key_hash', keyHash)
      .maybeSingle()

    if (keyError || !keyRow || keyRow.status !== 'active') {
      return new Response(
        JSON.stringify({ error: 'API key inválida, expirada ou revogada.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const userId = keyRow.user_id
    const scopes = keyRow.scopes || []

    // Atualizar last_used_at em background
    supabaseAdmin
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', keyRow.id)
      .then(({ error }) => {
        if (error) console.error('[PUBLIC_API] Erro ao atualizar last_used_at:', error.message)
      })

    // ==========================================
    // ROUTING ENDPOINTS
    // ==========================================

    const appUrl = Deno.env.get('VITE_PUBLIC_APP_URL') || 'https://linkoferta.vercel.app'

    // ------------------------------------------
    // ENDPOINT 1: Listar Canais (GET /channels)
    // ------------------------------------------
    if (pathname.endsWith('/channels') && req.method === 'GET') {
      if (!scopes.includes('channels:read')) {
        return new Response(
          JSON.stringify({ error: 'Permissão negada. Escopo channels:read é obrigatório.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: channels, error: channelsError } = await supabaseAdmin
        .from('channels')
        .select('id, name, type, status, members, created_at')
        .eq('user_id', userId)
        .order('name', { ascending: true })

      if (channelsError) {
        throw new Response(
          JSON.stringify({ error: `Erro ao listar canais: ${channelsError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Filtrar apenas canais ativos/conectados para segurança
      const connectedChannels = (channels || []).map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        status: c.status,
        members: c.members || 0
      }))

      return new Response(
        JSON.stringify({ data: connectedChannels }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ------------------------------------------
    // ENDPOINT 2: Criar Oferta (POST /offers)
    // ------------------------------------------
    else if (pathname.endsWith('/offers') && req.method === 'POST') {
      if (!scopes.includes('offers:write')) {
        return new Response(
          JSON.stringify({ error: 'Permissão negada. Escopo offers:write é obrigatório.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json()
      const {
        name,
        product_name,
        title,
        description,
        headline,
        copy,
        affiliate_link,
        marketplace,
        category,
        sale_price,
        original_price,
        coupon,
        image,
        status
      } = body

      let finalProductName = product_name || title || name;
      if (!finalProductName || !affiliate_link || !marketplace || sale_price === undefined) {
        return new Response(
          JSON.stringify({ error: 'Campos obrigatórios ausentes: name (ou product_name/title), affiliate_link, marketplace, sale_price.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Validar marketplace
      const validMarketplaces = ['mercadolivre', 'shopee', 'amazon', 'magalu', 'aliexpress']
      if (!validMarketplaces.includes(marketplace.toLowerCase())) {
        return new Response(
          JSON.stringify({ error: `Marketplace inválido. Deve ser um de: ${validMarketplaces.join(', ')}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const finalDescription = headline || copy || description || null;
      finalProductName = normalizeProductTitle(finalProductName, finalDescription || undefined, marketplace);

      // Gerar short_code único de 6 caracteres aleatórios
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
      let shortCode = ''
      for (let i = 0; i < 6; i++) {
        shortCode += chars.charAt(Math.floor(Math.random() * chars.length))
      }

      // Calcular desconto
      const originalPriceVal = Number(original_price) || 0
      const salePriceVal = Number(sale_price)
      const discount = (originalPriceVal > salePriceVal)
        ? Math.round((1 - (salePriceVal / originalPriceVal)) * 100)
        : 0

      // Tentar encurtar o link com tinyurl (ou bitly se configurado e houver token)
      let shortAffiliateUrl = null;
      let shortAffiliateProvider = 'none';
      let shortAffiliateCreatedAt = null;

      if (affiliate_link && affiliate_link.trim().startsWith('http')) {
        try {
          const shortened = await shortenLink(affiliate_link.trim(), 'isgd');
          if (shortened && shortened !== affiliate_link) {
            shortAffiliateUrl = shortened;
            shortAffiliateProvider = 'isgd';
            shortAffiliateCreatedAt = new Date().toISOString();
          }
        } catch (err) {
          console.warn('[PUBLIC_API] Falha ao encurtar link no POST /offers:', err);
        }
      }

      // Criar a oferta
      const { data: newOffer, error: offerError } = await supabaseAdmin
        .from('offers')
        .insert({
          user_id: userId,
          name: finalProductName,
          description: finalDescription,
          image: image || null,
          original_price: originalPriceVal,
          sale_price: salePriceVal,
          discount: discount,
          coupon: coupon ? coupon.trim().toUpperCase() : null,
          affiliate_link: affiliate_link.trim(),
          marketplace: marketplace.toLowerCase(),
          category: category || 'Outros',
          status: status || 'active',
          short_code: shortCode,
          clicks: 0,
          short_affiliate_url: shortAffiliateUrl,
          short_affiliate_provider: shortAffiliateProvider === 'none' ? null : shortAffiliateProvider,
          short_affiliate_created_at: shortAffiliateCreatedAt
        })
        .select()
        .single()

      if (offerError) {
        return new Response(
          JSON.stringify({ error: `Erro ao salvar oferta: ${offerError.message}` }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({
          data: {
            id: newOffer.id,
            name: newOffer.name,
            description: newOffer.description,
            short_code: newOffer.short_code,
            sale_price: newOffer.sale_price,
            original_price: newOffer.original_price,
            discount: newOffer.discount,
            coupon: newOffer.coupon,
            affiliate_link: newOffer.affiliate_link,
            short_affiliate_url: newOffer.short_affiliate_url,
            marketplace: newOffer.marketplace,
            category: newOffer.category,
            status: newOffer.status,
            tracking_link: `${appUrl}/o/${newOffer.short_code}`
          }
        }),
        { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ------------------------------------------
    // ENDPOINT 3: Disparar Oferta (POST /dispatch)
    // ------------------------------------------
    else if (pathname.endsWith('/dispatch') && req.method === 'POST') {
      if (!scopes.includes('dispatch:write')) {
        return new Response(
          JSON.stringify({ error: 'Permissão negada. Escopo dispatch:write é obrigatório.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const body = await req.json()
      const { offer_id, channel_ids, offer: rawOffer } = body

      let targetOffer: any = null

      // Opção A: Disparar oferta existente
      if (offer_id) {
        if (!channel_ids || !Array.isArray(channel_ids) || channel_ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'O campo channel_ids deve ser um array com IDs dos canais.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const { data: dbOffer, error: fetchOfferError } = await supabaseAdmin
          .from('offers')
          .select('*')
          .eq('id', offer_id)
          .eq('user_id', userId)
          .maybeSingle()

        if (fetchOfferError || !dbOffer) {
          return new Response(
            JSON.stringify({ error: 'Oferta não encontrada ou não pertence a este usuário.' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        targetOffer = dbOffer
      }
      // Opção B: Criar e disparar oferta simultaneamente
      else if (rawOffer) {
        const {
          name,
          product_name,
          title,
          description,
          headline,
          copy,
          affiliate_link,
          marketplace,
          category,
          sale_price,
          original_price,
          coupon,
          image
        } = rawOffer

        let finalProductName = product_name || title || name;
        if (!finalProductName || !affiliate_link || !marketplace || sale_price === undefined || !channel_ids || !Array.isArray(channel_ids) || channel_ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Campos obrigatórios ausentes no objeto offer (name/product_name/title, affiliate_link, marketplace, sale_price) ou channel_ids vazios.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const validMarketplaces = ['mercadolivre', 'shopee', 'amazon', 'magalu', 'aliexpress']
        if (!validMarketplaces.includes(marketplace.toLowerCase())) {
          return new Response(
            JSON.stringify({ error: `Marketplace inválido.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const finalDescription = headline || copy || description || null;
        finalProductName = normalizeProductTitle(finalProductName, finalDescription || undefined, marketplace);

        // Gerar short_code
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
        let shortCode = ''
        for (let i = 0; i < 6; i++) {
          shortCode += chars.charAt(Math.floor(Math.random() * chars.length))
        }

        const originalPriceVal = Number(original_price) || 0
        const salePriceVal = Number(sale_price)
        const discount = (originalPriceVal > salePriceVal)
          ? Math.round((1 - (salePriceVal / originalPriceVal)) * 100)
          : 0

        // Tentar encurtar o link
        let shortAffiliateUrl = null;
        let shortAffiliateProvider = 'none';
        let shortAffiliateCreatedAt = null;

        if (affiliate_link && affiliate_link.trim().startsWith('http')) {
          try {
            const shortened = await shortenLink(affiliate_link.trim(), 'isgd');
            if (shortened && shortened !== affiliate_link) {
              shortAffiliateUrl = shortened;
              shortAffiliateProvider = 'isgd';
              shortAffiliateCreatedAt = new Date().toISOString();
            }
          } catch (err) {
            console.warn('[PUBLIC_API] Falha ao encurtar link no POST /dispatch (Opção B):', err);
          }
        }

        // Inserir oferta
        const { data: createdOffer, error: createError } = await supabaseAdmin
          .from('offers')
          .insert({
            user_id: userId,
            name: finalProductName,
            description: finalDescription,
            image: image || null,
            original_price: originalPriceVal,
            sale_price: salePriceVal,
            discount: discount,
            coupon: coupon ? coupon.trim().toUpperCase() : null,
            affiliate_link: affiliate_link.trim(),
            marketplace: marketplace.toLowerCase(),
            category: category || 'Outros',
            status: 'active',
            short_code: shortCode,
            clicks: 0,
            short_affiliate_url: shortAffiliateUrl,
            short_affiliate_provider: shortAffiliateProvider === 'none' ? null : shortAffiliateProvider,
            short_affiliate_created_at: shortAffiliateCreatedAt
          })
          .select()
          .single()

        if (createError) {
          return new Response(
            JSON.stringify({ error: `Erro ao criar oferta para disparo: ${createError.message}` }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        targetOffer = createdOffer
      } else {
        return new Response(
          JSON.stringify({ error: 'Defina offer_id para disparar oferta existente OU o objeto offer para cadastrar e disparar.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!channel_ids || !Array.isArray(channel_ids) || channel_ids.length === 0) {
        return new Response(
          JSON.stringify({ error: 'O campo channel_ids deve ser um array com IDs dos canais.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const uniqueChannelIds = [...new Set(channel_ids)]

      // Validar os canais
      const { data: channels, error: fetchChannelsError } = await supabaseAdmin
        .from('channels')
        .select('*')
        .in('id', uniqueChannelIds)
        .eq('user_id', userId)

      if (fetchChannelsError) {
        return new Response(
          JSON.stringify({ error: `Erro ao carregar canais de disparo: ${fetchChannelsError.message}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!channels || channels.length < uniqueChannelIds.length) {
        return new Response(
          JSON.stringify({ error: 'Um ou mais canais informados não pertencem à sua conta.' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const activeChannels = (channels || []).filter(c => 
        ['connected', 'active', 'conectado'].includes((c.status || '').toLowerCase()) &&
        ['telegram', 'discord'].includes((c.type || '').toLowerCase())
      )

      if (activeChannels.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Nenhum canal ativo ou compatível (Telegram/Discord) foi encontrado para os IDs informados.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const results = []
      const successfulChannels = []
      const failedChannels = []

      // Obter perfil do remetente e configurações de templates
      const [profileRes, settingsRes] = await Promise.all([
        supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabaseAdmin.from('user_settings').select('*').eq('user_id', userId).maybeSingle()
      ])
      const profile = profileRes.data
      const settings = settingsRes.data
      const profileName = profile?.public_name || profile?.full_name || 'Afiliado'

      // Tentar obter ou gerar o link encurtado para a oferta em cache
      let finalAffiliateUrl = targetOffer.short_affiliate_url
      if (!finalAffiliateUrl && targetOffer.affiliate_link) {
        try {
          const shortened = await shortenLink(targetOffer.affiliate_link, 'isgd')
          if (shortened && shortened !== targetOffer.affiliate_link) {
            finalAffiliateUrl = shortened
            // Atualizar no banco de dados em background
            supabaseAdmin
              .from('offers')
              .update({
                short_affiliate_url: shortened,
                short_affiliate_provider: 'isgd',
                short_affiliate_created_at: new Date().toISOString()
              })
              .eq('id', targetOffer.id)
              .then(({ error }) => {
                if (error) console.error('[PUBLIC_API] Erro ao atualizar cache de link curto em background:', error.message)
              })
          }
        } catch (err) {
          console.warn('[PUBLIC_API] Falha ao gerar link encurtado em runtime, usando original:', err)
          finalAffiliateUrl = targetOffer.affiliate_link
        }
      }
      if (!finalAffiliateUrl) {
        finalAffiliateUrl = targetOffer.affiliate_link || targetOffer.affiliateLink
      }

      // Executar envios
      for (const channel of activeChannels) {
        const sentAt = new Date().toISOString()
        try {
          // --- DISCORD WEBHOOK ---
          if (channel.type === 'discord') {
            const purchaseUrl = finalAffiliateUrl

            if (!purchaseUrl || !purchaseUrl.trim().startsWith('http')) {
              throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.')
            }

            const template = settings?.discord_template || getDefaultTemplate('discord')
            const renderedMessage = renderMessageTemplate(
              template,
              { ...targetOffer, name: normalizeProductTitle(targetOffer.name, undefined, targetOffer.marketplace) },
              profile,
              purchaseUrl,
              'discord'
            )
            
            const fields = [
              { name: '💰 Preço', value: `**${formatCurrency(targetOffer.sale_price)}**`, inline: true }
            ]
            if (targetOffer.original_price && targetOffer.original_price > 0) {
              fields.push({ name: '🏷️ De', value: `~~${formatCurrency(targetOffer.original_price)}~~`, inline: true })
            }
            fields.push({ name: '🛒 Marketplace', value: targetOffer.marketplace.toUpperCase(), inline: true })
            if (targetOffer.coupon) {
              fields.push({ name: '🎟️ Cupom', value: `\`${targetOffer.coupon}\``, inline: true })
            }

            const embed: any = {
              title: normalizeProductTitle(targetOffer.name, undefined, targetOffer.marketplace),
              url: purchaseUrl,
              color: 0x4f46e5,
              description: renderedMessage,
              fields,
              footer: { text: 'Link Oferta • Enviado via API' },
              timestamp: new Date().toISOString()
            }
 
            if (targetOffer.image && targetOffer.image.startsWith('http')) {
              embed.image = { url: targetOffer.image }
            }
 
            const discountText = targetOffer.discount > 0 ? ` 🔥 ${targetOffer.discount}% OFF` : ''
 
            const discRes = await fetch(channel.identifier, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: `⚡ **NOVA OFERTA DISPONÍVEL!** ${discountText}`,
                embeds: [embed]
              })
            })
 
            if (!discRes.ok && discRes.status !== 204) {
              throw new Error(`Discord respondeu status: ${discRes.status}`)
            }
 
            results.push({ channelId: channel.id, name: channel.name, type: 'discord', success: true })
            successfulChannels.push(channel.name)
          } 
          // --- TELEGRAM BOT ---
          else if (channel.type === 'telegram') {
            const botToken = channel.metadata?.bot_token
            const chatId = channel.identifier
 
            if (!botToken || !chatId) {
              throw new Error('Configuração do Telegram incompleta para o canal.')
            }
 
            const purchaseUrl = finalAffiliateUrl
 
            if (!purchaseUrl || !purchaseUrl.trim().startsWith('http')) {
              throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.')
            }
 
            const template = settings?.telegram_template || getDefaultTemplate('telegram')
            const renderedMessage = renderMessageTemplate(
              template,
              { ...targetOffer, name: normalizeProductTitle(targetOffer.name, undefined, targetOffer.marketplace) },
              profile,
              purchaseUrl,
              'telegram'
            )

            let telRes: Response
            let sendPhotoSuccess = false

            const hasImage = targetOffer.image && 
                             targetOffer.image.trim() !== '' && 
                             targetOffer.image.trim() !== 'null' && 
                             targetOffer.image.trim() !== 'undefined' && 
                             targetOffer.image.startsWith('http')

            if (hasImage) {
              try {
                const isTooLong = renderedMessage.length > 1024
                const useCaption = isTooLong ? `${renderedMessage.slice(0, 100)}...` : renderedMessage

                telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    chat_id: chatId,
                    photo: targetOffer.image,
                    caption: useCaption,
                    parse_mode: 'HTML'
                  })
                })
                const telData = await telRes.json()
                if (telData.ok) {
                  sendPhotoSuccess = true
                  
                  // Se o texto excedeu 1024 caracteres, manda o texto completo separado
                  if (isTooLong) {
                    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        chat_id: chatId,
                        text: renderedMessage,
                        parse_mode: 'HTML'
                      })
                    })
                  }
                } else {
                  console.warn('Telegram [sendPhoto] ok=false, tentando fallback sendMessage:', telData.description)
                }
              } catch (photoErr) {
                console.warn('Erro ao tentar sendPhoto no Telegram, usando fallback:', photoErr)
              }
            }

            // Fallback de envio como mensagem de texto caso falhe a foto ou não exista imagem
            if (!sendPhotoSuccess) {
              const textToSend = hasImage 
                ? `${renderedMessage}\n\n🖼️ <a href="${targetOffer.image}">Ver imagem</a>` 
                : renderedMessage

              telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: textToSend,
                  parse_mode: 'HTML'
                })
              })
              const telData = await telRes.json()
              if (!telData.ok) {
                throw new Error(`Telegram respondeu: ${telData.description || 'Erro'}`)
              }
            }

            results.push({ channelId: channel.id, name: channel.name, type: 'telegram', success: true })
            successfulChannels.push(channel.name)
          }
        } catch (err: any) {
          console.error(`Erro de envio no canal ${channel.name}:`, err.message)
          results.push({ channelId: channel.id, name: channel.name, type: channel.type, success: false, error: err.message })
          failedChannels.push(channel.name)
        }
      }

      // Gravar histórico
      const finalStatus = failedChannels.length === 0 
        ? 'success' 
        : (successfulChannels.length > 0 ? 'partial' : 'error')

      const errorMessage = failedChannels.length > 0
        ? `Falha no envio da API para: ${failedChannels.join(', ')}`
        : undefined

      const historyPayload = {
        user_id: userId,
        offer_id: targetOffer.id,
        offer_name: targetOffer.name,
        offer_image: targetOffer.image,
        marketplace: targetOffer.marketplace,
        channels: successfulChannels,
        channel_count: successfulChannels.length,
        status: finalStatus,
        error: errorMessage
      }

      await supabaseAdmin.from('history').insert(historyPayload)

      return new Response(
        JSON.stringify({
          success: true,
          status: finalStatus,
          results: results
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Rota padrão se não bater em nenhum endpoint cadastrado
    return new Response(
      JSON.stringify({ error: 'Endpoint não encontrado. Rotas válidas: GET /channels, POST /offers, POST /dispatch.' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[PUBLIC_API] Erro interno:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
