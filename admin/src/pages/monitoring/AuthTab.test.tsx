import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'logs') return Promise.resolve({
      items: [{ timestamp: '2026-09-06T13:00:00Z', event_message: 'login failed for user x' }],
    });
    return Promise.resolve({
      totals: { users: 6, confirmed: 5, unconfirmed: 1, banned: 0 },
      signups_by_day: [{ day: '2026-09-01', n: 2 }],
      recent_signups: [{ id: 'u1', email: 'novo@x.com', created_at: '2026-09-01T10:00:00Z', confirmed: true, last_sign_in_at: '2026-09-05T10:00:00Z' }],
    });
  },
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: (r: string, a: string) => h.impl(r, a), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['system_health.read'] } }) }));

import AuthTab from './AuthTab';

it('mostra totais, ultimos cadastros e sinais de auth', async () => {
  render(<MemoryRouter><AuthTab /></MemoryRouter>);
  expect(await screen.findByText('novo@x.com')).toBeInTheDocument();
  expect(screen.getByText('6')).toBeInTheDocument();
  expect(await screen.findByText(/1 linha\(s\) de log de falha/)).toBeInTheDocument();
});
