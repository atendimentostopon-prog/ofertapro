import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const url = new URL(req.url)
    const action = url.searchParams.get('action')

    // 1. Ação para Obter Token de Acesso (JWT) do usuário real de teste
    if (action === 'get_token') {
      const email = url.searchParams.get('email') || 'contatogivaldo@outlook.com'
      console.log(`[TEST_HELPER] Gerando magiclink para ${email}...`)

      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email: email,
        options: {
          redirectTo: 'http://localhost'
        }
      })

      if (error || !data?.properties?.action_link) {
        throw new Error(error?.message || 'Falha ao gerar link de ação.')
      }

      const actionLink = data.properties.action_link
      console.log(`[TEST_HELPER] Efetuando handshake de login manual no link...`)

      // Executar fetch manual para pegar o 302 contendo o fragmento hash de access_token
      const res = await fetch(actionLink, {
        redirect: 'manual'
      })

      const location = res.headers.get('Location')
      if (!location) {
        throw new Error(`Handshake falhou. Status: ${res.status}. Header Location ausente.`)
      }

      console.log(`[TEST_HELPER] Redirecionado para: ${location}`)
      
      // Extrair o token do fragmento hash
      const hashParams = new URLSearchParams(location.split('#')[1] || '')
      const accessToken = hashParams.get('access_token')

      if (!accessToken) {
        throw new Error('Token de acesso não encontrado no fragmento de redirecionamento.')
      }

      return new Response(
        JSON.stringify({ success: true, accessToken }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Ação para gerar uma API Key estática no banco para a public-api
    else if (action === 'setup_apikey') {
      const userId = url.searchParams.get('user_id') || 'ab1620e3-c3c2-4228-8e9e-393ee0f04a93'
      const apiKeyText = 'lof_live_testapikey1234567890'
      
      // Calcular SHA-256 hash da API Key
      const encoder = new TextEncoder()
      const keyData = encoder.encode(apiKeyText)
      const hashBuffer = await crypto.subtle.digest('SHA-256', keyData)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

      console.log(`[TEST_HELPER] Configurando chave de API estática para o user ${userId}...`)

      // Fazer upsert na tabela public.api_keys
      const { data: apiKeyRow, error } = await supabaseAdmin
        .from('api_keys')
        .upsert({
          user_id: userId,
          name: 'Chave de Teste Homologação',
          key_hash: keyHash,
          scopes: ['offers:write', 'offers:read', 'channels:read', 'dispatch:write', 'history:read'],
          status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'key_hash' })
        .select()
        .single()

      if (error) {
        throw new Error(`Erro ao salvar API Key no banco: ${error.message}`)
      }

      return new Response(
        JSON.stringify({ success: true, apiKeyText, apiKeyRow }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Ação inválida. Use ?action=get_token ou ?action=setup_apikey' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err: any) {
    console.error('[TEST_HELPER] Erro:', err.message)
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
