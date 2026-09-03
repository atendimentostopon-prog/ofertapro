import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

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
