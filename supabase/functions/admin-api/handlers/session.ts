import type { Handler } from '../index.ts';

export const whoami: Handler = async (_params, identity) => ({
  adminId: identity.adminId,
  email: identity.email,
  roleKeys: identity.roleKeys,
  permissions: Array.from(identity.permissions),
});
