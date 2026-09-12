import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockImpl: (resource: string, action: string, params?: unknown) => Promise<unknown> =
  () => Promise.resolve(null);
vi.mock('../lib/admin-api', () => ({
  callAdminApi: (...a: [string, string, unknown?]) => mockImpl(...a),
  AdminApiError: class extends Error {},
}));

import Dashboard from './Dashboard';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

const basePayload = {
  range: { from: 'x', to: 'y' },
  labels: {},
  metrics: {
    users_total: { value: 1200, available: true },
    users_active: { value: 300, available: true },
    users_new: { value: 120, available: true, previous: 100, series: [{ date: '2026-09-01', value: 60 }, { date: '2026-09-02', value: 60 }] },
    subs_active: { value: 50, available: true },
    subs_canceled: { value: 5, available: true },
    offers_created: { value: 10, available: true, previous: 8, series: [] },
    links_processed: { value: 200, available: true },
    clicks: { value: 400, available: true, previous: 500, series: [] },
    sends: { value: 30, available: true, previous: 20, series: [] },
    sends_success_rate: { value: 95, available: true, previous: 90 },
    webhooks_received: { value: 15, available: true, previous: 15, series: [] },
    webhooks_failed: { value: null, available: false },
    jobs_failed: { value: null, available: false },
    jobs_pending: { value: null, available: false },
    queue_depth: { value: null, available: false },
    errors_24h: { value: null, available: false },
    services_degraded: { value: null, available: false },
  },
  feed: [
    { id: 'u1', type: 'user_registered', title: 'Ana', at: new Date().toISOString(), href: null },
    { id: 'o1', type: 'promotion_created', title: 'Oferta X', at: new Date().toISOString(), href: null },
    { id: 's1', type: 'send', title: 'Envio Y', at: new Date().toISOString(), href: null },
  ],
};

describe('Dashboard', () => {
  it('mostra metrica real e indisponivel', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });

  it('mostra erro com retry', async () => {
    mockImpl = () => Promise.reject(new Error('falhou'));
    renderDashboard();
    await waitFor(() => expect(screen.getByText(/falhou|nao foi possivel/i)).toBeInTheDocument());
  });

  it('nao renderiza a secao Infraestrutura e mostra o card-link pro Monitoramento', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    expect(screen.queryByText('Infraestrutura')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /monitoramento/i })).toHaveAttribute('href', '/monitoring');
  });

  it('mostra usuarios ativos como card hero', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('300')).toBeInTheDocument());
    expect(screen.getByText('300')).toHaveClass('text-4xl');
  });

  it('linka itens de usuario e promocao no feed, deixa envio sem link', async () => {
    mockImpl = () => Promise.resolve(basePayload);
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Ana')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /Ana/i })).toHaveAttribute('href', '/users/u1');
    expect(screen.getByRole('link', { name: /Oferta X/i })).toHaveAttribute('href', '/promotions/o1');
    expect(screen.queryByRole('link', { name: /Envio Y/i })).not.toBeInTheDocument();
    expect(screen.getByText('Envio Y')).toBeInTheDocument();
  });
});
