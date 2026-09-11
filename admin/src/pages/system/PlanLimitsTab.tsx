import { useMemo, useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Row = {
  plan: string;
  max_source_groups: number; max_whatsapp_instances: number;
  max_whatsapp_dest_groups: number; max_telegram_dest_groups: number;
  allow_shortener: boolean; allow_analytics: boolean;
  allow_scheduling: boolean; remove_branding: boolean;
  updated_at: string;
};
type Impact = Record<'max_source_groups' | 'max_whatsapp_instances' | 'max_whatsapp_dest_groups' | 'max_telegram_dest_groups', number | null>;

const NUM_FIELDS: Array<{ key: keyof Row; label: string }> = [
  { key: 'max_source_groups', label: 'Grupos de origem' },
  { key: 'max_whatsapp_instances', label: 'Instancias WhatsApp' },
  { key: 'max_whatsapp_dest_groups', label: 'Grupos destino WhatsApp' },
  { key: 'max_telegram_dest_groups', label: 'Grupos destino Telegram' },
];
const BOOL_FIELDS: Array<{ key: keyof Row; label: string }> = [
  { key: 'allow_shortener', label: 'Encurtador' },
  { key: 'allow_analytics', label: 'Analytics' },
  { key: 'allow_scheduling', label: 'Agendamento' },
  { key: 'remove_branding', label: 'Sem marca' },
];

function PlanCard({ row, canManage }: { row: Row; canManage: boolean }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<Impact | null>(null);

  const dirtyKeys = Object.keys(draft);
  const val = (k: keyof Row): string | boolean => (k in draft ? draft[k] : (row[k] as string | boolean));

  const save = async () => {
    if (dirtyKeys.length === 0) return;
    setBusy(true);
    setImpact(null);
    try {
      const res = await callAdminApi<{ impact: Impact }>('system', 'plan-limits-update', {
        plan: row.plan,
        patch: Object.fromEntries(dirtyKeys.map((k) => [k, typeof draft[k] === 'boolean' ? draft[k] : String(draft[k])])),
      });
      setImpact(res.impact);
      setDraft({});
      toast('Limites salvos.');
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-line bg-surface-0 p-4 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm font-bold capitalize text-ink">{row.plan}</h3>
        {canManage && (
          <button type="button" onClick={save} disabled={busy || dirtyKeys.length === 0}
            className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0 disabled:opacity-50">
            {busy ? 'Salvando...' : 'Salvar'}
          </button>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {NUM_FIELDS.map((f) => (
          <label key={f.key} className="text-xs text-ink-secondary">
            {f.label}
            <input
              type="number" min={0} aria-label={`${f.label} ${row.plan}`}
              value={String(val(f.key))}
              disabled={!canManage}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink disabled:opacity-60"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-3">
        {BOOL_FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-xs text-ink">
            <input
              type="checkbox" checked={Boolean(val(f.key))} disabled={!canManage}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
            />
            {f.label}
          </label>
        ))}
      </div>
      {impact && (
        <ul className="mt-3 space-y-0.5 text-[11px] text-warning-ink">
          {NUM_FIELDS.map((f) => {
            const n = impact[f.key as keyof Impact];
            if (n == null || n === 0) return null;
            return <li key={f.key}>{f.label}: {n} conta(s) do plano {row.plan} passam do novo limite (aproximado).</li>;
          })}
        </ul>
      )}
    </div>
  );
}

export default function PlanLimitsTab() {
  const { identity } = useAdminAuth();
  const canManage = hasPermission(identity?.permissions ?? [], 'system_settings.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Row[] }>('system', 'plan-limits', {}),
    [],
  );
  const rows = useMemo(() => data?.items ?? [], [data]);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-3">
      {!canManage && <p className="text-xs text-ink-secondary">Somente leitura (falta system_settings.manage).</p>}
      {rows.map((r) => <PlanCard key={r.plan} row={r} canManage={canManage} />)}
    </div>
  );
}
