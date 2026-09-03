import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';
import { caktoFetch } from '../../_shared/cakto.ts';

// ---------------------------------------------------------------------------
// helpers puros
// ---------------------------------------------------------------------------

export function reqId(params: Record<string, unknown>, key = 'id'): string {
  const v = params[key];
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', `${key} e obrigatorio.`);
  return v.trim();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

// ---------------------------------------------------------------------------
// leitura local
// ---------------------------------------------------------------------------

export const subscriptionsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_subscriptions_list', {
    p_search: str(params.search), p_status: str(params.status),
    p_page: num(params.page, 1), p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const subscriptionGet: Handler = async (params) => {
  const id = reqId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_subscription_get', { p_id: id });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Assinatura nao encontrada.');
  return data;
};

export const webhookEventsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_webhook_events_list', {
    p_type: str(params.type), p_sub: str(params.providerSubscriptionId),
    p_page: num(params.page, 1), p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const webhookEventGet: Handler = async (params) => {
  const id = reqId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_webhook_event_get', { p_id: id });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Evento nao encontrado.');
  return data;
};

export const reconcileLocal: Handler = async () => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_reconcile_local', {});
  if (error) throw new Error(error.message);
  return data;
};

// ---------------------------------------------------------------------------
// proxy da API da Cakto
// ---------------------------------------------------------------------------

// mapa offerId -> plano (copia de cakto-webhook/lib.ts; manter em sincronia)
const OFFER_MAP: Record<string, { plan: string; cycle: string }> = {
  oy56ftb: { plan: 'starter', cycle: 'monthly' },
  '5523xh7': { plan: 'starter', cycle: 'yearly' },
  '38r43o4': { plan: 'pro', cycle: 'monthly' },
  '3uikgc2': { plan: 'pro', cycle: 'yearly' },
  '3chkywe': { plan: 'enterprise', cycle: 'monthly' },
  ig6ciuy: { plan: 'enterprise', cycle: 'yearly' },
};

const CAKTO_STATUS: Record<string, 'active' | 'past_due' | 'canceled' | 'expired'> = {
  active: 'active', trial: 'active',
  paused: 'past_due',
  inactive: 'expired', expired: 'expired',
  canceled: 'canceled', cancelled: 'canceled',
};

export function normalizeCaktoStatus(raw: unknown): 'active' | 'past_due' | 'canceled' | 'expired' {
  const k = String(raw ?? '').toLowerCase().trim();
  const v = CAKTO_STATUS[k];
  if (!v) throw new RbacError('validation', `Status desconhecido da Cakto: ${String(raw)}`);
  return v;
}

