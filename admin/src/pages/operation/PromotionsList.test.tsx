import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 'o1', name: 'Fone TWS', status: 'active', short_code: 'abc', affiliate_link: 'https://x', created_at: '2026-08-01', clicks_total: 12, owner_id: 'u1', owner_email: 'cliente@x.com' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));

import PromotionsList from './PromotionsList';

it('lista promocoes e o filtro de cliente chama a API com client', async () => {
  render(<MemoryRouter><PromotionsList /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('Fone TWS')).toBeInTheDocument());
  expect(screen.getByText('cliente@x.com')).toBeInTheDocument();
  await userEvent.type(screen.getByPlaceholderText(/cliente/i), 'cliente');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('promotions');
    expect(last[1]).toBe('list');
    expect((last[2] as { client?: string }).client).toContain('cliente');
  });
});
