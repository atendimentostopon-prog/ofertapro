import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  calls: [] as unknown[][],
  perms: { value: ['risk.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'posture') return Promise.resolve({
      admins: { total: 1, mfa_enrolled: 1 },
      users: { total: 6, banned: 0, suspended: 0, unconfirmed: 0 },
      blocklist: { emails: 0, domains: 0 },
    });
    if (action === 'risk-accounts') return Promise.resolve({
      items: [{ user_id: 'u9', email: 'suspeito@x.com', created_at: '2026-08-30T00:00:00Z', account_status: 'active', plan: 'pro', banned: false, flags: ['muita_falha_disparo'] }],
    });
    if (action === 'ban') return Promise.resolve({ banned: true });
    if (action === 'unban') return Promise.resolve({ banned: false });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => { h.calls.push([r, a, p]); return h.impl(r, a); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import RiscoTab from './RiscoTab';

beforeEach(() => { h.calls.length = 0; h.perms.value = ['risk.read']; });

it('mostra postura e contas de risco', async () => {
  render(<MemoryRouter><RiscoTab /></MemoryRouter>);
  expect(await screen.findByText('suspeito@x.com')).toBeInTheDocument();
  expect(screen.getByText('muita_falha_disparo')).toBeInTheDocument();
  expect(screen.getByText('1 / 1')).toBeInTheDocument();
});

it('sem risk.manage nao aparece botao "banir"', async () => {
  render(<MemoryRouter><RiscoTab /></MemoryRouter>);
  await screen.findByText('suspeito@x.com');
  expect(screen.queryByRole('button', { name: /^banir$/i })).not.toBeInTheDocument();
});

it('com risk.manage, banir abre o modal e confirmar chama security/ban', async () => {
  h.perms.value = ['risk.read', 'risk.manage'];
  render(<MemoryRouter><RiscoTab /></MemoryRouter>);
  await screen.findByText('suspeito@x.com');
  await userEvent.click(screen.getByRole('button', { name: /^banir$/i }));
  await userEvent.type(screen.getByRole('textbox'), 'abuso confirmado');
  await userEvent.click(screen.getByRole('button', { name: /confirmar banimento/i }));
  await waitFor(() => {
    const ban = h.calls.find((c) => c[1] === 'ban');
    expect(ban).toBeTruthy();
    expect((ban![2] as { userId?: string; reason?: string }).userId).toBe('u9');
    expect((ban![2] as { reason?: string }).reason).toBe('abuso confirmado');
  });
});
