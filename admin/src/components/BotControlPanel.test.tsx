import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/env', () => ({
  ENV: { botAdminUrl: 'https://bot.test', botAdminToken: 'tok' },
}));

import { BotControlPanel } from './BotControlPanel';

const STATUS = { State: 'running', Status: 'Up 2 hours', RunningFor: '2 hours ago' };

type Route = (init?: RequestInit) => Response | Promise<Response>;
function mockFetch(routes: Record<string, Route>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const path = url.replace('https://bot.test', '');
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new Error(`rota inesperada ${path}`);
    return routes[key](init);
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const okStatus = () => json({ ok: true, raw: JSON.stringify(STATUS) });

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BotControlPanel', () => {
  it('mostra status e logs quando o servidor responde', async () => {
    mockFetch({ '/status': okStatus, '/logs': () => new Response('linha de log 1') });
    render(<BotControlPanel />);
    expect(await screen.findByText(/running/)).toBeInTheDocument();
    expect(await screen.findByText(/linha de log 1/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('avisa quando o servidor do bot não responde', async () => {
    mockFetch({
      '/status': () => { throw new TypeError('Failed to fetch'); },
      '/logs': () => { throw new TypeError('Failed to fetch'); },
    });
    render(<BotControlPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/sem resposta do servidor do bot/i);
  });

  it('avisa quando o token é recusado (401)', async () => {
    mockFetch({
      '/status': () => json({ error: 'Não autorizado.' }, 401),
      '/logs': () => json({ error: 'Não autorizado.' }, 401),
    });
    render(<BotControlPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent(/recusou o token/i);
  });

  it('confirma o reinício com sucesso e envia o token', async () => {
    const fn = mockFetch({
      '/status': okStatus,
      '/logs': () => new Response('ok'),
      '/restart': () => json({ ok: true, output: '' }),
    });
    render(<BotControlPanel />);
    await screen.findByText(/running/);
    await userEvent.click(screen.getByRole('button', { name: /reiniciar \(sem rebuild\)/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/reiniciado com sucesso/i);
    const call = fn.mock.calls.find(([u]) => String(u).endsWith('/restart'))!;
    expect(call[1]?.method).toBe('POST');
    expect((call[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('mostra o erro devolvido pelo servidor quando o reinício falha', async () => {
    mockFetch({
      '/status': okStatus,
      '/logs': () => new Response('ok'),
      '/restart': () => json({ ok: false, output: 'docker: permission denied' }),
    });
    render(<BotControlPanel />);
    await screen.findByText(/running/);
    await userEvent.click(screen.getByRole('button', { name: /reiniciar \(sem rebuild\)/i }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/não foi possível reiniciar/i);
    expect(alert).toHaveTextContent(/permission denied/);
  });

  it('mostra falha de rede ao reiniciar (não fica mudo)', async () => {
    mockFetch({
      '/status': okStatus,
      '/logs': () => new Response('ok'),
      '/restart': () => { throw new TypeError('Failed to fetch'); },
    });
    render(<BotControlPanel />);
    await screen.findByText(/running/);
    await userEvent.click(screen.getByRole('button', { name: /reiniciar \(sem rebuild\)/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/sem resposta do servidor do bot/i));
  });
});
