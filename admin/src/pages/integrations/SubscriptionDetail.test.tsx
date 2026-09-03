import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return {
    FakeErr,
    perms: { value: ['cakto.read'] as string[] },
    impl: (_resource: string, action: string): Promise<unknown> => {
      if (action === 'apply') return Promise.resolve({ applied: 'acesso concedido' });
      if (action === 'subscription') return Promise.resolve({
        id: 's1', provider_subscription_id: 'sub_1', user_id: 'u1', user_email: 'c@x.com',
        user_plan: 'free', user_account_status: 'canceled',
        plan_code: 'pro', billing_cycle: 'monthly', status: 'active', amount: 47.9,
        current_period_end: '2026-10-01T00:00:00-03:00', cancel_at_period_end: false,
        grace_period_ends_at: null, canceled_at: null, created_at: '2026-09-01',
      });
      if (action === 'remote-subscription') return Promise.resolve({
        raw: {}, normalized: {
          provider_subscription_id: 'sub_1', customer_email: 'c@x.com', plan_code: 'pro', billing_cycle: 'monthly',
          status: 'canceled', amount: 47.9, current_period_start: '2026-09-01', current_period_end: '2026-10-01T00:00:00-03:00',
          cancel_at_period_end: true, canceled_at: '2026-09-20',
        },
      });
      if (action === 'remote-billing-cycles') return Promise.resolve({ items: [] });
      return Promise.resolve({});
    },
  };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => h.impl(r, a, p),
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import SubscriptionDetail from './SubscriptionDetail';

function renderAt(id = 's1') {
  return render(
    <MemoryRouter initialEntries={[`/cakto/subscriptions/${id}`]}>
      <Routes><Route path="/cakto/subscriptions/:id" element={<SubscriptionDetail />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { h.perms.value = ['cakto.read']; });

it('mostra o diff local vs Cakto (status difere)', async () => {
  renderAt();
  await screen.findByText('c@x.com');
  // a tabela de diff aparece so depois do segundo fetch (remote-subscription)
  await screen.findByText('Local');
  await waitFor(() => expect(screen.getAllByText(/canceled/i).length).toBeGreaterThan(0));
});

it('sem cakto.sync o botao aplicar nao aparece', async () => {
  renderAt();
  await screen.findByText('Local');
  expect(screen.queryByRole('button', { name: /aplicar o que a cakto diz/i })).not.toBeInTheDocument();
});

it('com cakto.sync, aplicar chama cakto/apply e nao quebra a tela', async () => {
  h.perms.value = ['cakto.read', 'cakto.sync'];
  renderAt();
  await userEvent.click(await screen.findByRole('button', { name: /aplicar o que a cakto diz/i }));
  await waitFor(() => expect(screen.getByText('c@x.com')).toBeInTheDocument());
});
