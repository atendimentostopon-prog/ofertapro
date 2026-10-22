// Deno Edge Function: supabase/functions/assistant-chat/index.ts
// Assistente Lyo. Valida JWT, checa cota (plan_limits), monta resumo da conta
// com o JWT do usuário (RLS), chama o Gemini e grava a conversa (service_role).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { withAlerts } from "../_shared/ops/with-alerts.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { KNOWLEDGE } from './knowledge.ts'
import {
  ACCOUNT_COLUMNS, HISTORY_LIMIT, buildAccountSnapshot, buildGeminiRequest, buildSystemInstruction,
  messageRows, parseGeminiResponse, resolvePlan, validateMessage,
  type AccountData, type StoredMessage,
} from './core.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(withAlerts("assistant-chat", async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json(405, { code: 'method_not_allowed' })

  // Definida depois da reserva; enquanto não for null, uma falha devolve a pergunta.
  let releaseQuota: (() => Promise<void>) | null = null
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json(401, { code: 'unauthorized' })

    const url = Deno.env.get('SUPABASE_URL') ?? ''
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json(401, { code: 'unauthorized' })

    const body = await req.json().catch(() => null)
    const message = validateMessage(body?.message)
    if (!message) return json(400, { code: 'invalid_message' })

    const apiKey = Deno.env.get('GEMINI_API_KEY')
    if (!apiKey) {
      console.error('[assistant-chat] GEMINI_API_KEY ausente')
      return json(502, { code: 'assistant_unavailable' })
    }
    const model = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash-lite'
    const now = new Date()
    // Só a função grava conversa e cota (sem policy de INSERT para authenticated).
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const userId = user.id

    // Cota. Leituras com o JWT do usuário: RLS garante que só vê o que é dele.
    const { data: profile } = await userClient.from('profiles').select(ACCOUNT_COLUMNS.profile).eq('id', userId).maybeSingle()
    const plan = resolvePlan(profile?.plan)
    const { data: limits } = await userClient.from('plan_limits').select('assistant_daily_messages').eq('plan', plan).maybeSingle()
    const limit = limits?.assistant_daily_messages ?? 0
    // Reserva atômica antes de chamar o Gemini: requisições paralelas não furam o limite.
    const { data: used, error: reserveError } = await admin.rpc('assistant_reserve_quota', { p_user: userId, p_limit: limit })
    if (reserveError) {
      console.error('[assistant-chat] falha ao reservar cota', reserveError.message)
      return json(500, { code: 'internal' })
    }
    if (used == null) return json(429, { code: 'quota_exceeded', limit })
    releaseQuota = async () => {
      const { error } = await admin.rpc('assistant_release_quota', { p_user: userId })
      if (error) console.error('[assistant-chat] falha ao devolver cota', error.message)
    }

    const [historyRes, botRes, channelsRes, instancesRes, failuresRes] = await Promise.all([
      userClient.from('assistant_messages').select('role, content').eq('user_id', user.id)
        .order('created_at', { ascending: false }).limit(HISTORY_LIMIT),
      userClient.from('bot_configs').select(ACCOUNT_COLUMNS.bot).eq('user_id', user.id).limit(1).maybeSingle(),
      userClient.from('channels').select(ACCOUNT_COLUMNS.channels).eq('user_id', user.id).limit(30),
      userClient.from('whatsapp_instances').select(ACCOUNT_COLUMNS.instances).eq('user_id', user.id).limit(10),
      userClient.from('history').select(ACCOUNT_COLUMNS.failures).eq('user_id', user.id)
        .in('status', ['error', 'failed', 'partial']).order('sent_at', { ascending: false }).limit(5),
    ])

    const account: AccountData = {
      profile: profile ?? null,
      bot: botRes.data ?? null,
      channels: channelsRes.data ?? [],
      instances: instancesRes.data ?? [],
      failures: failuresRes.data ?? [],
    }
    const history = ((historyRes.data ?? []) as StoredMessage[]).reverse()

    const request = buildGeminiRequest({
      system: buildSystemInstruction(KNOWLEDGE, buildAccountSnapshot(account, now)),
      history,
      message,
    })

    let gemini: Response
    try {
      gemini = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(20_000),
      })
    } catch (e) {
      console.error('[assistant-chat] falha/timeout no Gemini', e)
      await releaseQuota()
      return json(502, { code: 'assistant_unavailable' })
    }
    if (!gemini.ok) {
      console.error('[assistant-chat] Gemini', gemini.status, (await gemini.text()).slice(0, 500))
      await releaseQuota()
      return json(502, { code: 'assistant_unavailable' })
    }

    const reply = parseGeminiResponse(await gemini.json())
    releaseQuota = null // o Gemini respondeu: a pergunta conta

    const { error: insertError } = await admin.from('assistant_messages').insert(messageRows(userId, message, reply, now))
    if (insertError) console.error('[assistant-chat] falha ao gravar conversa', insertError.message)

    return json(200, { reply: reply.text, remaining: Math.max(0, limit - used) })
  } catch (e) {
    console.error('[assistant-chat] erro inesperado', e)
    if (releaseQuota) await releaseQuota()
    return json(500, { code: 'internal' })
  }
}))
