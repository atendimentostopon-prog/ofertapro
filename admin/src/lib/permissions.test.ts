import { describe, it, expect } from 'vitest';
import { hasPermission } from './permissions';

describe('hasPermission', () => {
  it('true quando a permissao esta na lista', () => {
    expect(hasPermission(['dashboard.read', 'audit.read'], 'audit.read')).toBe(true);
  });
  it('false quando falta', () => {
    expect(hasPermission(['dashboard.read'], 'admins.manage')).toBe(false);
  });
  it('SUPER_ADMIN sentinela concede tudo', () => {
    expect(hasPermission(['SUPER_ADMIN'], 'qualquer.coisa')).toBe(true);
  });
});
