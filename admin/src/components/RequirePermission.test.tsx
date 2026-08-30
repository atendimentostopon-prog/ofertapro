import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RequirePermission from './RequirePermission';

vi.mock('../context/AdminAuthContext', () => ({
  useAdminAuth: () => ({ identity: { permissions: ['dashboard.read'] } }),
}));

describe('RequirePermission', () => {
  it('renderiza filhos quando tem a permissao', () => {
    render(<RequirePermission permission="dashboard.read"><div>ok</div></RequirePermission>);
    expect(screen.getByText('ok')).toBeInTheDocument();
  });
  it('bloqueia quando falta', () => {
    render(<RequirePermission permission="admins.manage"><div>ok</div></RequirePermission>);
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
    expect(screen.getByText(/nao tem permissao/i)).toBeInTheDocument();
  });
});
