import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'posture') return Promise.resolve({
      admins: { total: 1, mfa_enrolled: 1 },
      users: { total: 6, banned: 0, suspended: 0, unconfirmed: 0 },
      blocklist: { emails: 0, domains: 0 },
    });
    if (action === 'risk-accounts') return Promise.resolve({
      items: [{ user_id: 'u9', email: 'suspeito@x.com', created_at: '2026-08-30T00:00:00Z', account_status: 'active', plan: 'pro', banned: false, flags: ['muita_falha_disparo'] }],
    });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({ callAdminApi: (r: string, a: string) => h.impl(r, a), AdminApiError: class extends Error {} }));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['risk.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import RiscoTab from './RiscoTab';

it('mostra postura e contas de risco', async () => {
  render(<MemoryRouter><RiscoTab /></MemoryRouter>);
  expect(await screen.findByText('suspeito@x.com')).toBeInTheDocument();
  expect(screen.getByText('muita_falha_disparo')).toBeInTheDocument();
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
});
