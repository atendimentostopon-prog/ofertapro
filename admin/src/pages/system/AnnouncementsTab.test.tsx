import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], perms: { value: ['announcements.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'announcements') return Promise.resolve({ items: [
      { id: 'a1', message: 'Manutencao domingo', level: 'warning', active: true, starts_at: null, ends_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
    ] });
    return Promise.resolve({ id: 'a2', message: 'novo', level: 'info', active: false });
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import AnnouncementsTab from './AnnouncementsTab';

beforeEach(() => { h.perms.value = ['announcements.read']; h.calls.length = 0; });

it('lista os avisos; sem manage nao mostra o form', async () => {
  render(<MemoryRouter><AnnouncementsTab /></MemoryRouter>);
  await screen.findByText('Manutencao domingo');
  expect(screen.queryByRole('button', { name: /publicar|criar/i })).not.toBeInTheDocument();
});

it('com manage, criar um aviso chama announcement-upsert', async () => {
  h.perms.value = ['announcements.read', 'announcements.manage'];
  render(<MemoryRouter><AnnouncementsTab /></MemoryRouter>);
  await screen.findByText('Manutencao domingo');
  await userEvent.type(screen.getByLabelText(/mensagem/i), 'Aviso novo');
  await userEvent.click(screen.getByRole('button', { name: /criar/i }));
  await waitFor(() => {
    const call = h.calls.find((c) => c[1] === 'announcement-upsert');
    expect(call).toBeDefined();
    expect((call?.[2] as { message?: string }).message).toBe('Aviso novo');
  });
});
