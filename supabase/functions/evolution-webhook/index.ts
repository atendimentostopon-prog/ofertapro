import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  // Webhooks geralmente são acionados apenas por requisições POST
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  try {
    // 1. Validar o Webhook Secret
    const urlObj = new URL(req.url)
    const querySecret = urlObj.searchParams.get('secret')
    const receivedSecret = req.headers.get('x-webhook-secret') || querySecret
    const configSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET')

    if (!configSecret || !receivedSecret || receivedSecret !== configSecret) {
      console.warn(`[WEBHOOK] Validação de secret falhou. Recebida no header: ${req.headers.get('x-webhook-secret') || 'Nenhuma'} / Recebida na query: ${querySecret || 'Nenhuma'}`)
      return new Response(JSON.stringify({ error: 'Não autorizado.' }), { status: 401 })
    }

    const payload = await req.json()
    console.log(`[WEBHOOK] Evento recebido da Evolution API:`, JSON.stringify(payload))

    const event = payload?.event // 'qrcode.updated', 'connection.update', etc
    const instanceName = payload?.instance
    const data = payload?.data

    if (!instanceName) {
      console.warn('[WEBHOOK] Notificação recebida sem instanceName.')
      return new Response('No instanceName provided', { status: 400 })
    }

    // Inicializar o cliente Supabase Admin para atualizar os dados
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Buscar a instância correspondente no banco
    const { data: instance, error: fetchErr } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('*')
      .eq('instance_name', instanceName)
      .maybeSingle()

    if (fetchErr || !instance) {
      console.warn(`[WEBHOOK] Instância '${instanceName}' não cadastrada no banco local.`)
      return new Response('Instance not found in local db', { status: 200 }) // Retorna 200 para a Evolution não ficar retentando
    }

    const updatePayload: any = {
      updated_at: new Date().toISOString()
    }

    // 2. Tratar eventos específicos
    if (event === 'qrcode.updated') {
      const qrCode = data?.qrcode?.code || null
      updatePayload.status = 'qrcode'
      updatePayload.qr_code = qrCode
      updatePayload.qr_code_updated_at = new Date().toISOString()
      console.log(`[WEBHOOK] QR Code da instância '${instanceName}' atualizado.`)
    } 
    
    else if (event === 'connection.update') {
      const state = data?.status // 'open', 'close', 'connecting', 'refused'
      console.log(`[WEBHOOK] Status de conexão da instância '${instanceName}' mudou para: ${state}`)

      if (state === 'open') {
        updatePayload.status = 'connected'
        updatePayload.qr_code = null
        updatePayload.connected_at = new Date().toISOString()

        // Buscar telefone e nome do proprietário se vier
        let ownerPhone = data?.phone || null
        if (ownerPhone && ownerPhone.includes('@')) {
          ownerPhone = ownerPhone.split('@')[0]
        }
        if (ownerPhone && ownerPhone.includes(':')) {
          ownerPhone = ownerPhone.split(':')[0]
        }
        
        updatePayload.phone_number = ownerPhone
        updatePayload.profile_name = data?.profileName || null
      } 
      
      else if (state === 'connecting') {
        updatePayload.status = 'connecting'
      } 
      
      else if (state === 'close') {
        updatePayload.status = 'disconnected'
        updatePayload.disconnected_at = new Date().toISOString()
      } 
      
      else if (state === 'refused') {
        updatePayload.status = 'error'
        updatePayload.error_message = 'A conexão foi recusada pelo WhatsApp.'
      }
    }

    // 3. Persistir atualizações no banco de dados
    const { error: updateErr } = await supabaseAdmin
      .from('whatsapp_instances')
      .update(updatePayload)
      .eq('id', instance.id)

    if (updateErr) {
      console.error(`[WEBHOOK] Erro ao atualizar whatsapp_instances no banco:`, updateErr.message)
      return new Response('Database update error', { status: 500 })
    }

    // Se a instância desconectar, desabilitar/desconectar os canais associados
    if (updatePayload.status === 'disconnected' || updatePayload.status === 'error') {
      const { data: localGroups } = await supabaseAdmin
        .from('whatsapp_groups')
        .select('channel_id')
        .eq('whatsapp_instance_id', instance.id)

      const channelIdsToDisconnect = (localGroups || [])
        .map(g => g.channel_id)
        .filter(id => id !== null)

      if (channelIdsToDisconnect.length > 0) {
        await supabaseAdmin
          .from('channels')
          .update({ status: 'disconnected', last_sync: new Date().toISOString() })
          .in('id', channelIdsToDisconnect)
        console.log(`[WEBHOOK] Desconectados ${channelIdsToDisconnect.length} canais devido à desconexão da instância.`)
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 })

  } catch (err: any) {
    console.error('[WEBHOOK_INTERNAL] Erro crítico no webhook:', err.message)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