export type NormalizedSub = {
  provider_subscription_id: string;
  customer_email: string | null;
  plan_code: string | null;
  billing_cycle: string | null;
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  amount: number;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

export function normalizeCaktoSubscription(raw: Record<string, unknown>): NormalizedSub {
  const offerId = (raw.offer as { id?: string } | undefined)?.id ?? '';
  const mapped = OFFER_MAP[offerId] ?? null;
  const email = (raw.customer as { email?: string } | undefined)?.email ?? null;
  const nextPay = typeof raw.next_payment_date === 'string' ? raw.next_payment_date : null;
  const status = normalizeCaktoStatus(raw.status);
  return {
    provider_subscription_id: String(raw.id ?? ''),
    customer_email: email ? email.toLowerCase().trim() : null,
    plan_code: mapped?.plan ?? null,
    billing_cycle: mapped?.cycle ?? null,
    status,
    amount: Number.parseFloat(String(raw.amount ?? '0')) || 0,
    current_period_start: typeof raw.createdAt === 'string' ? raw.createdAt : null,
    current_period_end: nextPay,
    cancel_at_period_end: status === 'canceled' && !!nextPay && new Date(nextPay).getTime() > Date.now(),
    canceled_at: typeof raw.canceledAt === 'string' ? raw.canceledAt : null,
  };
}

async function caktoJson(path: string): Promise<{ status: number; body: unknown }> {
  const res = await caktoFetch(path);
  let body: unknown = null;
  try { body = await res.json(); } catch { /* body null */ }
  return { status: res.status, body };
}

export const remoteSubscription: Handler = async (params) => {
  const id = reqId(params, 'providerSubscriptionId');
  const { status, body } = await caktoJson(`/subscriptions/${encodeURIComponent(id)}/`);
  if (status === 404) throw new RbacError('not_found', 'Assinatura nao existe na Cakto.');
  if (status < 200 || status >= 300) throw new Error(`Cakto /subscriptions/${id}/ -> ${status}`);
  return { raw: body, normalized: normalizeCaktoSubscription(body as Record<string, unknown>) };
};

export const remoteBillingCycles: Handler = async (params) => {
  const id = reqId(params, 'providerSubscriptionId');
  const { status, body } = await caktoJson(`/subscriptions/${encodeURIComponent(id)}/billing-cycles/`);
  if (status === 404) throw new RbacError('not_found', 'Assinatura nao existe na Cakto.');
  if (status < 200 || status >= 300) throw new Error(`Cakto billing-cycles -> ${status}`);
  const results = ((body as { results?: unknown[] })?.results ?? []) as Record<string, unknown>[];
  return { items: results };
};

export const reconcileRemote: Handler = async () => {
  const svc = serviceClient();
  const { data: locais, error } = await svc
    .from('subscriptions')
    .select('id, provider_subscription_id, status, user_id, profiles(email)');
  if (error) throw new Error(error.message);
  const localById = new Map<string, { id: string; status: string; email: string | null }>();
  for (const r of (locais ?? []) as Record<string, unknown>[]) {
    localById.set(String(r.provider_subscription_id), {
      id: String(r.id), status: String(r.status),
      email: ((r.profiles as { email?: string } | null)?.email) ?? null,
    });
  }
  const remoteActive: NormalizedSub[] = [];
  let truncated = false;
  for (let page = 1; page <= 5; page++) {
    const { status, body } = await caktoJson(`/subscriptions/?status=active&limit=100&page=${page}`);
    if (status < 200 || status >= 300) throw new Error(`Cakto /subscriptions/ -> ${status}`);
    const b = body as { results?: Record<string, unknown>[]; next?: string | null };
    for (const r of b.results ?? []) remoteActive.push(normalizeCaktoSubscription(r));
    if (!b.next) break;
    if (page === 5) truncated = true;
  }
  const remoteIds = new Set(remoteActive.map((r) => r.provider_subscription_id));

  const orfas_na_cakto = remoteActive
    .filter((r) => !localById.has(r.provider_subscription_id))
    .map((r) => ({
      provider_subscription_id: r.provider_subscription_id,
      customer_email: r.customer_email, plan_code: r.plan_code,
      status: r.status, amount: r.amount, current_period_end: r.current_period_end,
      normalized: r,
    }));
  const locais_sem_par_na_cakto = [...localById.entries()]
    .filter(([pid, l]) => l.status === 'active' && !remoteIds.has(pid))
    .map(([pid, l]) => ({ id: l.id, provider_subscription_id: pid, user_email: l.email, status: l.status }));

  return { orfas_na_cakto, locais_sem_par_na_cakto, truncated };
};

export const webhooksRemoteHistory: Handler = async (params) => {
  const svc = serviceClient();
  const { data: rows } = await svc.from('webhook_events').select('provider_event_id');
  const localKeys = new Set(((rows ?? []) as { provider_event_id: string }[]).map((r) => r.provider_event_id));

  const wantType = str(params.type);
  const items: Record<string, unknown>[] = [];
  for (let page = 1; page <= 3; page++) {
    const { status, body } = await caktoJson(`/webhook/event_history/?limit=100&page=${page}`);
    if (status < 200 || status >= 300) throw new Error(`Cakto /webhook/event_history/ -> ${status}`);
    const b = body as { results?: Record<string, unknown>[]; next?: string | null };
    for (const r of b.results ?? []) {
      const eventId = String(r.event_id ?? '');
      if (wantType && eventId !== wantType) continue;
      const dataId = ((r.payload as { data?: { id?: string } } | undefined)?.data?.id) ?? '';
      const key = dataId ? `${eventId}:${dataId}` : '';
      items.push({
        id: r.id, event_id: eventId, event_name: r.event_name ?? null,
        event_status: r.event_status ?? null,
        dispatched_at: r.dispatchedAt ?? r.scheduledAt ?? null,
        processed_locally: key ? localKeys.has(key) : false,
        payload: r.payload ?? null,
      });
    }
    if (!(body as { next?: string | null }).next) break;
  }
  return { items };
};

// ---------------------------------------------------------------------------
// acoes (Fase B)
// ---------------------------------------------------------------------------

export type NormalizedApply = {
  status: 'active' | 'past_due' | 'canceled' | 'expired';
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan_code: string | null;
  amount: number;
};

export function assertNormalized(x: unknown): NormalizedApply {
  if (!x || typeof x !== 'object') throw new RbacError('validation', 'remote invalido.');
  const o = x as Record<string, unknown>;
  const status = String(o.status ?? '');
  if (!['active', 'past_due', 'canceled', 'expired'].includes(status)) {
    throw new RbacError('validation', `status invalido no remote: ${status}`);
  }
  return {
    status: status as NormalizedApply['status'],
    current_period_end: typeof o.current_period_end === 'string' ? o.current_period_end : null,
    cancel_at_period_end: Boolean(o.cancel_at_period_end),
    plan_code: typeof o.plan_code === 'string' && o.plan_code ? o.plan_code : null,
    amount: Number.isFinite(Number(o.amount)) ? Number(o.amount) : 0,
  };
}

export const applyRemote: Handler = async (params, identity, ctx) => {
  const id = reqId(params);
  const remote = assertNormalized(params.remote);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_apply', {
    p_actor: identity.adminId, p_id: id, p_remote: remote, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

export const importRemote: Handler = async (params, identity, ctx) => {
  const r = params.remote;
  if (!r || typeof r !== 'object') throw new RbacError('validation', 'remote invalido.');
  const o = r as Record<string, unknown>;
  const remote = {
    provider_subscription_id: String(o.provider_subscription_id ?? ''),
    customer_email: String(o.customer_email ?? ''),
    plan_code: typeof o.plan_code === 'string' ? o.plan_code : null,
    billing_cycle: typeof o.billing_cycle === 'string' ? o.billing_cycle : null,
    status: typeof o.status === 'string' ? o.status : 'active',
    amount: Number.isFinite(Number(o.amount)) ? Number(o.amount) : 0,
    current_period_start: typeof o.current_period_start === 'string' ? o.current_period_start : null,
    current_period_end: typeof o.current_period_end === 'string' ? o.current_period_end : null,
  };
  if (!remote.provider_subscription_id) throw new RbacError('validation', 'provider_subscription_id e obrigatorio.');
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_cakto_import', {
    p_actor: identity.adminId, p_remote: remote, p_ctx: ctx,
  });
  if (error) throw error;
  return data;
};

