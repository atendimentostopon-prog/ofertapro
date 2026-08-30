import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const DEV = Deno.env.get('ENVIRONMENT') === 'dev';
const ALLOWED_ORIGINS = DEV
  ? ['https://admin.aflyo.com.br', 'http://localhost:5273']
  : ['https://admin.aflyo.com.br'];

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-request-id',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

export type ErrorCode =
  | 'unauthenticated' | 'forbidden' | 'not_found' | 'conflict'
  | 'validation' | 'rate_limited' | 'internal';

export const STATUS_BY_CODE: Record<ErrorCode, number> = {
  unauthenticated: 401, forbidden: 403, not_found: 404, conflict: 409,
  validation: 422, rate_limited: 429, internal: 500,
};

export function json(data: unknown, status: number, req: Request): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json', 'X-Request-Id': getRequestContext(req).request_id },
  });
}

export function errorResponse(code: ErrorCode, message: string, req: Request): Response {
  return json({ error: { code, message } }, STATUS_BY_CODE[code], req);
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function getRequestContext(req: Request): { ip: string | null; user_agent: string | null; request_id: string } {
  const fwd = req.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : null;
  return {
    ip: ip || null,
    user_agent: req.headers.get('user-agent'),
    request_id: req.headers.get('x-request-id') || crypto.randomUUID(),
  };
}
