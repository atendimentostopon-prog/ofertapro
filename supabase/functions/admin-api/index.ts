import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders, errorResponse, getRequestContext, json } from './_lib.ts';
import { authorize, requirePermission, RbacError, makeSupabaseDeps, type AdminIdentity } from './rbac.ts';
import type { AuditContext } from './audit.ts';
import * as dashboard from './handlers/dashboard.ts';
import * as admins from './handlers/admins.ts';
import * as roles from './handlers/roles.ts';
import * as audit from './handlers/audit.ts';
import * as session from './handlers/session.ts';
import * as users from './handlers/users.ts';
import * as operation from './handlers/operation.ts';
import * as integrations from './handlers/integrations.ts';
import { mapPgError } from './handlers/_pg-errors.ts';

export type Handler = (
  params: Record<string, unknown>,
  identity: AdminIdentity,
  ctx: AuditContext,
) => Promise<unknown>;
export type HandlerMap = Record<string, Record<string, { permission: string | null; handler: Handler }>>;

const HANDLERS: HandlerMap = {
  ping: {
    read: { permission: 'dashboard.read', handler: async () => ({ pong: true }) },
  },
  session: {
    whoami: { permission: null, handler: session.whoami },
  },
  dashboard: {
    summary: { permission: 'dashboard.read', handler: dashboard.summary },
  },
  admins: {
    list:       { permission: 'admins.read',   handler: admins.list },
    invite:     { permission: 'admins.manage', handler: admins.invite },
    suspend:    { permission: 'admins.manage', handler: admins.suspend },
    reactivate: { permission: 'admins.manage', handler: admins.reactivate },
  },
  roles: {
    list:   { permission: 'roles.read',   handler: roles.list },
    assign: { permission: 'roles.manage', handler: roles.assign },
    revoke: { permission: 'roles.manage', handler: roles.revoke },
  },
  audit: {
    list: { permission: 'audit.read', handler: audit.list },
  },
  users: {
    list:          { permission: 'users.read',            handler: users.list },
    get:           { permission: 'users.read',            handler: users.get },
    suspend:       { permission: 'users.suspend',         handler: users.suspend },
    reactivate:    { permission: 'users.reactivate',      handler: users.reactivate },
    'set-plan':    { permission: 'users.billing.manage',  handler: users.setPlan },
    'extend-trial':{ permission: 'users.billing.manage',  handler: users.extendTrial },
    'add-note':    { permission: 'users.notes.manage',    handler: users.addNote },
    'set-tags':    { permission: 'users.tags.manage',     handler: users.setTags },
  },
  promotions: {
    list: { permission: 'promotions.read', handler: operation.promotionsList },
    get:  { permission: 'promotions.read', handler: operation.promotionGet },
  },
  sends: {
    list: { permission: 'sends.read', handler: operation.sendsList },
  },
  cakto: {
    subscriptions:           { permission: 'cakto.read', handler: integrations.subscriptionsList },
    subscription:            { permission: 'cakto.read', handler: integrations.subscriptionGet },
    'reconcile-local':       { permission: 'cakto.read', handler: integrations.reconcileLocal },
    'remote-subscription':   { permission: 'cakto.read', handler: integrations.remoteSubscription },
    'remote-billing-cycles': { permission: 'cakto.read', handler: integrations.remoteBillingCycles },
    'reconcile-remote':      { permission: 'cakto.read', handler: integrations.reconcileRemote },
  },
  webhooks: {
    events:           { permission: 'webhooks.read', handler: integrations.webhookEventsList },
    event:            { permission: 'webhooks.read', handler: integrations.webhookEventGet },
    'remote-history': { permission: 'webhooks.read', handler: integrations.webhooksRemoteHistory },
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
    if (entry.permission !== null) requirePermission(identity, entry.permission);
    const data = await entry.handler(params, identity, ctx);
    return json({ data }, 200, req, rid);
  } catch (err) {
    if (err instanceof RbacError) return errorResponse(err.code, err.message, req, rid);
    const mapped = mapPgError(err);
    if (mapped) return errorResponse(mapped.code, mapped.message, req, rid);
    const e = err as { code?: string; message?: string };
    console.error('[admin-api]', resource, action, e?.message ?? err);
    return errorResponse('internal', 'Erro interno.', req, rid);
  }
});
