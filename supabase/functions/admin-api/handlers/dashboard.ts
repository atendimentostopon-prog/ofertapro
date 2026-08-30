import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';

type RangeParams = { range?: string; from?: string; to?: string };

export function resolveRange(p: RangeParams): { from: Date; to: Date } {
  const to = new Date();
  if (p.range === 'custom' && p.from && p.to) {
    return { from: new Date(p.from), to: new Date(p.to) };
  }
  const days = p.range === 'today' ? 1 : p.range === '30d' ? 30 : p.range === '90d' ? 90 : 7;
  const from = new Date(to.getTime() - days * 864e5);
  return { from, to };
}

export const METRIC_LABELS: Record<string, string> = {
  users_total: 'Usuarios totais',
  users_active: 'Usuarios ativos',
  users_new: 'Novos usuarios no periodo',
  subs_active: 'Assinaturas ativas',
  subs_canceled: 'Assinaturas canceladas',
  offers_created: 'Promocoes criadas',
  links_processed: 'Links processados',
  clicks: 'Cliques',
  sends: 'Envios',
  sends_success_rate: 'Taxa de sucesso de envio (%)',
  webhooks_received: 'Webhooks recebidos',
  webhooks_failed: 'Webhooks falhos',
  jobs_failed: 'Jobs falhos',
  jobs_pending: 'Jobs pendentes',
  queue_depth: 'Fila (queue depth)',
  errors_24h: 'Erros nas ultimas 24h',
  services_degraded: 'Servicos degradados',
};

export const summary: Handler = async (params) => {
  const { from, to } = resolveRange(params as RangeParams);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_dashboard_summary', {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) throw new Error(error.message);
  return { range: { from: from.toISOString(), to: to.toISOString() }, labels: METRIC_LABELS, ...data };
};
