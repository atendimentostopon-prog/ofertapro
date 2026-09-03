import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 's1', offer_name: 'Fone TWS', offer_image: null, marketplace: 'shopee', status: 'success', error: null, sent_at: '2026-08-02T10:00:00Z', channel_count: 2, successful_channels: ['g1', 'g2'], failed_channels: [], owner_id: 'u1', owner_email: 'cliente@x.com' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));

import SendsList from './SendsList';

it('lista envios e o filtro de status chama a API com status', async () => {
  render(<MemoryRouter><SendsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Fone TWS')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/status/i), 'error');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('sends');
    expect(last[1]).toBe('list');
    expect((last[2] as { status?: string }).status).toBe('error');
  });
});
