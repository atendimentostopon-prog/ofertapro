import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminAuthProvider, useAdminAuth } from './AdminAuthContext';

const getSession = vi.fn();
const getAal = vi.fn();
const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...a: unknown[]) => getSession(...a),
      mfa: { getAuthenticatorAssuranceLevel: (...a: unknown[]) => getAal(...a) },
      onAuthStateChange: (...a: unknown[]) => onAuthStateChange(...a),
      signOut: vi.fn(),
    },
  },
}));
const callAdminApi = vi.fn();
vi.mock('../lib/admin-api', async () => {
  const actual = await vi.importActual<typeof import('../lib/admin-api')>('../lib/admin-api');
  return { ...actual, callAdminApi: (...a: unknown[]) => callAdminApi(...a) };
});

function Probe() {
  const { phase, identity } = useAdminAuth();
  return <div>phase:{phase}{identity ? `|perm:${identity.permissions.join(',')}` : ''}</div>;
}

beforeEach(() => { getSession.mockReset(); getAal.mockReset(); callAdminApi.mockReset(); });

describe('AdminAuthProvider', () => {
  it('sem sessao -> anon', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:anon/)).toBeInTheDocument());
  });

  it('sessao sem fator MFA -> needs_mfa_enroll', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal1', nextLevel: 'aal1' } });
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:needs_mfa_enroll/)).toBeInTheDocument());
  });

  it('aal2 + whoami ok -> ready com permissoes', async () => {
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } });
    callAdminApi.mockResolvedValue({ adminId: 'a1', email: 'e', roleKeys: ['DEVELOPER'], permissions: ['dashboard.read'] });
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:ready\|perm:dashboard.read/)).toBeInTheDocument());
  });

  it('aal2 + whoami forbidden -> not_admin', async () => {
    const { AdminApiError } = await vi.importActual<typeof import('../lib/admin-api')>('../lib/admin-api');
    getSession.mockResolvedValue({ data: { session: { access_token: 't' } } });
    getAal.mockResolvedValue({ data: { currentLevel: 'aal2', nextLevel: 'aal2' } });
    callAdminApi.mockRejectedValue(new AdminApiError('forbidden', 'no', 403));
    render(<AdminAuthProvider><Probe /></AdminAuthProvider>);
    await waitFor(() => expect(screen.getByText(/phase:not_admin/)).toBeInTheDocument());
  });
});
