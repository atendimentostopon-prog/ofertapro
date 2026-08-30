import { getRequestContext } from './_lib.ts';

export type AuditContext = { ip: string | null; user_agent: string | null; request_id: string };

export function auditContextFrom(req: Request): AuditContext {
  const { ip, user_agent, request_id } = getRequestContext(req);
  return { ip, user_agent, request_id };
}

export const ACTION_NAMES = {
  ADMIN_INVITED: 'admins/invite',
  ADMIN_SUSPENDED: 'admins/suspend',
  ADMIN_REACTIVATED: 'admins/reactivate',
  ROLE_ASSIGNED: 'roles/assign',
  ROLE_REVOKED: 'roles/revoke',
} as const;
