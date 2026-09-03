import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  perms: { value: ['webhooks.read'] as string[] },
  impl: (_resource: string, action: string): Promise<unknown> => {
    if (action === 'reprocess') return Promise.resolve({ status: 200 });
    if (action === 'events') return Promise.resolve({
      items: [{ id: 'e1', provider_event_id: 'purchase_approved:o1', event_type: 'purchase_approved', provider_subscription_id: 'sub_1', processed_at: '2026-09-01T10:00:00Z' }],
      page: 1, pageSize: 25, total: 1,
    });
    if (action === 'event') return Promise.resolve({
      id: 'e1', provider_event_id: 'purchase_approved:o1', event_type: 'purchase_approved',
      provider_subscription_id: 'sub_1', processed_at: '2026-09-01T10:00:00Z',
      payload: { event: 'purchase_approved', data: { id: 'o1' } },
    });
    if (action === 'remote-history') return Promise.resolve({ items: [] });
    return Promise.resolve({});
  },
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (r: string, a: string, p?: unknown) => h.impl(r, a, p),
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import WebhooksTab from './WebhooksTab';

beforeEach(() => { h.perms.value = ['webhooks.read']; });

it('lista eventos e abrir um mostra o payload sem secret', async () => {
  render(<MemoryRouter><WebhooksTab /></MemoryRouter>);
  await screen.findByText('purchase_approved:o1');
  await userEvent.click(screen.getByText('purchase_approved:o1'));
  await screen.findByText(/"data"/);
  expect(screen.queryByText(/secret/i)).not.toBeInTheDocument();
});

it('com webhooks.retry, reprocessar nao quebra a tela', async () => {
  h.perms.value = ['webhooks.read', 'webhooks.retry'];
  render(<MemoryRouter><WebhooksTab /></MemoryRouter>);
  await userEvent.click(await screen.findByText('purchase_approved:o1'));
  await userEvent.click(await screen.findByRole('button', { name: /^reprocessar$/i }));
  await waitFor(() => expect(screen.getByText('purchase_approved:o1')).toBeInTheDocument());
});
