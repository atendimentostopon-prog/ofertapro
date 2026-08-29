import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/**
 * Revela a chave de API ATIVA do usuário em texto puro, sem precisar
 * revogar/regenerar.
 *
 * Importante: api_keys guarda apenas o hash SHA-256 — a chave pura NÃO
 * é recuperável de lá. A única cópia em texto puro fica em
 * bot_configs.link_oferta_api_key, gravada no momento da geração pela
 * função api-key-generate (necessária para o bot multi-tenant disparar).
 *
 * Consequência: só é possível revelar chaves geradas/regeneradas DEPOIS
 * que a sincronização com bot_configs entrou no ar. Para chaves antigas,
 * o retorno é { apiKey: null, reason: 'not_synced' } e o usuário precisa
 * regenerar uma vez.
 */
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

    // Autentica pelo JWT do usuário logado
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Token de autenticação inválido ou expirado.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Precisa existir uma chave ativa de fato
    const { data: activeKey } = await supabaseAdmin
      .from('api_keys')
      .select('id, key_hash, key_last4')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle()

    if (!activeKey) {
      return new Response(
        JSON.stringify({ apiKey: null, reason: 'no_active_key' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: botCfg } = await supabaseAdmin
      .from('bot_configs')
      .select('link_oferta_api_key')
      .eq('user_id', user.id)
      .maybeSingle()

    const stored = botCfg?.link_oferta_api_key || null

    // Confere que a cópia em texto puro corresponde MESMO à chave ativa
    // (evita devolver uma chave defasada de bot_configs).
    let matches = false
    if (stored) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stored))
      const storedHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('')
      matches = storedHash === activeKey.key_hash
    }

    if (!stored || !matches) {
      return new Response(
        JSON.stringify({ apiKey: null, reason: 'not_synced', key_last4: activeKey.key_last4 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ apiKey: stored, key_last4: activeKey.key_last4 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err: any) {
    console.error('[API_KEY_REVEAL] Erro crítico:', err.message)
    return new Response(
      JSON.stringify({ error: err.message || 'Erro interno do servidor.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
