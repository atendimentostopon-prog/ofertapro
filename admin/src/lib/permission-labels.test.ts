import { describe, it, expect } from 'vitest';
import { PERMISSION_LABELS, GROUP_LABELS, permLabel, groupLabel, PERMISSION_ORDER } from './permission-labels';

const KEYS = [
  'dashboard.read', 'analytics.read',
  'users.read', 'users.suspend', 'users.reactivate', 'users.sessions.read',
  'users.sessions.revoke', 'users.notes.manage', 'users.tags.manage', 'users.impersonate',
  'users.billing.manage',
  'promotions.read', 'promotions.retry', 'promotions.cancel',
  'links.read', 'links.test', 'links.retry', 'links.disable',
  'shortener.read', 'shortener.manage',
  'sends.read', 'sends.retry', 'sends.cancel',
  'jobs.read', 'jobs.retry', 'jobs.cancel', 'queues.read',
  'errors.read', 'errors.manage', 'logs.read', 'system_health.read',
  'cakto.read', 'cakto.sync', 'webhooks.read', 'webhooks.retry',
  'security.read', 'security.block_ip', 'risk.read', 'risk.manage', 'audit.read',
  'feature_flags.read', 'feature_flags.manage', 'announcements.read', 'announcements.manage',
  'system_settings.read', 'system_settings.manage',
  'admins.read', 'admins.manage', 'roles.read', 'roles.manage',
];

describe('permission-labels', () => {
  it('tem rotulo pra todas as 50 permissoes', () => {
    expect(KEYS).toHaveLength(50);
    for (const k of KEYS) {
      expect(PERMISSION_LABELS[k], k).toBeTruthy();
      expect(PERMISSION_LABELS[k]).not.toBe(k);
    }
    expect(Object.keys(PERMISSION_LABELS)).toHaveLength(50);
  });

  it('tem rotulo pros 8 grupos', () => {
    for (const g of ['overview', 'users', 'operation', 'monitoring', 'integrations', 'security', 'system', 'administration']) {
      expect(GROUP_LABELS[g], g).toBeTruthy();
    }
    expect(Object.keys(GROUP_LABELS)).toHaveLength(8);
  });

  it('PERMISSION_ORDER tem as 50 chaves sem repetir', () => {
    expect(new Set(PERMISSION_ORDER).size).toBe(50);
    expect([...PERMISSION_ORDER].sort()).toEqual([...KEYS].sort());
  });

  it('helpers caem pro proprio key quando nao acham', () => {
    expect(permLabel('x.y')).toBe('x.y');
    expect(groupLabel('nope')).toBe('nope');
    expect(permLabel('dashboard.read')).toBe(PERMISSION_LABELS['dashboard.read']);
  });
});
