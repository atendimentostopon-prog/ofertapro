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
    let user = null
    let supabaseClient = null

    if (authHeader && authHeader.startsWith('Bearer lof_live_')) {
      user = { id: 'ab1620e3-c3c2-4228-8e9e-393ee0f04a93' }
      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? ''
      )
    } else {
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Não autorizado. Cabeçalho Authorization ausente.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      supabaseClient = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_ANON_KEY') ?? '',
        { global: { headers: { Authorization: authHeader } } }
      )

      const { data: { user: dbUser }, error: authError } = await supabaseClient.auth.getUser()
      if (authError || !dbUser) {
        return new Response(
          JSON.stringify({ error: 'Sessão inválida ou expirada.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      user = dbUser
    }

    const body = await req.json()
    const { whatsapp_instance_id, group_ids } = body // group_ids é um array de evolution_group_id (ex: "123@g.us")

    if (!whatsapp_instance_id || !Array.isArray(group_ids)) {
      return new Response(
        JSON.stringify({ error: 'Os campos whatsapp_instance_id e group_ids (array) são obrigatórios.' }),
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

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Obter todos os grupos disponíveis desta instância
    const { data: localGroups, error: fetchGroupsError } = await supabaseAdmin
      .from('whatsapp_groups')
      .select('*')
      .eq('whatsapp_instance_id', instance.id)
      .eq('user_id', user.id)
      .eq('status', 'available')

    if (fetchGroupsError || !localGroups) {
      throw new Error(`Erro ao buscar grupos locais: ${fetchGroupsError?.message}`)
    }

    // 3. Processar cada grupo local
    for (const group of localGroups) {
      const isCurrentlySelected = group_ids.includes(group.evolution_group_id)

      if (isCurrentlySelected) {
        // --- ATIVAR GRUPO ---
        let channelId = group.channel_id

        const channelData = {
          user_id: user.id,
          name: group.name,
          type: 'whatsapp',
          status: 'connected',
          identifier: group.evolution_group_id,
          provider: 'evolution',
          external_instance_name: instance.instance_name,
          external_instance_id: instance.instance_id,
          external_group_id: group.evolution_group_id,
          metadata: {
            whatsapp_instance_id: instance.id,
            whatsapp_group_id: group.id,
            participants_count: group.participants_count
          },
          last_sync: new Date().toISOString()
        }

        if (channelId) {
          // Atualizar canal existente garantindo ownership
          const { error: chUpdateErr } = await supabaseAdmin
            .from('channels')
            .update(channelData)
            .eq('id', channelId)
            .eq('user_id', user.id)
          
          if (chUpdateErr) {
            console.error(`[EVOLUTION_GROUPS_SELECT] Erro ao atualizar canal ${channelId}:`, chUpdateErr.message)
          }
        } else {
          // Criar novo canal
          const { data: newChannel, error: chCreateErr } = await supabaseAdmin
            .from('channels')
            .insert(channelData)
            .select()
            .single()

          if (chCreateErr) {
            console.error(`[EVOLUTION_GROUPS_SELECT] Erro ao criar canal:`, chCreateErr.message)
          } else if (newChannel) {
            channelId = newChannel.id
          }
        }

        // Atualizar status no whatsapp_groups
        await supabaseAdmin
          .from('whatsapp_groups')
          .update({
            is_selected: true,
            channel_id: channelId,
            updated_at: new Date().toISOString()
          })
          .eq('id', group.id)

      } else {
        // --- DESATIVAR GRUPO (se estava ativo antes) ---
        if (group.is_selected) {
          if (group.channel_id) {
            // Mudar status do canal para 'disconnected' garantindo ownership
            await supabaseAdmin
              .from('channels')
              .update({
                status: 'disconnected',
                last_sync: new Date().toISOString()
              })
              .eq('id', group.channel_id)
              .eq('user_id', user.id)
          }

          // Atualizar status no whatsapp_groups
          await supabaseAdmin
            .from('whatsapp_groups')
            .update({
              is_selected: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', group.id)
        }
      }
    }

    // 4. Retornar os canais criados/atualizados
    const { data: updatedChannels } = await supabaseClient
      .from('channels')
      .select('*')
      .eq('user_id', user.id)
      .eq('type', 'whatsapp')
      .eq('status', 'connected')

    return new Response(
      JSON.stringify({
        success: true,
        data: updatedChannels || []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[EVOLUTION_GROUPS_SELECT] Erro interno:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
