import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], impl: (..._a: unknown[]) => Promise.resolve({
  items: [{ id: 's1', provider_subscription_id: 'sub_1', user_id: 'u1', user_email: 'c@x.com', plan_code: 'pro', billing_cycle: 'monthly', status: 'active', amount: 47.9, current_period_end: '2026-10-01', cancel_at_period_end: false, grace_period_ends_at: null, canceled_at: null, created_at: '2026-09-01' }],
  page: 1, pageSize: 25, total: 1,
}) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(...a); },
  AdminApiError: class extends Error {},
}));
import SubscriptionsTab from './SubscriptionsTab';

it('lista assinaturas e o filtro de status chama a API com status', async () => {
  render(<MemoryRouter><SubscriptionsTab /></MemoryRouter>);
  await waitFor(() => expect(screen.getByText('c@x.com')).toBeInTheDocument());
  await userEvent.selectOptions(screen.getByLabelText(/status/i), 'canceled');
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('cakto');
    expect(last[1]).toBe('subscriptions');
    expect((last[2] as { status?: string }).status).toBe('canceled');
  });
});
