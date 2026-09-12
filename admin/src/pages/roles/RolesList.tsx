import { useCallback, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { ROLES } from '../../lib/roles';
import { callAdminApi } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { permLabel, groupLabel, PERMISSION_ORDER } from '../../lib/permission-labels';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type RoleRow = { key: string; label: string; description: string; permissions: string[] };
type PermRow = { key: string; grp: string; description: string };
type RolesPayload = { roles: RoleRow[]; permissions: PermRow[] };
type AdminRow = { id: string; email: string; roleKeys: string[] };

// Ordem de exibicao dos cards, do mais poderoso pro menos.
const ROLE_RANK: Record<string, number> = { SUPER_ADMIN: 0, SUPPORT: 1, DEVELOPER: 2, ANALYST: 3 };
const permRank = (k: string) => {
  const i = PERMISSION_ORDER.indexOf(k);
  return i === -1 ? 999 : i;
};

function RoleCard({ role, grpByPerm }: { role: RoleRow; grpByPerm: Map<string, string> }) {
  const [expanded, setExpanded] = useState(false);

  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const p of [...role.permissions].sort((a, b) => permRank(a) - permRank(b))) {
      const g = grpByPerm.get(p) ?? 'outros';
      const arr = m.get(g) ?? [];
      arr.push(p);
      m.set(g, arr);
    }
    return [...m.entries()];
  }, [role.permissions, grpByPerm]);

  const long = role.permissions.length > 12;
  const shown = long && !expanded ? groups.slice(0, 2) : groups;

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-bold text-ink">{role.label}</h2>
          {role.description && <p className="mt-0.5 text-xs text-ink-secondary">{role.description}</p>}
        </div>
        <Badge>{role.key}</Badge>
      </div>

      <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">
        {role.permissions.length} {role.permissions.length === 1 ? 'permissão' : 'permissões'}
      </p>

      <div className="mt-2 space-y-3">
        {shown.map(([grp, perms]) => (
          <div key={grp}>
            <p className="text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">{groupLabel(grp)}</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {perms.map((p) => (
                <span
                  key={p}
                  title={p}
                  className="rounded-md bg-surface-1 px-1.5 py-0.5 text-[11px] text-ink-secondary"
                >
                  {permLabel(p)}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {long && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-semibold text-ink-secondary underline"
        >
          {expanded ? 'ver menos' : `ver todas as ${role.permissions.length}`}
        </button>
      )}
    </div>
  );
}

export default function RolesList() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'roles.manage');

  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<RolesPayload>('roles', 'list'),
    [],
  );
  const { data: adminsData, reload: reloadAdmins } = useAsync(
    () => (canManage ? callAdminApi<{ admins: AdminRow[] }>('admins', 'list') : Promise.resolve({ admins: [] })),
    [canManage],
  );

  const grpByPerm = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of data?.permissions ?? []) map.set(p.key, p.grp);
    return map;
  }, [data]);

  const sortedRoles = useMemo(
    () => [...(data?.roles ?? [])].sort((a, b) => (ROLE_RANK[a.key] ?? 9) - (ROLE_RANK[b.key] ?? 9)),
    [data],
  );

  const [adminId, setAdminId] = useState('');
  const [roleKey, setRoleKey] = useState('');
  const [busy, setBusy] = useState(false);
  const selectedAdmin = (adminsData?.admins ?? []).find((a) => a.id === adminId) ?? null;

  const runMutation = useCallback(
    async (action: 'assign' | 'revoke', rk: string) => {
      if (!adminId || !rk) return;
      setBusy(true);
      try {
        await callAdminApi('roles', action, { adminId, roleKey: rk });
        toast(action === 'assign' ? 'Cargo atribuído.' : 'Cargo revogado.', 'success');
        reload();
        reloadAdmins();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Falha na operação.', 'error');
      } finally {
        setBusy(false);
      }
    },
    [adminId, toast, reload, reloadAdmins],
  );

  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">Cargos</h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Os 4 cargos do painel e as permissões de cada um.
        </p>
      </header>

      {loading && (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full" />
          ))}
        </div>
      )}

      {!loading && data && (
        <div className="grid gap-3 md:grid-cols-2">
          {sortedRoles.map((role) => (
            <RoleCard key={role.key} role={role} grpByPerm={grpByPerm} />
          ))}
        </div>
      )}

      {canManage && (
        <div className="rounded-xl border border-line bg-surface-0 p-4">
          <h2 className="font-display text-sm font-bold text-ink">Atribuir cargo</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            Escolha um administrador e o cargo. A mudança grava na auditoria.
          </p>

          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col">
              <span className="text-xs font-semibold text-ink-secondary">Administrador</span>
              <select
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="mt-1 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
              >
                <option value="">Selecione</option>
                {(adminsData?.admins ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.email}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col">
              <span className="text-xs font-semibold text-ink-secondary">Cargo</span>
              <select
                value={roleKey}
                onChange={(e) => setRoleKey(e.target.value)}
                className="mt-1 rounded-lg border border-line bg-surface-0 px-3 py-2 text-sm text-ink"
              >
                <option value="">Selecione</option>
                {ROLES.map((r) => (
                  <option key={r.key} value={r.key}>{r.label}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={busy || !adminId || !roleKey}
              onClick={() => { void runMutation('assign', roleKey); }}
              className="rounded-lg bg-graphite-900 px-3 py-2 text-sm font-semibold text-ink-inverse transition-colors hover:bg-graphite-700 disabled:opacity-50"
            >
              Atribuir cargo
            </button>
          </div>

          {selectedAdmin && (
            <div className="mt-4 border-t border-line-subtle pt-4">
              <p className="text-xs font-semibold text-ink-secondary">
                Cargos atuais de {selectedAdmin.email}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedAdmin.roleKeys.length === 0 && (
                  <span className="text-xs text-ink-tertiary">nenhum</span>
                )}
                {selectedAdmin.roleKeys.map((rk) => (
                  <span
                    key={rk}
                    className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 py-0.5 pl-2 pr-1 text-[11px] font-semibold text-ink-secondary"
                  >
                    {rk}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => { void runMutation('revoke', rk); }}
                      aria-label={`Revogar ${rk}`}
                      className="rounded-full p-0.5 text-ink-tertiary transition-colors hover:bg-danger-bg hover:text-danger-ink disabled:opacity-50"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
