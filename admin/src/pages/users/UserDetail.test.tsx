import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return {
    FakeErr,
    get: (..._a: unknown[]): Promise<unknown> => Promise.resolve(null),
    mutate: (..._a: unknown[]): Promise<unknown> => Promise.resolve({}),
    perms: { value: ['users.read', 'users.billing.manage'] as string[] },
  };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (resource: string, action: string, params?: unknown) =>
    action === 'get' ? h.get(resource, action, params) : h.mutate(resource, action, params),
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import UserDetail from './UserDetail';

const DETAIL = {
  profile: { id: 'u1', email: 'cliente@x.com', full_name: 'Cliente X', plan: 'starter', account_status: 'active', trial_started_at: null, trial_ends_at: null, created_at: '2026-08-01' },
  counts: { offers: 3, channels: 1, sends_30d: 10, clicks_30d: 0 },
  subscription: null,
  tags: ['vip'],
  notes: [{ id: 'n1', admin_email: 'admin@x.com', body: 'nota teste', created_at: '2026-08-02' }],
};

function renderAt(id = 'u1') {
  return render(
    <MemoryRouter initialEntries={[`/users/${id}`]}>
      <Routes><Route path="/users/:id" element={<UserDetail />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => { h.perms.value = ['users.read', 'users.billing.manage']; });

it('mostra o perfil e as notas', async () => {
  h.get = () => Promise.resolve(DETAIL);
  renderAt();
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  expect(screen.getByText('nota teste')).toBeInTheDocument();
});

it('cortesia de plano so aparece com users.billing.manage', async () => {
  h.get = () => Promise.resolve(DETAIL);
  h.perms.value = ['users.read'];
  renderAt();
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /cortesia de plano/i })).not.toBeInTheDocument();
});

it('erro HAS_SUBSCRIPTION na cortesia vira toast (nao quebra a tela)', async () => {
  h.get = () => Promise.resolve(DETAIL);
  h.mutate = () => Promise.reject(new h.FakeErr('conflict', 'Essa conta tem assinatura paga'));
  renderAt();
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/plano de cortesia/i), 'pro');
  await userEvent.click(screen.getByRole('button', { name: /cortesia de plano/i }));
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
});
