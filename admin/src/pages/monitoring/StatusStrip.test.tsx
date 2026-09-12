import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

let mockPerms: string[] = ['jobs.read', 'errors.read', 'system_health.read'];
vi.mock('../../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ identity: { permissions: mockPerms } }),
}));

let mockImpl: (resource: string, action: string, params?: unknown) => Promise<unknown> =
  () => Promise.resolve(null);
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: [string, string, unknown?]) => mockImpl(...a),
  AdminApiError: class extends Error {},
}));

import StatusStrip from './StatusStrip';

type Call = { resource: string; action: string };

function router(byAction: Record<string, () => Promise<unknown>>) {
  return (_resource: string, action: string) => {
    const fn = byAction[action];
    if (!fn) return Promise.reject(new Error(`sem mock pra action ${action}`));
    return fn();
  };
}

describe('StatusStrip', () => {
  beforeEach(() => {
    mockPerms = ['jobs.read', 'errors.read', 'system_health.read'];
  });

  it('mostra Jobs em danger quando ha falhas nas ultimas 24h', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 2 }, { jobid: 2, fails_24h: 0 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { sends: 0, success: 0, partial: 0, error: 0, error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Jobs · 2 falha\(s\) \(24h\)/)).toBeInTheDocument());
  });

  it('mostra Jobs em success quando nao ha falhas', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 0 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Jobs · OK')).toBeInTheDocument());
  });

  it('mostra Erros nas 3 faixas de acordo com error_rate', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 7.5 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Erros · 7.5%')).toBeInTheDocument());
  });

  it('mostra Banco com o mean_ms da query mais lenta', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [{ query: 'select 1', calls: 10, mean_ms: 1234, total_ms: 12340 }] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Banco · 1234ms')).toBeInTheDocument());
  });

  it('mostra Banco OK quando slow_by_mean vem vazio', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Banco · OK')).toBeInTheDocument());
  });

  it('mostra Auth com contagem de falhas de login', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [
        { event_message: 'invalid login attempt', timestamp: 'x' },
        { event_message: 'user signed in', timestamp: 'y' },
      ] }),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Auth · 1 falha\(s\) login \(24h\)/)).toBeInTheDocument());
  });

  it('mostra Auth indisponivel quando o fetch de logs falha, sem quebrar os outros pills', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 0 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.reject(new Error('Management API nao configurada')),
    });
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Auth · indisponível')).toBeInTheDocument());
    expect(screen.getByText('Jobs · OK')).toBeInTheDocument();
  });

  it('clicar num pill chama onJumpTo com a key da aba', async () => {
    mockImpl = router({
      'cron-jobs': () => Promise.resolve({ items: [{ jobid: 1, fails_24h: 1 }] }),
      'dispatch-errors': () => Promise.resolve({ totals: { error_rate: 0 } }),
      'db-health': () => Promise.resolve({ slow_by_mean: [] }),
      'logs': () => Promise.resolve({ items: [] }),
    });
    const onJumpTo = vi.fn();
    render(<StatusStrip onJumpTo={onJumpTo} />);
    await waitFor(() => expect(screen.getByText(/Jobs ·/)).toBeInTheDocument());
    fireEvent.click(screen.getByText(/Jobs ·/));
    expect(onJumpTo).toHaveBeenCalledWith('jobs');
  });

  it('sem permissao de errors.read, nao renderiza nem busca o pill de Erros', async () => {
    mockPerms = ['jobs.read'];
    const calls: string[] = [];
    mockImpl = (_resource, action) => {
      calls.push(action);
      if (action === 'cron-jobs') return Promise.resolve({ items: [] });
      return Promise.reject(new Error(`nao deveria chamar ${action}`));
    };
    render(<StatusStrip onJumpTo={() => {}} />);
    await waitFor(() => expect(screen.getByText('Jobs · OK')).toBeInTheDocument());
    expect(screen.queryByText(/Erros ·/)).not.toBeInTheDocument();
    expect(calls).not.toContain('dispatch-errors');
  });
});
