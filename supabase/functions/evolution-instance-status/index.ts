import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Não autorizado. Cabeçalho Authorization ausente.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Sessão inválida ou expirada.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { whatsapp_instance_id } = body

    if (!whatsapp_instance_id) {
      return new Response(
        JSON.stringify({ error: 'O ID da instância (whatsapp_instance_id) é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1. Validar propriedade da instância
    const { data: instance, error: fetchError } = await supabaseClient
      .from('whatsapp_instances')
      .select('*')
      .eq('id', whatsapp_instance_id)
      .maybeSingle()

    if (fetchError || !instance) {
      return new Response(
        JSON.stringify({ error: 'Instância não encontrada ou você não tem acesso.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Consultar status físico na Evolution API
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evolutionUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: 'A integração com WhatsApp não está configurada pelo administrador.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const evolutionStatusUrl = `${evolutionUrl.replace(/\/$/, '')}/instance/connectionState/${instance.instance_name}`

    let updatedState = instance.status
    let phone = instance.phone_number
    let profile = instance.profile_name
    let qrCode = instance.qr_code

    try {
      console.log(`[EVOLUTION] Consultando conexão para a instância ${instance.instance_name}...`)
      const res = await fetch(evolutionStatusUrl, {
        method: 'GET',
        headers: {
          'apikey': evolutionApiKey
        }
      })

      if (res.ok) {
        const evoData = await res.json()
        console.log(`[EVOLUTION] Resposta de conexão:`, evoData)
        const state = evoData?.instance?.state // 'open', 'close', 'connecting'

        if (state === 'open') {
          updatedState = 'connected'
          qrCode = null
        } else if (state === 'connecting') {
          updatedState = 'connecting'
        } else if (state === 'close') {
          updatedState = 'disconnected'
        }

        // Se retornar conectado, tentar buscar os dados do perfil do whatsapp (número/nome) para enriquecer o banco
        if (updatedState === 'connected') {
          try {
            const evoSettingsUrl = `${evolutionUrl.replace(/\/$/, '')}/instance/fetchInstances?instanceName=${instance.instance_name}`
            const settingsRes = await fetch(evoSettingsUrl, {
              method: 'GET',
              headers: { 'apikey': evolutionApiKey }
            })
            if (settingsRes.ok) {
              const settingsData = await settingsRes.json()
              const details = Array.isArray(settingsData) 
                ? settingsData.find((i: any) => i.name === instance.instance_name)
                : settingsData

              if (details?.connectionStatus === 'ONLINE') {
                phone = details?.ownerJid ? details.ownerJid.split(':')[0] : phone
                profile = details?.profileName || profile
              }
            }
          } catch (profileErr) {
            console.warn('[EVOLUTION] Falha ao enriquecer detalhes do perfil em background:', profileErr.message)
          }
        }
      } else if (res.status === 404) {
        // Se a instância não existe na Evolution, marca como desconectada localmente
        updatedState = 'disconnected'
      }
    } catch (evoErr) {
      console.warn(`[EVOLUTION] Erro de rede ao consultar status na Evolution:`, evoErr.message)
    }

    // 3. Atualizar dados no banco
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: updatedInstance, error: updateErr } = await supabaseAdmin
      .from('whatsapp_instances')
      .update({
        status: updatedState,
        phone_number: phone,
        profile_name: profile,
        qr_code: qrCode,
        updated_at: new Date().toISOString()
      })
      .eq('id', whatsapp_instance_id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (updateErr) {
      throw new Error(`Erro ao atualizar status da instância no banco: ${updateErr.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: updatedInstance
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[EVOLUTION_STATUS] Erro interno:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
