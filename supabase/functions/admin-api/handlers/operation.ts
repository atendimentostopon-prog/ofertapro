import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

export function reqOfferId(params: Record<string, unknown>): string {
  const v = params.offerId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'offerId e obrigatorio.');
  return v.trim();
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown, d: number): number => (Number.isFinite(Number(v)) ? Number(v) : d);

export const promotionsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_promotions_list', {
    p_search: str(params.search),
    p_client: str(params.client),
    p_status: str(params.status),
    p_page: num(params.page, 1),
    p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};

export const promotionGet: Handler = async (params) => {
  const offerId = reqOfferId(params);
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_promotion_detail', { p_offer_id: offerId });
  if (error) throw new Error(error.message);
  if (data === null) throw new RbacError('not_found', 'Promocao nao encontrada.');
  return data;
};

export const sendsList: Handler = async (params) => {
  const svc = serviceClient();
  const { data, error } = await svc.rpc('admin_sends_list', {
    p_client: str(params.client),
    p_status: str(params.status),
    p_from: str(params.from),
    p_to: str(params.to),
    p_page: num(params.page, 1),
    p_page_size: num(params.pageSize, 25),
  });
  if (error) throw new Error(error.message);
  return data;
};
