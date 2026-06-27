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

    // 2. Chamar a Evolution API para deletar a instância física
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (evolutionUrl && evolutionApiKey) {
      const evolutionDeleteUrl = `${evolutionUrl.replace(/\/$/, '')}/instance/delete/${instance.instance_name}`
      
      try {
        console.log(`[EVOLUTION] Deletando instância física ${instance.instance_name} na Evolution API...`)
        const res = await fetch(evolutionDeleteUrl, {
          method: 'DELETE',
          headers: {
            'apikey': evolutionApiKey
          }
        })

        if (!res.ok) {
          const errText = await res.text()
          console.warn(`[EVOLUTION] Evolution API respondeu com status ${res.status}: ${errText}. Ignorando erro para deletar localmente.`)
        } else {
          console.log(`[EVOLUTION] Instância física deletada com sucesso.`)
        }
      } catch (evoErr) {
        console.error(`[EVOLUTION] Erro de rede ao tentar deletar na Evolution API:`, evoErr.message)
      }
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 3. Atualizar canais vinculados aos grupos desta instância para 'disconnected'
    const { data: localGroups } = await supabaseAdmin
      .from('whatsapp_groups')
      .select('channel_id')
      .eq('whatsapp_instance_id', instance.id)

    const channelIdsToDisconnect = (localGroups || [])
      .map(g => g.channel_id)
      .filter(id => id !== null)

    if (channelIdsToDisconnect.length > 0) {
      console.log(`[EVOLUTION_DELETE] Desconectando ${channelIdsToDisconnect.length} canais relacionados...`)
      await supabaseAdmin
        .from('channels')
        .update({
          status: 'disconnected',
          last_sync: new Date().toISOString()
        })
        .in('id', channelIdsToDisconnect)
        .eq('user_id', user.id)
    }

    // Se a instância tiver um canal principal associado, desconecta ele também
    if (instance.channel_id) {
      await supabaseAdmin
        .from('channels')
        .update({
          status: 'disconnected',
          last_sync: new Date().toISOString()
        })
        .eq('id', instance.channel_id)
        .eq('user_id', user.id)
    }

    // 4. Excluir grupos locais desta instância
    await supabaseAdmin
      .from('whatsapp_groups')
      .delete()
      .eq('whatsapp_instance_id', instance.id)
      .eq('user_id', user.id)

    // 5. Excluir a instância de WhatsApp
    const { error: deleteErr } = await supabaseAdmin
      .from('whatsapp_instances')
      .delete()
      .eq('id', instance.id)
      .eq('user_id', user.id)

    if (deleteErr) {
      throw new Error(`Erro ao deletar instância no banco: ${deleteErr.message}`)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Instância e canais desconectados e excluídos com sucesso.'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[EVOLUTION_INSTANCE_DELETE] Erro interno:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
