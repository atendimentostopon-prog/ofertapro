import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, Send, Trash2, X } from 'lucide-react';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { useAssistant } from '../../hooks/useAssistant';
import { buildTicketTranscript } from '../../services/AssistantService';
import type { AssistantErrorCode } from '../../services/AssistantService';
import NewTicketModal from '../support/NewTicketModal';
import { LyoMascot } from './LyoMascot';

const SUGGESTIONS = [
  'Como conecto meu WhatsApp?',
  'Por que meu disparo falhou?',
  'Qual a diferença entre os planos?',
];

const ERROR_TEXT: Record<AssistantErrorCode, string> = {
  quota_exceeded: 'Suas perguntas de hoje acabaram. Elas renovam à meia-noite, ou você pode mudar de plano.',
  assistant_unavailable: 'Não consegui responder agora. Tente de novo em instantes.',
  invalid_message: 'Escreva uma pergunta de até 1000 caracteres.',
  unknown: 'Algo deu errado. Tente de novo.',
};

/** Botão flutuante do assistente Lyo e o painel de conversa. */
const AssistantWidget: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [ticketOpen, setTicketOpen] = useState(false);
  const { messages, loaded, sending, error, remaining, send, clear } = useAssistant(user?.id, open);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !ticketOpen) setOpen(false); };
    const onPointer = (event: PointerEvent) => {
      // O modal de ticket fica fora do painel; clicar nele não fecha o Lyo.
      if (ticketOpen) return;
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, [open, ticketOpen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, sending, error]);

  if (!user) return null;

  const quotaOut = error === 'quota_exceeded';

  const submit = async (text: string) => {
    if (!text.trim() || sending || quotaOut) return;
    setDraft('');
    const ok = await send(text);
    if (!ok) setDraft(text);
  };

  return (
    <div ref={rootRef}>
      {open && (
        <div
          role="dialog"
          aria-label="Lyo, assistente do Aflyo"
          className="fixed inset-0 z-50 flex flex-col bg-surface-0 animate-scale-in sm:inset-auto sm:bottom-24 sm:right-6 sm:h-[34rem] sm:max-h-[calc(100vh-8rem)] sm:w-[24rem] sm:origin-bottom-right sm:rounded-2xl sm:border sm:border-line sm:shadow-lg"
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <LyoMascot className="h-9 w-9 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm font-bold leading-tight text-ink">Lyo</p>
              <p className="text-[11px] text-ink-secondary">Assistente do Aflyo</p>
            </div>
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clear}
                aria-label="Limpar conversa"
                className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-1 hover:text-ink cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
              className="flex h-8 w-8 items-center justify-center rounded-full text-ink-secondary transition-colors hover:bg-surface-1 hover:text-ink cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
            {loaded && messages.length === 0 && (
              <div className="space-y-3">
                <p className="text-[13px] leading-relaxed text-ink-secondary">
                  Oi! Eu sou o Lyo. Posso te ajudar a usar o Aflyo e entender o que está acontecendo na sua conta.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      disabled={sending || quotaOut}
                      className="rounded-full border border-line bg-surface-0 px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-surface-1 disabled:opacity-50 cursor-pointer"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-mint-500 px-3.5 py-2.5 text-[13px] text-graphite'
                    : 'mr-auto max-w-[85%] rounded-2xl rounded-bl-sm bg-surface-1 px-3.5 py-2.5 text-[13px] text-ink'
                }
              >
                <p className="whitespace-pre-wrap break-words">{m.content}</p>
              </div>
            ))}

            {sending && <p className="text-xs text-ink-secondary">Lyo está digitando...</p>}

            {error && (
              <div role="alert" className="rounded-xl border border-line bg-surface-1 px-3.5 py-2.5 text-xs text-ink-secondary">
                {ERROR_TEXT[error]}
                {quotaOut && (
                  <button
                    type="button"
                    onClick={() => { setOpen(false); navigate('/pricing'); }}
                    className="mt-2 block font-semibold text-ink underline cursor-pointer"
                  >
                    Ver planos
                  </button>
                )}
              </div>
            )}
          </div>

          <footer className="border-t border-line px-3 pb-3 pt-2">
            <div className="mb-2 flex items-center justify-between gap-2 px-1 text-[11px] text-ink-secondary">
              <span>
                {remaining !== null ? `${remaining} perguntas restantes hoje` : 'Respostas geradas por IA podem conter erros'}
              </span>
              <button
                type="button"
                onClick={() => setTicketOpen(true)}
                className="inline-flex flex-shrink-0 items-center gap-1 font-semibold text-ink hover:underline cursor-pointer"
              >
                <LifeBuoy className="h-3.5 w-3.5" />
                Falar com o time
              </button>
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); submit(draft); }}
              className="flex items-end gap-2"
            >
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(draft); }
                }}
                rows={1}
                maxLength={1000}
                disabled={quotaOut}
                aria-label="Sua pergunta"
                placeholder="Pergunte sobre o Aflyo"
                className="max-h-28 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-line bg-surface-0 px-3 py-2 text-[13px] text-ink placeholder:text-ink-secondary focus:outline-none focus:ring-2 focus:ring-mint-500 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending || quotaOut}
                aria-label="Enviar"
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-mint-500 text-graphite transition-colors hover:bg-mint-600 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                <Send className="h-4 w-4" />
              </button>
            </form>
          </footer>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Abrir o Lyo, assistente do Aflyo"
        className={`group fixed bottom-6 right-6 z-50 h-14 w-14 items-center justify-center rounded-full bg-graphite shadow-lg ring-1 ring-white/15 transition-transform hover:scale-105 active:scale-95 cursor-pointer ${open ? 'hidden sm:flex' : 'flex'}`}
      >
        <LyoMascot className="h-10 w-10" />
        <span className="pointer-events-none absolute right-16 whitespace-nowrap rounded-md border border-graphite-700 bg-graphite px-2.5 py-1.5 text-[11px] font-semibold tracking-tight text-ink-inverse opacity-0 shadow-md transition-opacity duration-200 group-hover:opacity-100">
          Dúvidas? Fale com o Lyo
        </span>
      </button>

      {ticketOpen && (
        <NewTicketModal
          open
          initialTitle="Conversa com o Lyo"
          initialMessage={buildTicketTranscript(messages)}
          onClose={() => setTicketOpen(false)}
          onCreated={(id) => {
            setTicketOpen(false);
            setOpen(false);
            toast('Ticket aberto. O time responde por aqui.', 'success');
            navigate(`/suporte/${id}`);
          }}
        />
      )}
    </div>
  );
};

export default AssistantWidget;
