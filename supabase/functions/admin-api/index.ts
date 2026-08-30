import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, errorResponse, getRequestContext, json } from './_lib.ts';
import { authorize, requirePermission, RbacError, makeSupabaseDeps, type AdminIdentity } from './rbac.ts';
import type { AuditContext } from './audit.ts';
import * as dashboard from './handlers/dashboard.ts';

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
  dashboard: {
    summary: { permission: 'dashboard.read', handler: dashboard.summary },
  },
};

const deps = makeSupabaseDeps();

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  const ctx = getRequestContext(req);
  const rid = ctx.request_id;

  if (req.method !== 'POST') return errorResponse('validation', 'Use POST.', req, rid);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse('validation', 'Corpo JSON invalido.', req, rid);
  }
  if (!body || typeof body !== 'object') {
    return errorResponse('validation', 'Corpo deve ser um objeto JSON.', req, rid);
  }
  const { resource, action, params = {} } = body as {
    resource?: string; action?: string; params?: Record<string, unknown>;
  };
  if (!resource || !action) return errorResponse('validation', 'resource e action sao obrigatorios.', req, rid);

  const entry = HANDLERS[resource]?.[action];
  if (!entry) return errorResponse('not_found', `Rota desconhecida: ${resource}/${action}.`, req, rid);

  try {
    const identity = await authorize(req, deps);
    requirePermission(identity, entry.permission);
    const data = await entry.handler(params, identity, ctx);
    return json({ data }, 200, req, rid);
  } catch (err) {
    if (err instanceof RbacError) return errorResponse(err.code, err.message, req, rid);
    const e = err as { code?: string; message?: string };
    console.error('[admin-api]', resource, action, e?.message ?? err);
    return errorResponse('internal', 'Erro interno.', req, rid);
  }
});
