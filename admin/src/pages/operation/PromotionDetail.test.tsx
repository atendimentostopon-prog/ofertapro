import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

const h = vi.hoisted(() => {
  class FakeErr extends Error { code: string; constructor(c: string, m: string) { super(m); this.code = c; } }
  return { FakeErr, get: (..._a: unknown[]): Promise<unknown> => Promise.resolve(null) };
});
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => h.get(...a),
  AdminApiError: h.FakeErr,
}));

import PromotionDetail from './PromotionDetail';

const DETAIL = {
  offer: { id: 'o1', name: 'Fone TWS', status: 'active', short_code: 'abc', affiliate_link: 'https://x', image: null, marketplace: 'shopee', created_at: '2026-08-01', owner_id: 'u1', owner_email: 'cliente@x.com' },
  clicks: { total: 12, last_30d: 5, by_source: [{ source: 'whatsapp', count: 8 }, { source: '', count: 4 }] },
};

function renderAt(id = 'o1') {
  return render(
    <MemoryRouter initialEntries={[`/promotions/${id}`]}>
      <Routes><Route path="/promotions/:id" element={<PromotionDetail />} /></Routes>
    </MemoryRouter>,
  );
}

it('mostra a oferta e o link pro dono', async () => {
  h.get = () => Promise.resolve(DETAIL);
  renderAt();
  await waitFor(() =>
    expect(screen.getByRole('heading', { name: 'Fone TWS', level: 3 })).toBeInTheDocument(),
  );
  const ownerLink = screen.getByRole('link', { name: /cliente@x.com/i });
  expect(ownerLink).toHaveAttribute('href', '/users/u1');
});

it('not_found vira ErrorState', async () => {
  h.get = () => Promise.reject(new h.FakeErr('not_found', 'Promocao nao encontrada.'));
  renderAt();
  await waitFor(() => expect(screen.getByText(/promocao nao encontrada/i)).toBeInTheDocument());
});
