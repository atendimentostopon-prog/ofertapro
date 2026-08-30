export const PERMISSION_GROUPS = [
  'overview', 'users', 'operation', 'monitoring', 'integrations', 'security', 'system', 'administration',
] as const;
export type PermissionGroup = (typeof PERMISSION_GROUPS)[number];

const RAW = {
  overview: ['dashboard.read', 'analytics.read'],
  users: [
    'users.read', 'users.suspend', 'users.reactivate', 'users.sessions.read',
    'users.sessions.revoke', 'users.notes.manage', 'users.tags.manage', 'users.impersonate',
  ],
  operation: [
    'promotions.read', 'promotions.retry', 'promotions.cancel',
    'links.read', 'links.test', 'links.retry', 'links.disable',
    'shortener.read', 'shortener.manage',
    'sends.read', 'sends.retry', 'sends.cancel',
  ],
  monitoring: [
    'jobs.read', 'jobs.retry', 'jobs.cancel', 'queues.read',
    'errors.read', 'errors.manage', 'logs.read', 'system_health.read',
  ],
  integrations: ['cakto.read', 'cakto.sync', 'webhooks.read', 'webhooks.retry'],
  security: ['security.read', 'security.block_ip', 'risk.read', 'risk.manage', 'audit.read'],
  system: [
    'feature_flags.read', 'feature_flags.manage', 'announcements.read', 'announcements.manage',
    'system_settings.read', 'system_settings.manage',
  ],
  administration: ['admins.read', 'admins.manage', 'roles.read', 'roles.manage'],
} as const satisfies Record<PermissionGroup, readonly string[]>;

export const PERMISSIONS = PERMISSION_GROUPS.flatMap((grp) =>
  RAW[grp].map((key) => ({ key, grp, description: key })),
) as readonly { key: string; grp: PermissionGroup; description: string }[];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as readonly string[];
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export const ROLE_KEYS = ['SUPER_ADMIN', 'SUPPORT', 'DEVELOPER', 'ANALYST'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLES: readonly { key: RoleKey; label: string; description: string }[] = [
  { key: 'SUPER_ADMIN', label: 'Super Admin', description: 'Controle total do painel.' },
  { key: 'SUPPORT', label: 'Suporte', description: 'Operacao de usuarios, promocoes, links, envios e suporte.' },
  { key: 'DEVELOPER', label: 'Desenvolvedor', description: 'Logs, erros, jobs, filas, webhooks, integracoes e system health.' },
  { key: 'ANALYST', label: 'Analista', description: 'Leitura de dashboard, analytics e metricas.' },
];

const SUPPORT: PermissionKey[] = [
  'dashboard.read', 'users.read', 'users.suspend', 'users.reactivate', 'users.sessions.read',
  'users.sessions.revoke', 'users.notes.manage', 'users.tags.manage',
  'promotions.read', 'promotions.retry', 'promotions.cancel',
  'links.read', 'links.test', 'links.retry', 'links.disable', 'shortener.read',
  'sends.read', 'sends.retry', 'sends.cancel', 'cakto.read', 'webhooks.read', 'audit.read',
];
const DEVELOPER: PermissionKey[] = [
  'dashboard.read', 'logs.read', 'errors.read', 'errors.manage', 'jobs.read', 'jobs.retry',
  'jobs.cancel', 'queues.read', 'webhooks.read', 'webhooks.retry', 'cakto.read', 'cakto.sync',
  'system_health.read', 'audit.read',
];
const ANALYST: PermissionKey[] = ['dashboard.read', 'analytics.read', 'system_health.read'];

export const ROLE_PERMISSIONS: Record<RoleKey, readonly PermissionKey[]> = {
  SUPER_ADMIN: [...PERMISSION_KEYS],
  SUPPORT,
  DEVELOPER,
  ANALYST,
};

export const SP1_ENFORCED_PERMISSIONS: readonly PermissionKey[] = [
  'dashboard.read', 'admins.read', 'admins.manage', 'roles.read', 'roles.manage', 'audit.read',
];