async function postToCaktoWebhook(event: string, data: unknown): Promise<{ status: number; body: string }> {
  const url = `${Deno.env.get('SUPABASE_URL') ?? ''}/functions/v1/cakto-webhook`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`,
    },
    body: JSON.stringify({ secret: Deno.env.get('CAKTO_WEBHOOK_SECRET') ?? '', event, data }),
  });
  return { status: res.status, body: await res.text() };
}

export const reprocessWebhook: Handler = async (params, identity, ctx) => {
  const source = params.source === 'cakto' ? 'cakto' : 'local';
  const svc = serviceClient();
  let event = '';
  let data: unknown = null;
  let providerEventId = '';

  if (source === 'local') {
    const rowId = reqId(params);
    const { data: row, error } = await svc
      .from('webhook_events')
      .select('provider_event_id, event_type, payload')
      .eq('id', rowId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new RbacError('not_found', 'Evento nao encontrado.');
    providerEventId = String((row as { provider_event_id: string }).provider_event_id);
    const payload = (row as { payload: { event?: string; data?: unknown } }).payload;
    event = payload.event ?? String((row as { event_type: string }).event_type);
    data = payload.data ?? {};
    await svc.from('webhook_events').delete().eq('provider_event_id', providerEventId);
  } else {
    providerEventId = reqId(params, 'providerEventId');
    type HistItem = { id?: unknown; event_id?: string; payload?: { data?: unknown; event?: string } };
    let found: HistItem | undefined;
    for (let page = 1; page <= 3 && !found; page++) {
      const { status, body } = await caktoJson(`/webhook/event_history/?limit=100&page=${page}`);
      if (status < 200 || status >= 300) throw new Error(`Cakto event_history -> ${status}`);
      const b = body as { results?: HistItem[]; next?: string | null };
      found = (b.results ?? []).find((it) => String(it.id) === providerEventId);
      if (!b.next) break;
    }
    if (!found) throw new RbacError('not_found', 'Evento nao encontrado no historico da Cakto.');
    event = found.payload?.event ?? String(found.event_id ?? '');
    data = found.payload?.data ?? found.payload ?? {};
  }

  const result = await postToCaktoWebhook(event, data);
  await svc.rpc('admin_webhook_reprocess_audit', {
    p_actor: identity.adminId, p_provider_event_id: providerEventId, p_source: source,
    p_result: { status: result.status, body: result.body.slice(0, 500) }, p_ctx: ctx,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`cakto-webhook respondeu ${result.status}: ${result.body.slice(0, 200)}`);
  }
  return { status: result.status, body: result.body };
};
