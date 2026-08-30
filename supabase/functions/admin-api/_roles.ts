// Replica local dos cargos (bundling da Edge Function nao alcanca shared/).
// shared/admin-permissions.ts continua a fonte para o front e o seed SQL.
export const ROLE_KEYS = ['SUPER_ADMIN', 'SUPPORT', 'DEVELOPER', 'ANALYST'] as const;
export type RoleKey = (typeof ROLE_KEYS)[number];
