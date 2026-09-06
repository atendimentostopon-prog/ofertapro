import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({
  impl: (): Promise<unknown> => Promise.resolve({
    slow_by_mean: [{ query: 'SELECT name FROM pg_timezone_names', calls: 395, mean_ms: 900.3, total_ms: 355605 }],
    slow_by_total: [{ query: 'SELECT name FROM pg_timezone_names', calls: 395, mean_ms: 900.3, total_ms: 355605 }],
    tables: [{ name: 'offers', total_pretty: '1480 kB', live_tup: 1, dead_tup: 27, last_autovacuum: null }],
    connections: [{ state: 'idle', count: 13 }, { state: 'active', count: 2 }],
    db_size: '31 MB', stats_since: '2026-09-01T00:00:00Z',
  }),
}));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: () => h.impl(),
  AdminApiError: class extends Error {},
}));

import DbHealthTab from './DbHealthTab';

it('mostra queries lentas, tabelas e conexoes', async () => {
  render(<MemoryRouter><DbHealthTab /></MemoryRouter>);
  expect(await screen.findAllByText(/pg_timezone_names/)).not.toHaveLength(0);
  expect(screen.getByText('offers')).toBeInTheDocument();
  expect(screen.getByText('31 MB')).toBeInTheDocument();
});
