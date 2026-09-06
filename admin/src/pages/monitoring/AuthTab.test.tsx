import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (): Promise<unknown> => Promise.resolve({
    totals: { users: 6, confirmed: 5, unconfirmed: 1, banned: 0 },
    signups_by_day: [{ day: '2026-09-01', n: 2 }],
    recent_signups: [{ id: 'u1', email: 'novo@x.com', created_at: '2026-09-01T10:00:00Z', confirmed: true, last_sign_in_at: '2026-09-05T10:00:00Z' }],
  }),
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: () => h.impl(), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['system_health.read'] } }) }));

import AuthTab from './AuthTab';

it('mostra totais e ultimos cadastros', async () => {
  render(<MemoryRouter><AuthTab /></MemoryRouter>);
  expect(await screen.findByText('novo@x.com')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
});
