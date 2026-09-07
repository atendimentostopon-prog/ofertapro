import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return {
    FakeErr,
    calls: [] as unknown[][],
    perms: { value: ['security.read', 'risk.manage'] as string[] },
    list: [{ id: 'b1', kind: 'domain', value: 'spammer.test', reason: 'abuso', created_at: '2026-09-06T00:00:00Z' }],
  };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => {
    h.calls.push([r, a, p]);
    if (a === 'blocklist') return Promise.resolve({ items: h.list });
    return Promise.resolve({ id: 'b2', kind: 'email', value: 'x@y.com' });
  },
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import BloqueiosTab from './BloqueiosTab';

beforeEach(() => { h.calls.length = 0; h.perms.value = ['security.read', 'risk.manage']; });

it('lista, e adicionar dominio mostra o aviso e chama blocklist-add', async () => {
  render(<MemoryRouter><BloqueiosTab /></MemoryRouter>);
  await screen.findByText('spammer.test');
  await userEvent.selectOptions(screen.getByLabelText(/tipo/i), 'domain');
  expect(screen.getByText(/bloqueia TODO cadastro/i)).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/ou e-mail/i), 'ruim.test');
  await userEvent.click(screen.getByRole('button', { name: /adicionar/i }));
  await waitFor(() => {
    const add = h.calls.find((c) => c[1] === 'blocklist-add');
    expect(add).toBeTruthy();
    expect((add![2] as { value?: string }).value).toBe('ruim.test');
  });
});
