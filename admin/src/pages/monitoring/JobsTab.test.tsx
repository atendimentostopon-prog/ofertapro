import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][],
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'cron-jobs') return Promise.resolve({ items: [
      { jobid: 3, jobname: 'expire_trials', schedule: '0 * * * *', active: true,
        last_status: 'succeeded', last_return_message: 'UPDATE 0', last_start: '2026-09-06T13:00:00Z',
        last_end: '2026-09-06T13:00:00Z', last_duration_ms: 118, runs_24h: 24, fails_24h: 0 },
    ] });
    if (action === 'cron-runs') return Promise.resolve({
      items: [{ runid: 1, status: 'succeeded', return_message: 'UPDATE 0', start_time: '2026-09-06T13:00:00Z', end_time: '2026-09-06T13:00:00Z', duration_ms: 118 }],
      page: 1, pageSize: 25, total: 1 });
    return Promise.resolve({});
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: ['jobs.read'] } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import JobsTab from './JobsTab';

it('lista os cron jobs e expande o historico', async () => {
  render(<MemoryRouter><JobsTab /></MemoryRouter>);
  await screen.findByText('expire_trials');
  expect(screen.getByText('succeeded')).toBeInTheDocument();
  await userEvent.click(screen.getByText('expire_trials'));
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[0]).toBe('monitoring');
    expect(last[1]).toBe('cron-runs');
    expect((last[2] as { job?: string }).job).toBe('expire_trials');
  });
});
