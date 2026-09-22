import type { Handler } from '../index.ts';
import { serviceClient } from '../_lib.ts';
import { RbacError } from '../rbac.ts';

function reqTicketId(params: Record<string, unknown>): string {
  const v = params.ticketId;
  if (typeof v !== 'string' || !v.trim()) throw new RbacError('validation', 'ticketId e obrigatorio.');
  return v.trim();
}

export const list: Handler = async (params) => {
  const svc = serviceClient();
  let query = svc
    .from('support_tickets')
    .select(`
      id, ticket_number, title, status, priority, created_at, last_message_at,
      profiles!support_tickets_user_id_fkey(full_name, email)
    `)
    .order('last_message_at', { ascending: false });

  if (typeof params.status === 'string' && params.status !== 'all') {
    query = query.eq('status', params.status);
  }

  const page = Number(params.page) || 1;
  const pageSize = Number(params.pageSize) || 25;
  query = query.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
};

export const get: Handler = async (params) => {
  const ticketId = reqTicketId(params);
  const svc = serviceClient();

  const [ticketRes, messagesRes] = await Promise.all([
    svc.from('support_tickets')
      .select(`id, ticket_number, title, status, priority, created_at, updated_at, last_message_at,
        profiles!support_tickets_user_id_fkey(id, full_name, email, avatar_url)`)
      .eq('id', ticketId)
      .single(),
    svc.from('support_messages')
      .select('id, author_id, author_role, content, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true }),
  ]);

  if (ticketRes.error) throw new Error(ticketRes.error.message);
  if (!ticketRes.data) throw new RbacError('not_found', 'Ticket nao encontrado.');

  return { ticket: ticketRes.data, messages: messagesRes.data ?? [] };
};

export const reply: Handler = async (params, identity) => {
  const ticketId = reqTicketId(params);
  const content = typeof params.content === 'string' ? params.content.trim() : '';
  if (!content) throw new RbacError('validation', 'content e obrigatorio.');

  const svc = serviceClient();
  const { data, error } = await svc
    .from('support_messages')
    .insert({ ticket_id: ticketId, author_id: identity.adminId, author_role: 'support', content })
    .select('id, author_id, author_role, content, created_at')
    .single();

  if (error) throw new Error(error.message);

  // If ticket is still 'open', advance to 'in_progress'
  await svc
    .from('support_tickets')
    .update({ status: 'in_progress' })
    .eq('id', ticketId)
    .eq('status', 'open');

  return data;
};

export const statusUpdate: Handler = async (params) => {
  const ticketId = reqTicketId(params);
  const status = params.status;
  const allowed = ['open', 'in_progress', 'resolved', 'closed'];
  if (typeof status !== 'string' || !allowed.includes(status)) {
    throw new RbacError('validation', 'status invalido.');
  }

  const svc = serviceClient();
  const update: Record<string, unknown> = { status };
  if (status === 'resolved') update.resolved_at = new Date().toISOString();

  const { data, error } = await svc
    .from('support_tickets')
    .update(update)
    .eq('id', ticketId)
    .select('id, status, resolved_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const priorityUpdate: Handler = async (params) => {
  const ticketId = reqTicketId(params);
  const priority = params.priority;
  const allowed = ['low', 'normal', 'high', 'urgent'];
  if (typeof priority !== 'string' || !allowed.includes(priority)) {
    throw new RbacError('validation', 'priority invalido.');
  }

  const svc = serviceClient();
  const { data, error } = await svc
    .from('support_tickets')
    .update({ priority })
    .eq('id', ticketId)
    .select('id, priority')
    .single();
  if (error) throw new Error(error.message);
  return data;
};
