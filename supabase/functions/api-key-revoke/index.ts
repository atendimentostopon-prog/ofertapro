import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // CORS Preflight
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

    // 2. Extrair dados da requisição
    const { id } = await req.json()
    if (!id) {
      return new Response(
        JSON.stringify({ error: 'ID da chave de API é obrigatório.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 3. Inicializar cliente Admin com a service_role para desativação no banco de dados
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Revogar a chave correspondente de forma segura
    const { error: dbError } = await supabaseAdmin
      .from('api_keys')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .eq('user_id', user.id) // Garante propriedade da chave

    if (dbError) {
      throw new Error(`Erro ao revogar chave de API no banco: ${dbError.message}`)
    }

    // Se o bot multi-tenant estava usando exatamente esta chave, limpa a
    // cópia no Vault (SEC-4) para ele parar de tentar disparar com uma chave
    // morta (evita spam de 401). O usuário gera uma nova chave para religar.
    const { data: vaultKey } = await supabaseAdmin
      .rpc('get_bot_config_api_key', { p_user_id: user.id })

    if (typeof vaultKey === 'string' && vaultKey) {
      const encoder = new TextEncoder()
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(vaultKey))
      const storedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')

      const { data: revokedKey } = await supabaseAdmin
        .from('api_keys')
        .select('key_hash')
        .eq('id', id)
        .maybeSingle()

      if (revokedKey?.key_hash === storedHash) {
        await supabaseAdmin
          .rpc('set_bot_config_api_key', { p_user_id: user.id, p_key: null })
      }
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Chave de API revogada com sucesso.' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[API_KEY_REVOKE] Erro crítico:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
