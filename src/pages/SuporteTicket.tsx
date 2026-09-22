import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';
import { LoadingState } from '../components/ui/LoadingState';
import { ErrorState } from '../components/ui/ErrorState';

type Ticket = {
  id: string;
  ticket_number: number;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
};

type Message = {
  id: string;
  author_id: string | null;
  author_role: 'user' | 'support' | 'admin';
  content: string;
  created_at: string;
};

const STATUS_LABEL: Record<Ticket['status'], string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

function fmtTime(v: string) {
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function SuporteTicket() {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const bottomRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: t, error: te }, { data: msgs, error: me }] = await Promise.all([
        supabase.from('support_tickets').select('id, ticket_number, title, status').eq('id', id).single(),
        supabase.from('support_messages').select('id, author_id, author_role, content, created_at').eq('ticket_id', id).order('created_at', { ascending: true }),
      ]);
      if (te) throw te;
      if (me) throw me;
      setTicket(t);
      setMessages(msgs ?? []);
    } catch (e: any) {
      setError(e.message ?? 'Erro ao carregar ticket.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user || !reply.trim() || sending) return;
    if (ticket?.status === 'closed') return;
    setSending(true);
    const content = reply.trim();
    setReply('');
    try {
      const { error: err } = await supabase
        .from('support_messages')
        .insert({ ticket_id: id, author_id: user.id, author_role: 'user', content });
      if (err) throw err;
    } catch (e: any) {
      toast(e.message ?? 'Erro ao enviar mensagem.', 'error');
      setReply(content);
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div className="max-w-3xl mx-auto px-4 py-8"><LoadingState /></div>;
  if (error || !ticket) return <div className="max-w-3xl mx-auto px-4 py-8"><ErrorState message={error ?? 'Ticket não encontrado.'} onRetry={load} /></div>;

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6 flex-shrink-0">
        <button
          onClick={() => navigate('/suporte')}
          className="p-1.5 rounded-md text-ink-secondary hover:text-ink hover:bg-surface-1 transition-colors cursor-pointer mt-0.5"
          aria-label="Voltar"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-mono text-ink-tertiary">#{ticket.ticket_number}</span>
            <span className="text-[11px] font-semibold text-ink-secondary bg-surface-1 border border-line rounded-full px-2 py-0.5">
              {STATUS_LABEL[ticket.status]}
            </span>
          </div>
          <h1 className="text-[18px] font-semibold text-ink leading-snug">{ticket.title}</h1>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((m) => {
          const isUser = m.author_role === 'user';
          return (
            <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-xl px-4 py-3 ${isUser ? 'bg-mint-500 text-white' : 'bg-surface-1 text-ink border border-line'}`}>
                {!isUser && (
                  <p className="text-[11px] font-semibold mb-1 text-ink-secondary">Suporte Aflyo</p>
                )}
                <p className="text-[14px] leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                <p className={`text-[11px] mt-1.5 ${isUser ? 'text-white/70' : 'text-ink-tertiary'}`}>{fmtTime(m.created_at)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      {isClosed ? (
        <div className="flex items-center gap-2 py-3 px-4 bg-surface-1 border border-line rounded-xl text-sm text-ink-secondary flex-shrink-0">
          <CheckCircle2 className="w-4 h-4 text-mint-500 flex-shrink-0" />
          Este ticket foi {ticket.status === 'resolved' ? 'resolvido' : 'fechado'}. Abra um novo ticket se precisar de mais ajuda.
        </div>
      ) : (
        <form onSubmit={handleSend} className="flex gap-2 flex-shrink-0">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e as any); }
            }}
            placeholder="Digite sua mensagem... (Enter para enviar)"
            rows={3}
            maxLength={4000}
            disabled={sending}
            className="flex-1 resize-none rounded-xl border border-line bg-surface-0 px-4 py-3 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:border-mint-500 transition-colors disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sending || !reply.trim()}
            className="self-end p-3 rounded-xl bg-mint-500 text-white hover:bg-mint-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="Enviar"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      )}
    </div>
  );
}
