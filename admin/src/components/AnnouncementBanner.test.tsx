import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const h = vi.hoisted(() => ({ resp: null as unknown }));
vi.mock('../lib/admin-api', () => ({
  callAdminApi: () => Promise.resolve(h.resp),
  AdminApiError: class extends Error {},
}));

import AnnouncementBanner from './AnnouncementBanner';

beforeEach(() => {
  try { sessionStorage.clear(); } catch { /* ignore */ }
  h.resp = null;
});

it('sem aviso ativo, nao renderiza nada', async () => {
  const { container } = render(<AnnouncementBanner />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it('com aviso ativo, mostra a mensagem e dispensa na sessao', async () => {
  h.resp = { id: 'a1', message: 'Manutencao', level: 'warning' };
  render(<AnnouncementBanner />);
  expect(await screen.findByText('Manutencao')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /dispensar/i }));
  await waitFor(() => expect(screen.queryByText('Manutencao')).not.toBeInTheDocument());
  expect(sessionStorage.getItem('aflyo_admin_dismissed_announcement')).toBe('a1');
});
