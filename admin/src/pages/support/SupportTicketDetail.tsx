import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send } from 'lucide-react';
import { callAdminApi } from '../../lib/admin-api';
import { Badge } from '../../components/ui/Badge';
import { supabase } from '../../lib/supabase';

type Ticket = {
  id: string;
  ticket_number: number;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  profiles: { id: string; full_name: string | null; email: string; avatar_url: string | null } | null;
};

type Message = {
  id: string;
  author_id: string | null;
  author_role: 'user' | 'support' | 'admin';
  content: string;
  created_at: string;
};

type Detail = { ticket: Ticket; messages: Message[] };

const STATUS_OPTIONS = [
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'closed', label: 'Fechado' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

const PRIORITY_TONE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  urgent: 'danger',
  high: 'warning',
  normal: 'neutral',
  low: 'neutral',
};

function fmtTime(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SupportTicketDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [updatingPriority, setUpdatingPriority] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await callAdminApi<Detail>('support', 'get', { ticketId: id });
      setDetail(data);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar ticket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`admin-ticket:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `ticket_id=eq.${id}`,
      }, (payload) => {
        const m = payload.new as Message;
        setDetail((d) =>
          d ? { ...d, messages: d.messages.some((x) => x.id === m.id) ? d.messages : [...d.messages, m] } : d
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  const handleStatusChange = async (status: string) => {
    if (!id || updatingStatus) return;
    setUpdatingStatus(true);
    try {
      await callAdminApi('support', 'status-update', { ticketId: id, status });
      setDetail((d) => d ? { ...d, ticket: { ...d.ticket, status } } : d);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handlePriorityChange = async (priority: string) => {
    if (!id || updatingPriority) return;
    setUpdatingPriority(true);
    try {
      await callAdminApi('support', 'priority-update', { ticketId: id, priority });
      setDetail((d) => d ? { ...d, ticket: { ...d.ticket, priority } } : d);
    } finally {
      setUpdatingPriority(false);
    }
  };

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !reply.trim() || sending) return;
    setSending(true);
    const content = reply.trim();
    setReply('');
    try {
      const msg = await callAdminApi<Message>('support', 'reply', { ticketId: id, content });
      setDetail((d) => d ? { ...d, messages: [...d.messages, msg] } : d);
    } catch (e: any) {
      setReply(content);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="p-6 text-sm text-ink-secondary">Carregando...</div>;
  if (error || !detail) return (
    <div className="p-6">
      <p className="text-sm text-danger-ink mb-3">{error ?? 'Ticket nao encontrado.'}</p>
      <button onClick={load} className="text-sm underline cursor-pointer">Tentar novamente</button>
    </div>
  );

  const { ticket, messages } = detail;

  return (
    <div className="p-6 max-w-4xl flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6 flex-shrink-0">
        <button
          onClick={() => navigate('/support')}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink hover:bg-surface-1 transition-colors cursor-pointer mt-0.5"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-[11px] text-ink-tertiary">#{ticket.ticket_number}</span>
            <Badge tone={PRIORITY_TONE[ticket.priority] ?? 'neutral'}>
              {PRIORITY_OPTIONS.find((p) => p.value === ticket.priority)?.label ?? ticket.priority}
            </Badge>
          </div>
          <h1 className="text-lg font-bold text-ink leading-snug">{ticket.title}</h1>
          {ticket.profiles && (
            <p className="text-sm text-ink-secondary mt-0.5">
              {ticket.profiles.full_name ?? ticket.profiles.email} &middot; {ticket.profiles.email}
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={ticket.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            disabled={updatingStatus}
            className="text-sm border border-line rounded-lg px-3 py-1.5 bg-surface-0 text-ink cursor-pointer disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select
            value={ticket.priority}
            onChange={(e) => handlePriorityChange(e.target.value)}
            disabled={updatingPriority}
            className="text-sm border border-line rounded-lg px-3 py-1.5 bg-surface-0 text-ink cursor-pointer disabled:opacity-60"
          >
            {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((m) => {
          const isUser = m.author_role === 'user';
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-start' : 'justify-end'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-3 ${isUser ? 'bg-surface-1 text-ink border border-line' : 'bg-mint-500 text-white'}`}>
                {isUser && (
                  <p className="text-[11px] font-semibold mb-1 text-ink-secondary">
                    {ticket.profiles?.full_name ?? ticket.profiles?.email ?? 'Usuario'}
                  </p>
                )}
                {!isUser && (
                  <p className="text-[11px] font-semibold mb-1 text-white/70">Suporte (voce)</p>
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[11px] mt-1.5 ${isUser ? 'text-ink-tertiary' : 'text-white/70'}`}>{fmtTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply */}
      <form onSubmit={handleReply} className="flex gap-2 flex-shrink-0">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleReply(e as any); }
          }}
          placeholder="Responder ao usuario... (Enter para enviar)"
          rows={3}
          maxLength={4000}
          disabled={sending}
          className="flex-1 resize-none rounded-xl border border-line bg-surface-0 px-4 py-3 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-mint-500 transition-colors disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={sending || !reply.trim()}
          className="self-end p-3 rounded-xl bg-mint-500 text-white hover:bg-mint-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
