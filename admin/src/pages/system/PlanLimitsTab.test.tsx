import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const h = vi.hoisted(() => ({ calls: [] as unknown[][], perms: { value: ['system_settings.read'] as string[] },
  impl: (_r: string, action: string): Promise<unknown> => {
    if (action === 'plan-limits') return Promise.resolve({ items: [
      { plan: 'free', max_source_groups: 0, max_whatsapp_instances: 0, max_whatsapp_dest_groups: 0, max_telegram_dest_groups: 0, allow_shortener: false, allow_analytics: false, allow_scheduling: false, remove_branding: false, updated_at: '2026-08-30T00:00:00Z' },
      { plan: 'pro', max_source_groups: 6, max_whatsapp_instances: 2, max_whatsapp_dest_groups: 12, max_telegram_dest_groups: 12, allow_shortener: true, allow_analytics: true, allow_scheduling: true, remove_branding: false, updated_at: '2026-08-30T00:00:00Z' },
    ] });
    if (action === 'plan-limits-update') return Promise.resolve({ row: {}, impact: { max_source_groups: 2, max_whatsapp_instances: null, max_whatsapp_dest_groups: null, max_telegram_dest_groups: null } });
    return Promise.resolve({});
  } }));
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => { h.calls.push(a); return h.impl(a[0] as string, a[1] as string); },
  AdminApiError: class extends Error {},
}));
vi.mock('../../context/AdminAuthContext', () => ({ useAdminAuth: () => ({ identity: { permissions: h.perms.value } }) }));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));

import PlanLimitsTab from './PlanLimitsTab';

beforeEach(() => { h.perms.value = ['system_settings.read']; h.calls.length = 0; });

it('lista os planos; sem manage nao mostra Salvar', async () => {
  render(<MemoryRouter><PlanLimitsTab /></MemoryRouter>);
  await screen.findByText('pro');
  expect(screen.queryByRole('button', { name: /salvar/i })).not.toBeInTheDocument();
});

it('com manage, editar e salvar chama plan-limits-update e mostra o impacto', async () => {
  h.perms.value = ['system_settings.read', 'system_settings.manage'];
  render(<MemoryRouter><PlanLimitsTab /></MemoryRouter>);
  await screen.findByText('pro');
  const input = screen.getAllByLabelText(/grupos de origem/i)[1]; // linha do pro
  await userEvent.clear(input);
  await userEvent.type(input, '2');
  await userEvent.click(screen.getAllByRole('button', { name: /salvar/i })[1]);
  await waitFor(() => {
    const last = h.calls[h.calls.length - 1];
    expect(last[1]).toBe('plan-limits-update');
    expect((last[2] as { plan?: string }).plan).toBe('pro');
    expect((last[2] as { patch?: Record<string, unknown> }).patch).toMatchObject({ max_source_groups: '2' });
  });
  expect(await screen.findByText(/2 conta/i)).toBeInTheDocument();
});
