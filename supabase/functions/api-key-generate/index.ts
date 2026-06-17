import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Tratamento de CORS Preflight
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

    // 1. Inicializar cliente Supabase com o token do usuário para autenticação
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // Obter dados do usuário logado
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação inválido ou expirado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Inicializar cliente Admin com a service_role para operações seguras de escrita
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Revogar qualquer chave anterior ativa do mesmo usuário
    await supabaseAdmin
      .from('api_keys')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', user.id)
      .eq('status', 'active')

    // 3. Gerar API Key segura (lof_live_ + 48 caracteres hex)
    const buffer = new Uint8Array(24)
    crypto.getRandomValues(buffer)
    const randomHex = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join('')
    const apiKey = `lof_live_${randomHex}`

    // 4. Calcular Hash SHA-256 da chave gerada
    const encoder = new TextEncoder()
    const keyData = encoder.encode(apiKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', keyData)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const keyPrefix = 'lof_live_'
    const keyLast4 = apiKey.slice(-4)

    // 5. Salvar hash e metadados no banco de dados
    const { data: insertedData, error: dbError } = await supabaseAdmin
      .from('api_keys')
      .insert({
        user_id: user.id,
        name: 'Chave Principal',
        key_hash: keyHash,
        key_prefix: keyPrefix,
        key_last4: keyLast4,
        status: 'active',
        scopes: ['offers:write', 'offers:read', 'channels:read', 'dispatch:write', 'history:read']
      })
      .select()
      .single()

    if (dbError) {
      throw new Error(`Erro ao salvar chave de API no banco: ${dbError.message}`)
    }

    // Retornar a chave pura apenas uma vez ao cliente, junto com os metadados cadastrados
    return new Response(
      JSON.stringify({
        success: true,
        apiKey: apiKey, // Exibida apenas uma vez
        metadata: {
          id: insertedData.id,
          name: insertedData.name,
          key_prefix: insertedData.key_prefix,
          key_last4: insertedData.key_last4,
          status: insertedData.status,
          scopes: insertedData.scopes,
          created_at: insertedData.created_at
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[API_KEY_GENERATE] Erro crítico:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
