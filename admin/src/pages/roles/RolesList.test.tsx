import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const callAdminApi = vi.fn();
vi.mock('../../lib/admin-api', () => ({ callAdminApi: (...a: unknown[]) => callAdminApi(...a), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['roles.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import RolesList from './RolesList';

beforeEach(() => callAdminApi.mockReset());

it('lista os cargos e suas permissoes', async () => {
  callAdminApi.mockResolvedValue({
    roles: [{ key: 'ANALYST', label: 'Analista', description: '', permissions: ['dashboard.read', 'analytics.read'] }],
    permissions: [{ key: 'dashboard.read', grp: 'overview', description: '' }],
  });
  render(<RolesList />);
  await waitFor(() => expect(screen.getByText('Analista')).toBeInTheDocument());
  // a permissao aparece com rotulo amigavel; a chave tecnica vai no title
  expect(screen.getByText('Ver o dashboard')).toBeInTheDocument();
  expect(screen.getByTitle('dashboard.read')).toBeInTheDocument();
});

it('sem roles.manage nao mostra o formulario de atribuir', async () => {
  callAdminApi.mockResolvedValue({ roles: [], permissions: [] });
  render(<RolesList />);
  await waitFor(() => expect(screen.queryByRole('button', { name: /atribuir cargo/i })).not.toBeInTheDocument());
});
