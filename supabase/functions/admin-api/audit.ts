export type AuditContext = { ip: string | null; user_agent: string | null; request_id: string };

export const ACTION_NAMES = {
  ADMIN_INVITED: 'admins/invite',
  ADMIN_SUSPENDED: 'admins/suspend',
  ADMIN_REACTIVATED: 'admins/reactivate',
  ROLE_ASSIGNED: 'roles/assign',
  ROLE_REVOKED: 'roles/revoke',
} as const;
