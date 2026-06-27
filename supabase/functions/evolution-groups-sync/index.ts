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

    // 2. Validar que está conectada
    if (instance.status !== 'connected') {
      return new Response(
        JSON.stringify({ error: 'O WhatsApp precisa estar conectado para sincronizar os grupos.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Consultar grupos na Evolution API
    const evolutionUrl = Deno.env.get('EVOLUTION_API_URL')
    const evolutionApiKey = Deno.env.get('EVOLUTION_API_KEY')

    if (!evolutionUrl || !evolutionApiKey) {
      return new Response(
        JSON.stringify({ error: 'A integração com WhatsApp não está configurada pelo administrador.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const fetchGroupsUrl = `${evolutionUrl.replace(/\/$/, '')}/group/fetchAllGroups/${instance.instance_name}?getParticipants=false`

    console.log(`[EVOLUTION] Sincronizando grupos da instância ${instance.instance_name}...`)
    const res = await fetch(fetchGroupsUrl, {
      method: 'GET',
      headers: {
        'apikey': evolutionApiKey
      }
    })

    if (!res.ok) {
      const errText = await res.text()
      throw new Error(`Evolution API respondeu status ${res.status}: ${errText}`)
    }

    const groupsData = await res.json()
    console.log(`[EVOLUTION] Encontrados ${groupsData?.length || 0} grupos no WhatsApp.`)

    const fetchedGroups = Array.isArray(groupsData) ? groupsData : []

    // 4. Salvar ou atualizar no banco local
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const results = []

    if (fetchedGroups.length > 0) {
      // Mapear os grupos vindo da Evolution para a nossa tabela
      const upsertData = fetchedGroups.map((g: any) => ({
        user_id: user.id,
        whatsapp_instance_id: instance.id,
        evolution_group_id: g.id,
        name: g.subject || 'Grupo sem nome',
        picture_url: g.pictureUrl || null,
        participants_count: g.size !== undefined ? Number(g.size) : null,
        announce: g.announce === true || g.announce === 'true',
        restrict: g.restrict === true || g.restrict === 'true',
        status: 'available',
        last_sync_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }))

      // Executa upsert em lote usando a constraint unique (whatsapp_instance_id, evolution_group_id)
      // O Supabase JS client aceita a opção onConflict para Upsert
      const { data, error: upsertErr } = await supabaseAdmin
        .from('whatsapp_groups')
        .upsert(upsertData, { onConflict: 'whatsapp_instance_id,evolution_group_id' })
        .select()

      if (upsertErr) {
        throw new Error(`Erro ao salvar grupos no banco: ${upsertErr.message}`)
      }
      
      results.push(...(data || []))
    }

    // 5. Marcar como inativos ou indisponíveis os grupos locais que foram deletados ou saídos (não vieram na lista da Evolution)
    const activeGroupIds = fetchedGroups.map((g: any) => g.id)
    if (activeGroupIds.length > 0) {
      await supabaseAdmin
        .from('whatsapp_groups')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('whatsapp_instance_id', instance.id)
        .eq('user_id', user.id)
        .not('evolution_group_id', 'in', `(${activeGroupIds.join(',')})`)
    } else {
      // Se não veio nenhum grupo da API, marca todos locais desta instância como removed
      await supabaseAdmin
        .from('whatsapp_groups')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('whatsapp_instance_id', instance.id)
        .eq('user_id', user.id)
    }

    // Atualizar last_sync_at na instância
    await supabaseAdmin
      .from('whatsapp_instances')
      .update({ last_sync_at: new Date().toISOString() })
      .eq('id', instance.id)
      .eq('user_id', user.id)

    // Buscar lista final de grupos sincronizados para retornar ao frontend
    const { data: finalGroups } = await supabaseClient
      .from('whatsapp_groups')
      .select('*')
      .eq('whatsapp_instance_id', instance.id)
      .eq('status', 'available')
      .order('name', { ascending: true })

    return new Response(
      JSON.stringify({
        success: true,
        data: finalGroups || []
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[EVOLUTION_GROUPS_SYNC] Erro interno:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno no servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
