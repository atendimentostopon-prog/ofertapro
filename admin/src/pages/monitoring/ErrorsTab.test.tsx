import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][],
  impl: (): Promise<unknown> => Promise.resolve({
    totals: { sends: 155, success: 86, partial: 69, error: 0, error_rate: 44.5 },
    by_day: [{ day: '2026-09-03', sends: 155, bad: 69 }],
    top_channels: [{ channel: 'Best Promos #1', fails: 53 }],
    recent: [{ id: 'h1', sent_at: '2026-09-03T21:00:00Z', offer_name: 'Fone TWS', user_email: 'c@x.com', status: 'partial', failed_channels: ['Best Promos #1'], error: null }],
  }) }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(); },
  AdminApiError: class extends Error {},
}));

import ErrorsTab from './ErrorsTab';

it('mostra totais, top canais e recentes; troca de periodo re-chama a API', async () => {
  render(<MemoryRouter><ErrorsTab /></MemoryRouter>);
  await screen.findByText('Fone TWS');
  expect(screen.getByText('Best Promos #1')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /7 dias/i }));
  await waitFor(() => expect(h.calls.length).toBeGreaterThan(1));
});
