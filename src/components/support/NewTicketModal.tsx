import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';
import { Modal } from '../ui/Modal';
import { Input } from '../ui/Input';
import { Textarea } from '../ui/Textarea';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

export default function NewTicketModal({ open, onClose, onCreated }: Props) {
  const { user } = useUser();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTitle('');
    setMessage('');
    setSaving(false);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !message.trim()) return;
    setSaving(true);
    try {
      const { data: ticket, error: ticketErr } = await supabase
        .from('support_tickets')
        .insert({ title: title.trim(), user_id: user.id })
        .select('id')
        .single();
      if (ticketErr) throw ticketErr;

      const { error: msgErr } = await supabase
        .from('support_messages')
        .insert({ ticket_id: ticket.id, author_id: user.id, author_role: 'user', content: message.trim() });
      if (msgErr) throw msgErr;

      reset();
      onCreated(ticket.id);
    } catch (e: any) {
      toast(e.message ?? 'Erro ao criar ticket.', 'error');
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Novo ticket de suporte"
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-ink-secondary hover:text-ink hover:bg-surface-1 transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="new-ticket-form"
            disabled={saving || !title.trim() || !message.trim()}
            className="px-4 py-2 rounded-lg bg-mint-500 text-white text-sm font-semibold hover:bg-mint-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {saving ? 'Enviando...' : 'Abrir ticket'}
          </button>
        </div>
      }
    >
      <form id="new-ticket-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-ink mb-1.5">Assunto</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Descreva brevemente o problema"
            maxLength={100}
            required
            disabled={saving}
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-ink mb-1.5">Mensagem</label>
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Explique o que aconteceu com o máximo de detalhes possível"
            rows={5}
            maxLength={4000}
            required
            disabled={saving}
          />
        </div>
      </form>
    </Modal>
  );
}
