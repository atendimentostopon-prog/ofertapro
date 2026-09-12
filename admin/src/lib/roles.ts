// Replica local dos cargos. O build do admin/ na Vercel roda com root em admin/
// e nao alcanca ../shared; shared/admin-permissions.ts continua a fonte para o
// seed SQL e para os testes. Mesmo padrao do admin-api/_roles.ts.
export const ROLE_KEYS = ['SUPER_ADMIN', 'SUPPORT', 'DEVELOPER', 'ANALYST'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLES: readonly { key: RoleKey; label: string; description: string }[] = [
  { key: 'SUPER_ADMIN', label: 'Super Admin', description: 'Controle total do painel.' },
  { key: 'SUPPORT', label: 'Suporte', description: 'Operacao de usuarios, promocoes, links, envios e suporte.' },
  { key: 'DEVELOPER', label: 'Desenvolvedor', description: 'Logs, erros, jobs, filas, webhooks, integracoes e system health.' },
  { key: 'ANALYST', label: 'Analista', description: 'Leitura de dashboard, analytics e metricas.' },
];
