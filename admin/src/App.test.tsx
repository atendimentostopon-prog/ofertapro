import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const phaseRef = { current: 'resolving' as string };
vi.mock('./context/AdminAuthContext', () => ({
  AdminAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAdminAuth: () => ({ phase: phaseRef.current, identity: phaseRef.current === 'ready'
    ? { adminId: 'a', email: 'e@x.c', roleKeys: ['SUPER_ADMIN'], permissions: [] } : null,
    error: null, refresh: vi.fn(), signOut: vi.fn() }),
}));
vi.mock('./lib/env', () => ({ ENV: { isProd: false, adminHostname: 'admin.aflyo.com.br', adminApiUrl: 'https://test.supabase.co/functions/v1/admin-api', supabaseUrl: 'https://test.supabase.co', supabaseAnonKey: 'test-anon-key' } }));

import App from './App';

beforeEach(() => { phaseRef.current = 'resolving'; });

describe('App gates', () => {
  it('phase anon -> tela de login', async () => {
    phaseRef.current = 'anon';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/entrar/i)).toBeInTheDocument());
  });
  it('phase not_admin -> acesso nao autorizado', async () => {
    phaseRef.current = 'not_admin';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/nao autorizado|nao tem acesso/i)).toBeInTheDocument());
  });
  it('phase ready -> shell com Dashboard', async () => {
    phaseRef.current = 'ready';
    render(<App />);
    await waitFor(() => expect(screen.getByText(/dashboard/i)).toBeInTheDocument());
  });
});
