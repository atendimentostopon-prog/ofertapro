import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

// Holder de funcao em vez de vi.fn() compartilhado: no vitest 2.1.9, um spy
// async reutilizado entre um teste que resolve e outro que rejeita (com
// mockReset no beforeEach) dispara um unhandled rejection falso, mesmo com o
// erro tratado no hook. Os testes aqui nao assertam args, entao nao precisam
// do spy.
let mockImpl: (resource: string, action: string, params?: unknown) => Promise<unknown> =
  () => Promise.resolve(null);
vi.mock('../lib/admin-api', () => ({
  callAdminApi: (...a: [string, string, unknown?]) => mockImpl(...a),
  AdminApiError: class extends Error {},
}));

import Dashboard from './Dashboard';

const payload = {
  range: { from: 'x', to: 'y' },
  labels: {},
  metrics: {
    users_total: { value: 1200, available: true },
    jobs_failed: { value: null, available: false },
  },
  feed: [{ id: '1', type: 'user_registered', title: 'Ana', at: new Date().toISOString(), href: null }],
};

describe('Dashboard', () => {
  it('mostra metrica real e indisponivel', async () => {
    mockImpl = () => Promise.resolve(payload);
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText('1.200')).toBeInTheDocument());
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });
  it('mostra erro com retry', async () => {
    mockImpl = () => Promise.reject(new Error('falhou'));
    render(<Dashboard />);
    await waitFor(() => expect(screen.getByText(/falhou|nao foi possivel/i)).toBeInTheDocument());
  });
});
