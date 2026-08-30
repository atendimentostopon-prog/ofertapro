import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  callAdminApi: vi.fn(),
  permissions: { value: ['admins.read', 'admins.manage'] as string[] },
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: h.callAdminApi, AdminApiError: class extends Error { code = 'x'; } }));
vi.mock('../../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ identity: { permissions: h.permissions.value } }),
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

const callAdminApi = h.callAdminApi;
const currentPermissions = h.permissions;

import AdminsList from './AdminsList';

const ONE_ADMIN = { admins: [
  { id: 'a1', email: 'super@aflyo.com', status: 'active', roleKeys: ['SUPER_ADMIN'], mfaEnrolled: true, lastSignInAt: null, createdAt: '2026-08-29' },
] };

beforeEach(() => {
  callAdminApi.mockReset();
  currentPermissions.value = ['admins.read', 'admins.manage'];
});

it('lista admins e mostra acao de suspender para quem tem admins.manage', async () => {
  callAdminApi.mockResolvedValue(ONE_ADMIN);
  render(<MemoryRouter><AdminsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('super@aflyo.com')).toBeInTheDocument());
  expect(screen.getByRole('button', { name: /suspender/i })).toBeInTheDocument();
});

it('esconde acoes sem admins.manage', async () => {
  currentPermissions.value = ['admins.read'];
  callAdminApi.mockResolvedValue(ONE_ADMIN);
  render(<MemoryRouter><AdminsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('super@aflyo.com')).toBeInTheDocument());
  expect(screen.queryByRole('button', { name: /suspender/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /convidar admin/i })).not.toBeInTheDocument();
});
