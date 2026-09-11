import { useState } from 'react';
import { callAdminApi, AdminApiError } from '../../lib/admin-api';
import { useAsync } from '../../lib/use-async';
import { useAdminAuth } from '../../context/AdminAuthContext';
import { useToast } from '../../context/ToastContext';
import { hasPermission } from '../../lib/permissions';
import { Badge } from '../../components/ui/Badge';
import { Skeleton } from '../../components/ui/Skeleton';
import { ErrorState } from '../../components/ui/ErrorState';

type Ann = {
  id: string; message: string; level: 'info' | 'warning' | 'danger'; active: boolean;
  starts_at: string | null; ends_at: string | null; created_at: string; updated_at: string;
};
const TONE: Record<string, 'info' | 'warning' | 'danger'> = { info: 'info', warning: 'warning', danger: 'danger' };

function fmt(v: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR');
}

export default function AnnouncementsTab() {
  const { identity } = useAdminAuth();
  const toast = useToast();
  const canManage = hasPermission(identity?.permissions ?? [], 'announcements.manage');
  const { data, loading, error, reload } = useAsync(
    () => callAdminApi<{ items: Ann[] }>('system', 'announcements', {}),
    [],
  );
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState<'info' | 'warning' | 'danger'>('info');
  const [active, setActive] = useState(false);

  const create = async () => {
    if (!message.trim()) return;
    try {
      await callAdminApi('system', 'announcement-upsert', { message: message.trim(), level, active });
      toast('Aviso publicado.');
      setMessage(''); setLevel('info'); setActive(false);
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao publicar.');
    }
  };
  const toggleActive = async (a: Ann) => {
    try {
      await callAdminApi('system', 'announcement-upsert', {
        id: a.id, message: a.message, level: a.level, active: !a.active,
        startsAt: a.starts_at ?? '', endsAt: a.ends_at ?? '',
      });
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao atualizar.');
    }
  };
  const remove = async (id: string) => {
    try {
      await callAdminApi('system', 'announcement-delete', { id });
      toast('Aviso removido.');
      reload();
    } catch (e) {
      toast(e instanceof AdminApiError ? e.message : 'Falha ao remover.');
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {canManage && (
        <form
          className="space-y-2 rounded-xl border border-line bg-surface-0 p-4 shadow-card"
          onSubmit={(e) => { e.preventDefault(); create(); }}
        >
          <label className="block text-xs text-ink-secondary">
            Mensagem
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2}
              className="mt-1 block w-full rounded-lg border border-line bg-surface-0 px-2 py-1.5 text-sm text-ink" />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-ink-secondary">
              Nivel
              <select value={level} onChange={(e) => setLevel(e.target.value as typeof level)}
                className="ml-2 rounded-lg border border-line bg-surface-0 px-2 py-1 text-sm text-ink">
                <option value="info">info</option>
                <option value="warning">warning</option>
                <option value="danger">danger</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs text-ink">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> ativo
            </label>
            <button type="submit" className="rounded-lg border border-line bg-ink px-3 py-1.5 text-xs font-semibold text-surface-0">
              Criar
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {data.items.length === 0 && <p className="text-xs text-ink-secondary">Nenhum aviso.</p>}
        {data.items.map((a) => (
          <div key={a.id} className="rounded-xl border border-line bg-surface-0 p-3 shadow-card">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={TONE[a.level]}>{a.level}</Badge>
              {a.active ? <Badge tone="success">ativo</Badge> : <Badge>inativo</Badge>}
              <span className="text-sm text-ink">{a.message}</span>
            </div>
            <p className="mt-1 text-[11px] text-ink-tertiary">
              janela: {fmt(a.starts_at)} a {fmt(a.ends_at)} | criado {fmt(a.created_at)}
            </p>
            {canManage && (
              <div className="mt-2 flex gap-3">
                <button type="button" onClick={() => toggleActive(a)} className="text-xs font-semibold text-ink-secondary">
                  {a.active ? 'desativar' : 'ativar'}
                </button>
                <button type="button" onClick={() => remove(a.id)} className="text-xs font-semibold text-danger-ink">
                  remover
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
