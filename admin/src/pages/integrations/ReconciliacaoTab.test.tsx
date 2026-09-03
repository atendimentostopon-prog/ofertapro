import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (_resource: string, action: string): Promise<unknown> => {
    if (action === 'reconcile-local') return Promise.resolve({
      plano_sem_subscription: [{ user_id: 'u9', user_email: 'cortesia@x.com', plan: 'pro', account_status: 'active' }],
      subscription_ativa_sem_acesso: [{ id: 's2', provider_subscription_id: 'sub_2', user_id: 'u2', user_email: 'drift@x.com', status: 'active', account_status: 'canceled', plan: 'free' }],
      past_due_em_grace: [],
    });
    if (action === 'reconcile-remote') return Promise.resolve({
      orfas_na_cakto: [{ provider_subscription_id: 'sub_9', customer_email: 'orfa@x.com', plan_code: 'pro', status: 'active', amount: 47.9, current_period_end: '2026-10-01', normalized: {} }],
      locais_sem_par_na_cakto: [],
      truncated: false,
    });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => h.impl(r, a, p),
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['cakto.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import ReconciliacaoTab from './ReconciliacaoTab';

it('mostra as divergencias locais e remotas', async () => {
  render(<MemoryRouter><ReconciliacaoTab /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('drift@x.com')).toBeInTheDocument());
  expect(screen.getByText('orfa@x.com')).toBeInTheDocument();
  expect(screen.getByText('cortesia@x.com')).toBeInTheDocument();
});
