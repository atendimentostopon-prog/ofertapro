import { it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// vi.hoisted: a factory do vi.mock e icada e nao pode fechar sobre const/class
// declarados abaixo. Holder de funcao (h.impl) no lugar de vi.fn().mockRejectedValue:
// no vitest 2.1.9 um spy async que rejeita gera unhandled rejection falso mesmo
// com o erro tratado no componente. O teste nao assere args.
const h = vi.hoisted(() => {
  class FakeErr extends Error {
    code: string;
    constructor(c: string) { super(c); this.code = c; }
  }
  return {
    FakeErr,
    impl: { current: (..._a: unknown[]): Promise<unknown> => Promise.resolve(null) },
  };
});
const FakeErr = h.FakeErr;
vi.mock('../../lib/admin-api', () => ({
  callAdminApi: (...a: unknown[]) => h.impl.current(...a),
  AdminApiError: h.FakeErr,
}));
vi.mock('../../context/ToastContext', () => ({ useToast: () => vi.fn() }));
vi.mock('react-router-dom', async (imp) => ({ ...(await imp<typeof import('react-router-dom')>()), useNavigate: () => vi.fn() }));

import InviteAdmin from './InviteAdmin';

it('mostra mensagem util quando a conta nao existe', async () => {
  h.impl.current = () => Promise.reject(new FakeErr('not_found'));
  render(<MemoryRouter><InviteAdmin /></MemoryRouter>);
  await userEvent.type(screen.getByLabelText(/e-mail/i), 'novo@pessoa.com');
  await userEvent.click(screen.getByRole('button', { name: /convidar/i }));
  await waitFor(() => expect(screen.getByText(/criar uma conta no Aflyo primeiro/i)).toBeInTheDocument());
});
