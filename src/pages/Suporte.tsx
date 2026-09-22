import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Plus, Clock, CheckCircle2, AlertCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorState } from '../components/ui/ErrorState';
import { LoadingState } from '../components/ui/LoadingState';
import { PageHeader } from '../components/ui/PageHeader';
import NewTicketModal from '../components/support/NewTicketModal';

type Ticket = {
  id: string;
  ticket_number: number;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  created_at: string;
  last_message_at: string;
};

const STATUS_LABEL: Record<Ticket['status'], string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const STATUS_ICON: Record<Ticket['status'], React.ReactNode> = {
  open: <Clock className="w-3.5 h-3.5" />,
  in_progress: <AlertCircle className="w-3.5 h-3.5" />,
  resolved: <CheckCircle2 className="w-3.5 h-3.5" />,
  closed: <XCircle className="w-3.5 h-3.5" />,
};

const STATUS_CLASS: Record<Ticket['status'], string> = {
  open: 'bg-info-bg text-info-ink border-info/20',
  in_progress: 'bg-warning-bg text-warning-ink border-warning/20',
  resolved: 'bg-ice text-mint-800 border-mint-200',
  closed: 'bg-surface-1 text-ink-secondary border-line',
};

function fmtDate(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('pt-BR');
}

export default function Suporte() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('support_tickets')
        .select('id, ticket_number, title, status, priority, created_at, last_message_at')
        .order('last_message_at', { ascending: false });
      if (err) throw err;
      setTickets(data ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar tickets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [user]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <PageHeader
        title="Suporte"
        description="Acompanhe e abra tickets com nossa equipe."
      >
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-mint-500 text-white text-sm font-semibold hover:bg-mint-600 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Novo ticket
        </button>
      </PageHeader>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} onRetry={load} />}
      {!loading && !error && tickets.length === 0 && (
        <EmptyState
          icon={LifeBuoy}
          title="Nenhum ticket ainda"
          description="Abra um ticket quando precisar de ajuda. Nossa equipe responde em breve."
        />
      )}

      {!loading && !error && tickets.length > 0 && (
        <div className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-surface-0">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/suporte/${t.id}`)}
              className="w-full flex items-start gap-3 px-5 py-4 hover:bg-surface-1 transition-colors text-left cursor-pointer"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-mono text-ink-tertiary">#{t.ticket_number}</span>
                  <span
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold border rounded-full px-2 py-0.5 ${STATUS_CLASS[t.status]}`}
                  >
                    {STATUS_ICON[t.status]}
                    {STATUS_LABEL[t.status]}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-ink truncate">{t.title}</p>
                <p className="text-[12px] text-ink-tertiary mt-0.5">Atualizado em {fmtDate(t.last_message_at)}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <NewTicketModal
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(id) => {
          setShowNew(false);
          navigate(`/suporte/${id}`);
        }}
      />
    </div>
  );
}
