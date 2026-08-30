import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, errorResponse, json } from './_lib.ts';
import { authorize, requirePermission, RbacError, makeSupabaseDeps, type AdminIdentity } from './rbac.ts';
import { auditContextFrom, type AuditContext } from './audit.ts';

export type Handler = (
  params: Record<string, unknown>,
  identity: AdminIdentity,
  ctx: AuditContext,
) => Promise<unknown>;
export type HandlerMap = Record<string, Record<string, { permission: string; handler: Handler }>>;

// Registry. Handlers reais entram nas Tasks 6 a 8.
const HANDLERS: HandlerMap = {
  ping: {
    read: { permission: 'dashboard.read', handler: async () => ({ pong: true }) },
  },
};

const deps = makeSupabaseDeps();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return errorResponse('validation', 'Use POST.', req);

  let body: { resource?: string; action?: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation', 'Corpo JSON invalido.', req);
  }
  const { resource, action, params = {} } = body;
  if (!resource || !action) return errorResponse('validation', 'resource e action sao obrigatorios.', req);

  const entry = HANDLERS[resource]?.[action];
  if (!entry) return errorResponse('not_found', `Rota desconhecida: ${resource}/${action}.`, req);

  try {
    const identity = await authorize(req, deps);
    requirePermission(identity, entry.permission);
    const ctx = auditContextFrom(req);
    const data = await entry.handler(params, identity, ctx);
    return json({ data }, 200, req);
  } catch (err) {
    if (err instanceof RbacError) return errorResponse(err.code, err.message, req);
    const e = err as { code?: string; message?: string };
    // Erros das RPCs plpgsql chegam com hint no message; mapeamento fino nas Tasks 7-8.
    console.error('[admin-api]', resource, action, e?.message ?? err);
    return errorResponse('internal', 'Erro interno.', req);
  }
});
