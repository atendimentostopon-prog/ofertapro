import React, { useCallback, useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useNow } from '../../hooks/useNow';
import { SourceGroupService, type SourceActivity } from '../../services/SourceGroupService';
import { reasonLabel, statusLabel, type SourceMessageStatus } from '../../lib/sourceReasons';
import { Section } from '../ui/Section';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState } from '../ui/ErrorState';
import { LoadingState } from '../ui/LoadingState';

const STATUS_CLASS: Record<SourceMessageStatus, string> = {
  dispatched: 'bg-success-bg text-success-ink border-success/20',
  skipped: 'bg-surface-1 text-ink-secondary border-line',
  failed: 'bg-danger-bg text-danger-ink border-danger/20',
  pending: 'bg-warning-bg text-warning-ink border-warning/20',
  processing: 'bg-warning-bg text-warning-ink border-warning/20',
};

function relative(now: number, iso: string): string {
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'agora';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'há 1 dia' : `há ${days} dias`;
}

function firstLine(text: string): string {
  const line = text.split('\n').map((l) => l.replace(/[*_~]/g, '').trim()).find(Boolean) ?? '';
  return line.length > 80 ? `${line.slice(0, 80)}...` : line;
}

export interface SourceActivityHandle { reload: () => void }

export const SourceActivityList = forwardRef<SourceActivityHandle>((_props, ref) => {
  const { user } = useUser();
  const now = useNow();
  const [items, setItems] = useState<SourceActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    setError('');
    try {
      setItems(await SourceGroupService.recentActivity(user.id));
    } catch (err) {
      console.error('[Fontes] erro ao carregar atividade:', err);
      setError('Não foi possível carregar a atividade.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);
  useImperativeHandle(ref, () => ({ reload: load }), [load]);

  return (
    <Section
      title="Atividade"
      description="As últimas ofertas lidas dos seus grupos de origem e o que aconteceu com cada uma."
      icon={Activity}
    >
      <div className="flex justify-end mb-3">
        <Button variant="ghost" size="sm" icon={RefreshCw} onClick={() => { setLoading(true); load(); }}>
          Atualizar
        </Button>
      </div>
      {loading ? (
        <LoadingState type="skeleton-list" count={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="Nenhuma oferta lida ainda"
          description="Quando um grupo de origem postar uma oferta com link, ela aparece aqui."
          compact
        />
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {items.map((m) => (
            <li key={m.id} className="px-3 py-2.5">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{firstLine(m.raw_text) || 'Mensagem sem texto'}</p>
                  <p className="text-xs text-ink-tertiary">
                    {m.group_name ?? 'Grupo removido'} · {relative(now, m.created_at)}
                  </p>
                  {m.reason && m.status !== 'dispatched' && (
                    <p className="mt-1 text-xs text-ink-secondary">{reasonLabel(m.reason)}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${STATUS_CLASS[m.status] ?? STATUS_CLASS.skipped}`}>
                  {statusLabel(m.status)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
});
SourceActivityList.displayName = 'SourceActivityList';
