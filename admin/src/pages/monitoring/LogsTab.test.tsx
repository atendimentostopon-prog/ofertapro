import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return { FakeErr, impl: (): Promise<unknown> => Promise.resolve({
    source: 'function_edge_logs', hours: 6,
    items: [{ id: '1', timestamp: '2026-09-06T13:00:00Z', event_message: 'booted admin-api' }],
  }) };
});
vi.mock('../../lib/admin-api', () => ({ callAdminApi: () => h.impl(), AdminApiError: h.FakeErr }));

import LogsTab from './LogsTab';

beforeEach(() => {
  h.impl = () => Promise.resolve({
    source: 'function_edge_logs', hours: 6,
    items: [{ id: '1', timestamp: '2026-09-06T13:00:00Z', event_message: 'booted admin-api' }],
  });
});

it('mostra as linhas de log', async () => {
  render(<MemoryRouter><LogsTab /></MemoryRouter>);
  expect(await screen.findByText('booted admin-api')).toBeInTheDocument();
});

it('sem token da Management API mostra aviso', async () => {
  h.impl = () => Promise.reject(new h.FakeErr('internal', 'Management API nao configurada (SUPABASE_MGMT_TOKEN).'));
  render(<MemoryRouter><LogsTab /></MemoryRouter>);
  expect(await screen.findByText(/SUPABASE_MGMT_TOKEN/)).toBeInTheDocument();
});
