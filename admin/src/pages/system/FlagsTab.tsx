import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Flag = { key: string; value: unknown; description: string | null; updated_at: string };

function isBool(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function display(v: unknown): string {
  return typeof v === 'string' ? v : JSON.stringify(v);
}

export default function FlagsTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'feature_flags.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Flag[] }>('system', 'flags', {}),
    [],
  );
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('true');
  const [newDesc, setNewDesc] = useState('');

  const setFlag = async (key: string, value: string, description?: string) => {
    try {
      await callAdminApi('system', 'flag-set', { key, value, description });
      toast('Flag salva.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao salvar a flag.');
    }
  };
  const delFlag = async (key: string) => {
    try {
      await callAdminApi('system', 'flag-delete', { key });
      toast('Flag removida.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao remover.');
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-line bg-surface-1 px-3 py-2 text-xs text-ink-secondary">
        Cada flag so tem efeito quando a aplicacao ou uma Edge Function ler ela. O painel so registra.
      </p>

      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-surface-1">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Chave</th>
              <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Valor</th>
              <th className="px-3 py-2 text-xs font-semibold text-ink-secondary">Descricao</th>
              {canManage && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {data.items.map((f) => (
              <tr key={f.key} className="border-b border-line-subtle last:border-0">
                <td className="px-3 py-2 font-mono text-ink">{f.key}</td>
                <td className="px-3 py-2">
                  {isBool(f.value) ? (
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox" aria-label={`${f.key} valor`} checked={f.value} disabled={!canManage}
                        onChange={(e) => setFlag(f.key, e.target.checked ? 'true' : 'false')}
                      />
                      <span className="text-xs text-ink-secondary">{String(f.value)}</span>
                    </label>
                  ) : canManage ? (
                    <input
                      type="text" defaultValue={display(f.value)} aria-label={`${f.key} valor`}
                      onBlur={(e) => { if (e.target.value !== display(f.value)) setFlag(f.key, e.target.value); }}
                      className="w-40 rounded-lg border border-line bg-surface-0 px-2 py-1 text-xs text-ink"
                    />
                  ) : (
                    <span className="font-mono text-xs text-ink">{display(f.value)}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-ink-secondary">{f.description ?? '-'}</td>
                {canManage && (
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => delFlag(f.key)} className="text-xs font-semibold text-danger-ink">
                      remover
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form
          className="flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-0 p-4 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newKey.trim()) return;
            setFlag(newKey.trim(), newVal, newDesc.trim() || undefined);
            setNewKey(''); setNewVal('true'); setNewDesc('');
          }}
        >
          <label className="text-xs text-ink-secondary">
            Chave
            <input value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="minha_flag"
              className="mt-1 block w-40 rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-secondary">
            Valor
            <input value={newVal} onChange={(e) => setNewVal(e.target.value)}
              className="mt-1 block w-32 rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <label className="text-xs text-ink-secondary">
            Descricao
            <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
              className="mt-1 block w-56 rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <button type="submit" className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0">
            Adicionar
          </button>
        </form>
      )}
    </div>
  );
}
