// Rotulos pt-BR das permissoes e grupos, so pra exibicao no painel. As 49 chaves
// batem com o seed da migration 20260829130000 / shared/admin-permissions.ts.
// A autoridade do RBAC continua no banco; aqui e so texto amigavel.

export const GROUP_LABELS: Record<string, string> = {
  overview: 'Visão geral',
  users: 'Usuários',
  operation: 'Operação',
  monitoring: 'Monitoramento',
  integrations: 'Integrações',
  security: 'Segurança',
  system: 'Sistema',
  administration: 'Administração',
};

export const PERMISSION_LABELS: Record<string, string> = {
  'dashboard.read': 'Ver o dashboard',
  'analytics.read': 'Ver analytics',

  'users.read': 'Ver usuários',
  'users.suspend': 'Suspender usuário',
  'users.reactivate': 'Reativar usuário',
  'users.sessions.read': 'Ver sessões do usuário',
  'users.sessions.revoke': 'Revogar sessões do usuário',
  'users.notes.manage': 'Gerenciar anotações do usuário',
  'users.tags.manage': 'Gerenciar tags do usuário',
  'users.impersonate': 'Personificar usuário',
  'users.billing.manage': 'Gerenciar plano e trial do usuário',

  'promotions.read': 'Ver promoções',
  'promotions.retry': 'Reprocessar promoção',
  'promotions.cancel': 'Cancelar promoção',
  'links.read': 'Ver links',
  'links.test': 'Testar link',
  'links.retry': 'Reprocessar link',
  'links.disable': 'Desabilitar link',
  'shortener.read': 'Ver encurtador',
  'shortener.manage': 'Gerenciar encurtador',
  'sends.read': 'Ver envios',
  'sends.retry': 'Reenviar',
  'sends.cancel': 'Cancelar envio',

  'jobs.read': 'Ver jobs',
  'jobs.retry': 'Reprocessar job',
  'jobs.cancel': 'Cancelar job',
  'queues.read': 'Ver filas',
  'errors.read': 'Ver erros',
  'errors.manage': 'Gerenciar erros',
  'logs.read': 'Ver logs',
  'system_health.read': 'Ver saúde do sistema',

  'cakto.read': 'Ver Cakto',
  'cakto.sync': 'Sincronizar Cakto',
  'webhooks.read': 'Ver webhooks',
  'webhooks.retry': 'Reprocessar webhook',

  'security.read': 'Ver segurança',
  'security.block_ip': 'Bloquear IP',
  'risk.read': 'Ver risco',
  'risk.manage': 'Gerenciar risco',
  'audit.read': 'Ver auditoria',

  'feature_flags.read': 'Ver feature flags',
  'feature_flags.manage': 'Gerenciar feature flags',
  'announcements.read': 'Ver anúncios',
  'announcements.manage': 'Gerenciar anúncios',
  'system_settings.read': 'Ver configurações do sistema',
  'system_settings.manage': 'Gerenciar configurações do sistema',

  'admins.read': 'Ver administradores',
  'admins.manage': 'Gerenciar administradores',
  'roles.read': 'Ver cargos',
  'roles.manage': 'Gerenciar cargos',
};

export const PERMISSION_ORDER: string[] = Object.keys(PERMISSION_LABELS);

export function permLabel(key: string): string {
  return PERMISSION_LABELS[key] ?? key;
}

export function groupLabel(key: string): string {
  return GROUP_LABELS[key] ?? key;
}
