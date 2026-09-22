import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { callAdminApi } from '../../lib/admin-api';
import { Badge } from '../../components/ui/Badge';

type TicketRow = {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  last_message_at: string;
  profiles: { full_name: string | null; email: string } | null;
};

const STATUS_TABS = ['all', 'open', 'in_progress', 'resolved', 'closed'] as const;
const STATUS_LABEL: Record<string, string> = {
  all: 'Todos',
  open: 'Abertos',
  in_progress: 'Em andamento',
  resolved: 'Resolvidos',
  closed: 'Fechados',
};

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'neutral',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgente',
  high: 'Alta',
  normal: 'Normal',
  low: 'Baixa',
};

function fmtDate(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function SupportQueue() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? 'all') as string;
  const page = Math.max(1, Number(params.get('page')) || 1);

  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await callAdminApi<TicketRow[]>('support', 'list', { status, page, pageSize: 25 });
      setRows(data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar fila.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [status, page]);

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink">Fila de suporte</h1>
        <p className="text-sm text-ink-secondary mt-1">Tickets enviados pelos usuarios.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-line">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setParams({ status: s, page: '1' })}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              status === s
                ? 'border-mint-500 text-ink'
                : 'border-transparent text-ink-secondary hover:text-ink'
            }`}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-ink-secondary py-8 text-center">Carregando...</p>}
      {!loading && error && (
        <div className="py-8 text-center">
          <p className="text-sm text-danger-ink mb-3">{error}</p>
          <button onClick={load} className="text-sm text-ink-secondary hover:text-ink underline cursor-pointer">Tentar novamente</button>
        </div>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm text-ink-secondary py-8 text-center">Nenhum ticket encontrado.</p>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="border border-line rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-1 border-b border-line">
              <tr>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-ink-secondary uppercase tracking-wide">#</th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-ink-secondary uppercase tracking-wide">Assunto</th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-ink-secondary uppercase tracking-wide">Prioridade</th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-ink-secondary uppercase tracking-wide">Usuario</th>
                <th className="text-left px-4 py-3 text-[12px] font-semibold text-ink-secondary uppercase tracking-wide">Atualizado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/support/${r.id}`)}
                  className="hover:bg-surface-1 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-ink-tertiary text-[12px]">#{r.ticket_number}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink truncate max-w-xs">{r.title}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={PRIORITY_TONE[r.priority] ?? 'neutral'}>{PRIORITY_LABEL[r.priority] ?? r.priority}</Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-secondary truncate max-w-[160px]">
                    {r.profiles?.full_name ?? r.profiles?.email ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-ink-secondary">{fmtDate(r.last_message_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {!loading && rows.length === 25 && (
        <div className="flex justify-end mt-4 gap-2">
          {page > 1 && (
            <button onClick={() => setParams({ status, page: String(page - 1) })} className="px-3 py-1.5 text-sm border border-line rounded-lg hover:bg-surface-1 cursor-pointer">Anterior</button>
          )}
          <button onClick={() => setParams({ status, page: String(page + 1) })} className="px-3 py-1.5 text-sm border border-line rounded-lg hover:bg-surface-1 cursor-pointer">Proxima</button>
        </div>
      )}
    </div>
  );
}
