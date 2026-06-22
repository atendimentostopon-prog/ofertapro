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
      const { name, affiliate_link, marketplace, category, sale_price, original_price, coupon, image, status } = body

      // Validações de campos obrigatórios
      if (!name || !affiliate_link || !marketplace || sale_price === undefined) {
        return new Response(
          JSON.stringify({ error: 'Campos obrigatórios ausentes: name, affiliate_link, marketplace, sale_price.' }),
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

      // Criar a oferta
      const { data: newOffer, error: offerError } = await supabaseAdmin
        .from('offers')
        .insert({
          user_id: userId,
          name: name.trim(),
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
          clicks: 0
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
            short_code: newOffer.short_code,
            sale_price: newOffer.sale_price,
            original_price: newOffer.original_price,
            discount: newOffer.discount,
            coupon: newOffer.coupon,
            affiliate_link: newOffer.affiliate_link,
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
        const { name, affiliate_link, marketplace, category, sale_price, original_price, coupon, image } = rawOffer
        if (!name || !affiliate_link || !marketplace || sale_price === undefined || !channel_ids || !Array.isArray(channel_ids) || channel_ids.length === 0) {
          return new Response(
            JSON.stringify({ error: 'Campos obrigatórios ausentes no objeto offer ou channel_ids vazios.' }),
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

        // Inserir oferta
        const { data: createdOffer, error: createError } = await supabaseAdmin
          .from('offers')
          .insert({
            user_id: userId,
            name: name.trim(),
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
            clicks: 0
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

      // Obter perfil do remetente
      const { data: profile } = await supabaseAdmin.from('profiles').select('*').eq('id', userId).maybeSingle()
      const profileName = profile?.public_name || profile?.full_name || 'Afiliado'

      // Executar envios
      for (const channel of activeChannels) {
        const sentAt = new Date().toISOString()
        try {
          // --- DISCORD WEBHOOK ---
          if (channel.type === 'discord') {
            const purchaseUrl = USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS
              ? targetOffer.affiliate_link || targetOffer.affiliateLink
              : `${appUrl}/o/${targetOffer.short_code}?src=discord`

            if (!purchaseUrl || !purchaseUrl.trim().startsWith('http')) {
              throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.')
            }
            
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
              title: targetOffer.name,
              url: purchaseUrl,
              color: 0x4f46e5,
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

            const purchaseUrl = USE_DIRECT_AFFILIATE_LINK_IN_CHANNELS
              ? targetOffer.affiliate_link || targetOffer.affiliateLink
              : `${appUrl}/o/${targetOffer.short_code}?src=telegram`

            if (!purchaseUrl || !purchaseUrl.trim().startsWith('http')) {
              throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.')
            }

            const couponText = targetOffer.coupon ? `\nCupom: ${targetOffer.coupon}` : ''
            const originalPriceText = targetOffer.original_price && targetOffer.original_price > 0
              ? `De: ${formatCurrency(targetOffer.original_price)}\n`
              : ''

            const messageText = 
`🔥 OFERTA ENCONTRADA

${targetOffer.name}

${originalPriceText}Por: ${formatCurrency(targetOffer.sale_price)}${couponText}

Comprar agora:
${purchaseUrl}`

            let telRes: Response
            if (targetOffer.image && targetOffer.image.startsWith('http')) {
              telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  photo: targetOffer.image,
                  caption: messageText
                })
              })
            } else {
              telRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  chat_id: chatId,
                  text: messageText
                })
              })
            }

            const telData = await telRes.json()
            if (!telData.ok) {
              throw new Error(`Telegram respondeu: ${telData.description || 'Erro'}`)
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
