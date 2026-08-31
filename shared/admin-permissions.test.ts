import { describe, it, expect } from 'vitest';
import {
  PERMISSION_KEYS, PERMISSIONS, ROLE_KEYS, ROLE_PERMISSIONS, SP1_ENFORCED_PERMISSIONS,
} from './admin-permissions';

describe('catálogo de permissões', () => {
  it('tem as 50 permissoes do catalogo, sem duplicata', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
    expect(PERMISSION_KEYS).toContain('dashboard.read');
    expect(PERMISSION_KEYS).toContain('roles.manage');
    expect(PERMISSION_KEYS).toContain('users.impersonate');
    expect(PERMISSION_KEYS).toContain('users.billing.manage');
    expect(PERMISSION_KEYS.length).toBe(50);
  });

  it('toda permissão em PERMISSIONS existe em PERMISSION_KEYS e tem grupo', () => {
    for (const p of PERMISSIONS) {
      expect(PERMISSION_KEYS).toContain(p.key);
      expect(p.grp).toBeTruthy();
    }
    expect(PERMISSIONS.length).toBe(PERMISSION_KEYS.length);
  });

  it('SUPER_ADMIN recebe todas as permissões', () => {
    expect([...ROLE_PERMISSIONS.SUPER_ADMIN].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it('ANALYST é read-only de métricas', () => {
    expect([...ROLE_PERMISSIONS.ANALYST].sort()).toEqual(
      ['analytics.read', 'dashboard.read', 'system_health.read'].sort(),
    );
  });

  it('DEVELOPER não pode suspender usuário mas pode dar retry em job', () => {
    expect(ROLE_PERMISSIONS.DEVELOPER).not.toContain('users.suspend');
    expect(ROLE_PERMISSIONS.DEVELOPER).toContain('jobs.retry');
  });

  it('SUPPORT não recebe users.impersonate no seed', () => {
    expect(ROLE_PERMISSIONS.SUPPORT).not.toContain('users.impersonate');
  });

  it('toda permissão de todo cargo existe no catálogo', () => {
    for (const key of ROLE_KEYS) {
      for (const perm of ROLE_PERMISSIONS[key]) expect(PERMISSION_KEYS).toContain(perm);
    }
  });

  it('SP1_ENFORCED_PERMISSIONS são as 6 com tela no SP1', () => {
    expect([...SP1_ENFORCED_PERMISSIONS].sort()).toEqual(
      ['admins.manage', 'admins.read', 'audit.read', 'dashboard.read', 'roles.manage', 'roles.read'].sort(),
    );
  });
});
