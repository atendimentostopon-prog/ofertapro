import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 'u1', email: 'cliente@x.com', full_name: 'Cliente X', plan: 'starter', account_status: 'active', trial_ends_at: null, created_at: '2026-08-01' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));

import UsersList from './UsersList';

it('lista clientes e busca chama a API com search', async () => {
  render(<MemoryRouter><UsersList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('cliente@x.com')).toBeInTheDocument());
  await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'cliente');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('users');
    expect(last[1]).toBe('list');
    expect((last[2] as { search?: string }).search).toContain('cliente');
  });
});
