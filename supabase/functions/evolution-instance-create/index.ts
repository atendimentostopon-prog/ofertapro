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
    const { name } = body

    if (!name || name.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'O nome da instância é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Validar limite de 3 instâncias por usuário
    const { count, error: countError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .in('status', ['creating', 'qrcode', 'connecting', 'connected', 'disconnected'])

    if (countError) {
      throw new Error(`Erro ao consultar limite de instâncias: ${countError.message}`)
    }

    if (count !== null && count >= 3) {
      return new Response(
        JSON.stringify({ error: 'Você atingiu o limite de 3 instâncias WhatsApp.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Gerar instance_name único: lo_{user_id_curto}_{contador}
    const userIdShort = user.id.slice(0, 8)
    
    // Obter contagem histórica para incrementar o número da instância e evitar conflitos de nomes únicos
    const { count: totalCount, error: totalCountError } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)

    if (totalCountError) {
      throw new Error(`Erro ao contar instâncias históricas: ${totalCountError.message}`)
    }

    const nextCounter = (totalCount || 0) + 1
    const counterStr = String(nextCounter).padStart(3, '0')
    const instanceName = `lo_${userIdShort}_${counterStr}`

    // 3. Obter configurações da Evolution API
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')
    const webhookSecret = Deno.env.get('EVOLUTION_WEBHOOK_SECRET') || ''

    if (!evolutionUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: 'A integração com WhatsApp não está configurada pelo administrador (secrets ausentes).' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Gerar webhook URL baseado no projeto Supabase
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const webhookUrl = `${supabaseUrl}/functions/v1/evolution-webhook`

    // 4. Criar a instância no banco primeiro com status 'creating'
    const { data: dbInstance, error: dbError } = await supabaseAdmin
      .from('whatsapp_instances')
      .insert({
        user_id: user.id,
        name: name.trim(),
        instance_name: instanceName,
        status: 'creating',
        provider: 'evolution'
      })
      .select()
      .single()

    if (dbError) {
      throw new Error(`Erro ao registrar instância no banco: ${dbError.message}`)
    }

    // 5. Chamar a Evolution API para criar a instância física
    const evolutionCreateUrl = `${evolutionUrl.replace(/\/$/, '')}/instance/create`
    
    const requestBody = {
      instanceName: instanceName,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
      webhook: {
        enabled: true,
        url: webhookUrl,
        headers: {
          "x-webhook-secret": webhookSecret
        },
        events: [
          "QRCODE_UPDATED",
          "CONNECTION_UPDATE",
          "MESSAGES_UPSERT",
          "SEND_MESSAGE"
        ]
      }
    }

    try {
      console.log(`[EVOLUTION] Criando instância física ${instanceName}...`)
      const res = await fetch(evolutionCreateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': evolutionApiKey
        },
        body: JSON.stringify(requestBody)
      })

      if (!res.ok) {
        const errorText = await res.text()
        throw new Error(`Evolution API respondeu com status ${res.status}: ${errorText}`)
      }

      const evoData = await res.json()
      console.log(`[EVOLUTION] Instância física criada com sucesso:`, evoData)

      // Atualizar status para qrcode se veio qrcode ou pendente
      const qrCode = evoData?.qrcode?.code || null
      const instanceId = evoData?.instance?.instanceId || null

      const { data: updatedInstance, error: updateErr } = await supabaseAdmin
        .from('whatsapp_instances')
        .update({
          status: qrCode ? 'qrcode' : 'connecting',
          instance_id: instanceId,
          qr_code: qrCode,
          qr_code_updated_at: qrCode ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbInstance.id)
        .select()
        .single()

      if (updateErr) {
        throw new Error(`Erro ao atualizar metadados da instância no banco: ${updateErr.message}`)
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: updatedInstance
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } catch (evoErr: any) {
      console.error(`[EVOLUTION] Falha ao criar na Evolution API:`, evoErr.message)

      // Se falhou na Evolution, marca no banco local como 'error'
      await supabaseAdmin
        .from('whatsapp_instances')
        .update({
          status: 'error',
          error_message: evoErr.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', dbInstance.id)

      return new Response(
        JSON.stringify({ error: `Erro na Evolution API: ${evoErr.message}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (err: any) {
    console.error('[EVOLUTION_CREATE] Erro interno:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
