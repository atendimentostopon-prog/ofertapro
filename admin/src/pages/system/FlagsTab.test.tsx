import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], perms: { value: ['feature_flags.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'flags') return Promise.resolve({ items: [
      { key: 'signups_enabled', value: true, description: 'Permite cadastros', updated_at: '2026-09-01T00:00:00Z' },
      { key: 'welcome_text', value: 'ola', description: null, updated_at: '2026-09-01T00:00:00Z' },
    ] });
    return Promise.resolve({ key: 'signups_enabled', value: false });
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import FlagsTab from './FlagsTab';

beforeEach(() => { h.perms.value = ['feature_flags.read']; h.calls.length = 0; });

it('lista as flags; sem manage nao mostra controles de edicao', async () => {
  render(<MemoryRouter><FlagsTab /></MemoryRouter>);
  await screen.findByText('signups_enabled');
  expect(screen.getByText('welcome_text')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /adicionar/i })).not.toBeInTheDocument();
});

it('com manage, alternar um toggle bool chama flag-set', async () => {
  h.perms.value = ['feature_flags.read', 'feature_flags.manage'];
  render(<MemoryRouter><FlagsTab /></MemoryRouter>);
  await screen.findByText('signups_enabled');
  await userEvent.click(screen.getByLabelText(/signups_enabled/i));
  await waitFor(() => {
    const call = h.calls.find((c) => c[1] === 'flag-set');
    expect(call).toBeDefined();
    expect((call?.[2] as { key?: string; value?: unknown }).key).toBe('signups_enabled');
    expect((call?.[2] as { value?: unknown }).value).toBe('false');
  });
});
