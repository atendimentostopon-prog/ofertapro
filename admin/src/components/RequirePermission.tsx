import type { ReactNode } from 'react';
import { useAdminAuth } from '../context/AdminAuthContext';
import { hasPermission } from '../lib/permissions';
import { ErrorState } from './ui/ErrorState';

export default function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { identity } = useAdminAuth();
  const granted = identity?.permissions ?? [];
  if (!hasPermission(granted, permission)) {
    return <ErrorState title="Sem permissao" message="Voce nao tem permissao para ver esta area." />;
  }
  return <>{children}</>;
}
