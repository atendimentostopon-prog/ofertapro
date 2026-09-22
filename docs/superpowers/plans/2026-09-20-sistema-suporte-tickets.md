# Sistema de Suporte com Tickets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Feedbacks feature with a full support ticket system — numbered tickets, chat interface, email notifications via Resend, and an admin queue.

**Architecture:** Supabase tables `support_tickets` + `support_messages` with RLS; user app pages at `/suporte` and `/suporte/:id` with Realtime subscriptions; admin-api Edge Function handler for admin queue at `/support` and `/support/:id`; two new Resend email templates; existing `send-email` Edge Function called directly from both user and admin frontends.

**Tech Stack:** React + TypeScript (user app), React + TypeScript (admin app), Supabase (Postgres + RLS + Realtime), Deno/TypeScript (Edge Functions), Resend (email), Vercel (hosting), lucide-react (icons), react-router-dom.

## Global Constraints

- All user-facing copy in pt-BR; no em dash (—) in product copy; use parentheses or comma instead
- Ticket number formatted as `#${String(ticket_number).padStart(4, '0')}`
- Status values: `open`, `in_progress`, `resolved`, `closed` (snake_case in DB, display labels in pt-BR)
- `author_role` values: `user`, `support`, `admin`
- No attachments, no SLA, no assigned_to UI (column exists but no screen)
- Admin handler uses `serviceClient()` from `../_lib.ts` — same pattern as all other handlers
- Admin pages use `callAdminApi<T>(resource, action, params)` from `../../lib/admin-api`
- `RequirePermission` wraps every protected admin route
- New templates must be added to `TEMPLATE_NAMES` array in `subjects.ts` before they can be used
- User app send-email call: `supabase.functions.invoke('send-email', { body: {...} })`
- Admin app send-email call: same pattern via admin's supabase client

---

### Task 1: DB Migration

**Files:**
- Create: `supabase/migrations/20260920000000_support_tickets.sql`

**Interfaces:**
- Produces: tables `support_tickets` and `support_messages`, sequence `support_ticket_seq`, trigger `trg_ticket_on_message`, RLS policies

- [ ] **Step 1: Write the migration file**

```sql
-- supabase/migrations/20260920000000_support_tickets.sql

CREATE SEQUENCE IF NOT EXISTS support_ticket_seq START 1;

CREATE TABLE IF NOT EXISTS support_tickets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number   BIGINT NOT NULL DEFAULT nextval('support_ticket_seq'),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL CHECK (char_length(title) <= 100),
  status          TEXT NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','in_progress','resolved','closed')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to     UUID REFERENCES auth.users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  resolved_at     TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_number_idx ON support_tickets(ticket_number);
CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets(user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('user','support','admin')),
  content     TEXT NOT NULL CHECK (char_length(content) <= 4000),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages(ticket_id, created_at);

-- Trigger: keep updated_at and last_message_at in sync
CREATE OR REPLACE FUNCTION update_ticket_on_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE support_tickets
  SET updated_at = now(), last_message_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_on_message ON support_messages;
CREATE TRIGGER trg_ticket_on_message
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION update_ticket_on_message();

-- RLS
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Users see and manage their own tickets
CREATE POLICY "user_own_tickets" ON support_tickets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users read messages on their tickets
CREATE POLICY "user_read_own_ticket_messages" ON support_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );

-- Users insert messages on their own tickets (only as 'user')
CREATE POLICY "user_insert_own_ticket_messages" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'user' AND
    ticket_id IN (SELECT id FROM support_tickets WHERE user_id = auth.uid())
  );
```

- [ ] **Step 2: Verify the SQL parses correctly (dry-run)**

Read the file back and check for syntax issues (no tool needed — visual scan).

- [ ] **Step 3: Apply migration via Supabase MCP**

This happens in Task 7 (Deploy). The file must exist before deployment.

---

### Task 2: Email Templates

**Files:**
- Modify: `supabase/functions/_shared/emails/subjects.ts`
- Modify: `supabase/functions/_shared/emails/templates.ts`

**Interfaces:**
- Consumes: existing `TEMPLATE_NAMES as const`, `SUBJECTS Record`, `PLACEHOLDER_KEYS as const`
- Produces: two new template names `ticket-aberto` and `resposta-suporte`, their subjects, HTML bodies, and new placeholder keys `TICKET_NUMBER`, `TICKET_TITLE`, `TICKET_URL`, `REPLY_PREVIEW`

- [ ] **Step 1: Update subjects.ts**

Replace the entire file content:

```typescript
export const TEMPLATE_NAMES = [
  "confirmacao-conta",
  "boas-vindas",
  "recuperacao-senha",
  "trial-acabando",
  "trial-expirado",
  "assinatura-confirmada",
  "falha-pagamento",
  "cancelamento",
  "ticket-aberto",
  "resposta-suporte",
] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];

export const SUBJECTS: Record<TemplateName, string> = {
  "confirmacao-conta": "Confirme seu email para ativar sua conta",
  "boas-vindas": "Bem-vindo(a) à Aflyo",
  "recuperacao-senha": "Redefinir sua senha",
  "trial-acabando": "Seu teste grátis está acabando",
  "trial-expirado": "Sua conta Aflyo foi pausada",
  "assinatura-confirmada": "Assinatura confirmada",
  "falha-pagamento": "Não conseguimos processar seu pagamento",
  "cancelamento": "Sua assinatura foi cancelada",
  "ticket-aberto": "Ticket #{{TICKET_NUMBER}} aberto com sucesso",
  "resposta-suporte": "Você tem uma nova resposta no ticket #{{TICKET_NUMBER}}",
};

export const PLACEHOLDER_KEYS = [
  "APP_URL", "SUPPORT_URL", "PREFERENCES_URL", "UNSUBSCRIBE_URL",
  "USER_NAME", "USER_EMAIL", "CONFIRMATION_URL",
  "PLAN_NAME", "AMOUNT", "NEXT_BILLING_DATE", "ACCESS_UNTIL_DATE", "DAYS_LEFT",
  "TICKET_NUMBER", "TICKET_TITLE", "TICKET_URL", "REPLY_PREVIEW",
] as const;

export function isTemplateName(v: unknown): v is TemplateName {
  return typeof v === "string" && (TEMPLATE_NAMES as readonly string[]).includes(v);
}
```

- [ ] **Step 2: Add template HTML to templates.ts**

Append at the END of `supabase/functions/_shared/emails/templates.ts`, before the `export const TEMPLATES` map, two new template strings and their entries in the map.

First, read the end of templates.ts to find the `export const TEMPLATES` map and append there.

The two HTML templates follow the same brand style as existing templates (white card, Space Grotesk headings, Inter body, mint accent `#5EE7A5`/`#DFF8EE`, CTA button `#101418`):

```typescript
// === ADD these two constants near the top of templates.ts, alongside the others ===

const ticketAberto = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aflyo</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr><td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td></tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">TICKET ABERTO</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">Seu ticket foi aberto, {{USER_NAME}}</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Recebemos sua solicitação e nossa equipe de suporte responderá em breve.</p>
</div>
<div style="text-align:left;width:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;border-radius:14px;margin:4px 0 20px 0;">
<tr><td style="padding:18px 22px;">
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-bottom:3px;">Número do ticket</span>
<span style="display:block;font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:18px;color:#101418;">#{{TICKET_NUMBER}}</span>
<span style="display:block;font-family:'Inter',sans-serif;font-size:12px;color:#6B7280;margin-top:14px;margin-bottom:3px;">Assunto</span>
<span style="display:block;font-family:'Inter',sans-serif;font-size:14px;font-weight:600;color:#101418;">{{TICKET_TITLE}}</span>
</td></tr>
</table>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{TICKET_URL}}" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Ver meu ticket</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 40px;" align="center">
<p style="margin:0;font-family:'Inter',sans-serif;font-size:12px;line-height:1.6;color:#9CA3AF;">Você recebeu este email porque abriu um ticket de suporte na Aflyo.<br>
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;">Preferências de email</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

const respostaSupporte = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aflyo</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600;700&display=swap');</style>
</head>
<body style="margin:0;padding:0;background-color:#F6F7F9;font-family:'Inter',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;padding:40px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #ECEDF2;">
<tr><td style="padding:32px 40px 24px 40px;border-bottom:1px solid #F0F1F5;" align="center">
<img src="https://app.aflyo.com.br/brand/logo-primary.png" width="130" alt="Aflyo" style="display:block;height:auto;border:0;">
</td></tr>
<tr><td style="padding:36px 40px 8px 40px;" align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px 0;">
<tr><td style="background-color:#DFF8EE;border-radius:999px;padding:6px 14px 6px 10px;">
<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background-color:#5EE7A5;margin-right:7px;"></span>
<span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;color:#101418;letter-spacing:0.2px;">NOVA RESPOSTA</span>
</td></tr>
</table>
<div style="text-align:left;width:100%;"><h1 style="margin:0 0 16px 0;font-family:'Space Grotesk',Helvetica,Arial,sans-serif;font-weight:700;font-size:24px;line-height:1.25;color:#101418;">O suporte respondeu seu ticket</h1></div>
<div style="text-align:left;width:100%;">
<p style="margin:0 0 14px 0;font-family:'Inter',sans-serif;font-size:15px;line-height:1.6;color:#6B7280;">Você recebeu uma nova resposta no ticket <strong style="color:#101418;">#{{TICKET_NUMBER}} — {{TICKET_TITLE}}</strong>.</p>
</div>
<div style="text-align:left;width:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F6F7F9;border-radius:14px;border-left:3px solid #5EE7A5;margin:4px 0 20px 0;">
<tr><td style="padding:16px 20px;">
<p style="margin:0;font-family:'Inter',sans-serif;font-size:14px;line-height:1.6;color:#374151;">{{REPLY_PREVIEW}}</p>
</td></tr>
</table>
</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 4px auto;">
<tr><td style="border-radius:10px;background-color:#101418;">
<a href="{{TICKET_URL}}" style="display:inline-block;padding:14px 30px;font-family:'Inter',sans-serif;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;border:1px solid #101418;">Ver resposta</a>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 40px;" align="center">
<p style="margin:0;font-family:'Inter',sans-serif;font-size:12px;line-height:1.6;color:#9CA3AF;">Você recebeu este email porque tem um ticket de suporte aberto na Aflyo.<br>
<a href="{{PREFERENCES_URL}}" style="color:#6B7280;">Preferências de email</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

// === In the TEMPLATES map, add the two new entries: ===
// "ticket-aberto": ticketAberto,
// "resposta-suporte": respostaSupporte,
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd supabase/functions && deno check _shared/emails/subjects.ts`

Expected: no errors. If deno not available, skip — CI will catch it.

---

### Task 3: Remove Feedbacks + User Nav Update

**Files:**
- Modify: `src/config/features.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `FEATURES.feedback` (currently `true`)
- Produces: `FEATURES.feedback = false`, Sidebar shows "Suporte" instead of "Feedbacks", App routes `/suporte` and `/suporte/:id`, `isPublicRoute` guards `/suporte`

- [ ] **Step 1: Disable feedback flag**

In `src/config/features.ts`, change line 8:
```typescript
// BEFORE:
feedback: true,      // Habilita o sistema de feedbacks e logs do beta
// AFTER:
feedback: false,     // Substituido pelo sistema de suporte (tickets)
```

- [ ] **Step 2: Update Sidebar navItems**

In `src/components/Sidebar.tsx`:

1. Add `LifeBuoy` to the lucide-react import (replace `MessageSquare` with `LifeBuoy` — MessageSquare is unused after this):
```typescript
// BEFORE:
import {
  LayoutDashboard, Package, Radio, History, Settings,
  ChevronRight, LogOut, ExternalLink, MessageSquare, X, CreditCard, Plug
} from 'lucide-react';
// AFTER:
import {
  LayoutDashboard, Package, Radio, History, Settings,
  ChevronRight, LogOut, ExternalLink, LifeBuoy, X, CreditCard, Plug
} from 'lucide-react';
```

2. Replace the feedback conditional with a static Suporte item:
```typescript
// BEFORE:
  ...(FEATURES.feedback ? [{ to: '/feedbacks', icon: MessageSquare, label: 'Feedbacks' }] : []),
// AFTER:
  { to: '/suporte', icon: LifeBuoy, label: 'Suporte' },
```

3. Remove the `FEATURES` import since it's no longer used in Sidebar:
```typescript
// BEFORE:
import { FEATURES } from '../config/features';
// AFTER: (delete this line)
```

- [ ] **Step 3: Update App.tsx**

In `src/App.tsx`:

1. Remove Feedbacks import and add Suporte imports:
```typescript
// REMOVE:
import Feedbacks from './pages/Feedbacks';
// ADD (after other page imports):
import Suporte from './pages/Suporte';
import SuporteTicket from './pages/SuporteTicket';
```

2. Update `isPublicRoute` to guard `/suporte`:
```typescript
// BEFORE:
const privatePaths = ['/dashboard', '/offers', '/channels', '/integrations', '/history', '/settings', '/feedbacks'];
// AFTER:
const privatePaths = ['/dashboard', '/offers', '/channels', '/integrations', '/history', '/settings', '/suporte'];
```

3. Replace the `/feedbacks` route with `/suporte` routes inside the protected `<Route>` block:
```typescript
// REMOVE:
<Route path="/feedbacks" element={<Feedbacks />} />
// ADD:
<Route path="/suporte" element={<Suporte />} />
<Route path="/suporte/:id" element={<SuporteTicket />} />
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit` in `D:/ofertapro`
Expected: no new errors introduced by these changes.

---

### Task 4: User App Pages

**Files:**
- Create: `src/pages/Suporte.tsx`
- Create: `src/components/support/NewTicketModal.tsx`
- Create: `src/pages/SuporteTicket.tsx`

**Interfaces:**
- Consumes: `supabase` from `../lib/supabase`, `useUser` from `../context/UserContext`, `useToast` from `../context/ToastContext`, `useNavigate`, `useParams` from `react-router-dom`
- Produces: `/suporte` page (ticket list + open-ticket modal), `/suporte/:id` page (chat + realtime)

- [ ] **Step 1: Create `src/pages/Suporte.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, ChevronRight, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import NewTicketModal from '../components/support/NewTicketModal';

type Ticket = {
  id: string;
  ticket_number: number;
  title: string;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  last_message_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-info-bg text-info-ink border-info/20',
  in_progress: 'bg-warning-bg text-warning-ink border-warning/20',
  resolved: 'bg-ice text-mint-800 border-mint-200',
  closed: 'bg-surface-1 text-ink-secondary border-line',
};

function formatTicketNumber(n: number) {
  return `#${String(n).padStart(4, '0')}`;
}

const Suporte: React.FC = () => {
  const { user } = useUser();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const loadTickets = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from('support_tickets')
      .select('id, ticket_number, title, status, created_at, last_message_at')
      .order('last_message_at', { ascending: false });
    if (data) setTickets(data as Ticket[]);
    setLoading(false);
  };

  useEffect(() => { loadTickets(); }, [user]);

  if (!user) return null;

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink tracking-tight font-display">Suporte</h1>
          <p className="text-[15px] font-medium text-ink-secondary mt-1">
            Abra um ticket para falar com nossa equipe de suporte.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="btn-gradient px-4 py-2 text-sm font-bold rounded-lg"
        >
          Abrir ticket
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-10 h-10 border-4 border-line border-t-mint-500 rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-0 rounded-2xl border border-line p-6 text-center space-y-4 shadow-xs">
          <div className="w-12 h-12 rounded-xl bg-surface-1 border border-line flex items-center justify-center text-ink-tertiary">
            <LifeBuoy className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-ink font-bold text-base tracking-tight font-display">Nenhum ticket ainda</h3>
            <p className="text-xs text-ink-secondary max-w-xs mx-auto leading-relaxed mt-1">
              Abra um ticket para falar com o suporte sobre qualquer problema ou dúvida.
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-gradient text-xs px-4 py-2 rounded-md font-bold">
            Abrir ticket
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => navigate(`/suporte/${t.id}`)}
              className="w-full text-left bg-surface-0 rounded-2xl border border-line p-4 hover:border-line-strong hover:shadow-md transition-all duration-220 flex items-center gap-4 group shadow-xs"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-surface-1 border border-line flex items-center justify-center">
                <span className="text-xs font-bold text-ink-secondary tabular-nums">{formatTicketNumber(t.ticket_number)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${STATUS_CLASS[t.status] || STATUS_CLASS.open}`}>
                    {STATUS_LABEL[t.status] || t.status}
                  </span>
                </div>
                <p className="text-[14px] font-semibold text-ink truncate">{t.title}</p>
                <div className="flex items-center gap-1 mt-0.5 text-[11px] text-ink-tertiary">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(t.last_message_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-tertiary group-hover:text-ink-secondary flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {showModal && (
        <NewTicketModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => { setShowModal(false); navigate(`/suporte/${id}`); }}
        />
      )}
    </div>
  );
};

export default Suporte;
```

- [ ] **Step 2: Create `src/components/support/NewTicketModal.tsx`**

```typescript
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { useToast } from '../../context/ToastContext';

interface Props {
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

const NewTicketModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const { user } = useUser();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !title.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      // Create ticket
      const { data: ticket, error: ticketErr } = await supabase
        .from('support_tickets')
        .insert({ user_id: user.id, title: title.trim() })
        .select('id, ticket_number')
        .single();
      if (ticketErr || !ticket) throw ticketErr ?? new Error('Falha ao criar ticket');

      // Insert first message
      const { error: msgErr } = await supabase
        .from('support_messages')
        .insert({ ticket_id: ticket.id, author_id: user.id, author_role: 'user', content: message.trim() });
      if (msgErr) throw msgErr;

      // Send confirmation email (best effort)
      const ticketNumber = String(ticket.ticket_number).padStart(4, '0');
      const ticketUrl = `${window.location.origin}/suporte/${ticket.id}`;
      supabase.functions.invoke('send-email', {
        body: {
          template: 'ticket-aberto',
          to: user.email,
          variables: {
            USER_NAME: user.preferred_name || user.full_name || 'Usuário',
            USER_EMAIL: user.email,
            TICKET_NUMBER: ticketNumber,
            TICKET_TITLE: title.trim(),
            TICKET_URL: ticketUrl,
          },
        },
      }).catch(() => {});

      toast('Ticket aberto com sucesso!', 'success');
      onCreated(ticket.id);
    } catch (err: any) {
      toast(err?.message || 'Erro ao abrir ticket. Tente novamente.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-0 rounded-2xl border border-line shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-line">
          <h2 className="text-base font-bold text-ink font-display">Abrir novo ticket</h2>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-surface-1 text-ink-secondary transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-ink mb-1.5">Assunto</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={100}
              placeholder="Descreva o problema em poucas palavras"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface-0 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-mint-400/30 focus:border-mint-400 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-ink mb-1.5">Mensagem</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder="Descreva o problema com detalhes..."
              required
              className="w-full px-3 py-2.5 rounded-lg border border-line bg-surface-0 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-mint-400/30 focus:border-mint-400 transition-colors resize-none"
            />
            <p className="text-[11px] text-ink-tertiary mt-1 text-right">{message.length}/2000</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 btn-secondary py-2.5 text-sm font-semibold rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting || !title.trim() || !message.trim()}
              className="flex-1 btn-gradient py-2.5 text-sm font-bold rounded-lg disabled:opacity-50"
            >
              {submitting ? 'Abrindo...' : 'Abrir ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewTicketModal;
```

- [ ] **Step 3: Create `src/pages/SuporteTicket.tsx`**

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, LifeBuoy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../context/UserContext';
import { useToast } from '../context/ToastContext';

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

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-info-bg text-info-ink border-info/20',
  in_progress: 'bg-warning-bg text-warning-ink border-warning/20',
  resolved: 'bg-ice text-mint-800 border-mint-200',
  closed: 'bg-surface-1 text-ink-secondary border-line',
};

function formatTicketNumber(n: number) {
  return `#${String(n).padStart(4, '0')}`;
}

const SuporteTicket: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useUser();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id || !user) return;
    const [{ data: t }, { data: msgs }] = await Promise.all([
      supabase.from('support_tickets').select('id, ticket_number, title, status').eq('id', id).single(),
      supabase.from('support_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true }),
    ]);
    if (t) setTicket(t as Ticket);
    if (msgs) setMessages(msgs as Message[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [id, user]);

  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`ticket:${id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'support_messages',
        filter: `ticket_id=eq.${id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !ticket || !reply.trim() || sending) return;
    if (ticket.status === 'resolved' || ticket.status === 'closed') return;
    setSending(true);
    const { error } = await supabase
      .from('support_messages')
      .insert({ ticket_id: ticket.id, author_id: user.id, author_role: 'user', content: reply.trim() });
    if (error) {
      toast('Erro ao enviar mensagem. Tente novamente.', 'error');
    } else {
      setReply('');
    }
    setSending(false);
  };

  if (!user) return null;
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-4 border-line border-t-mint-500 rounded-full animate-spin" />
      </div>
    );
  }
  if (!ticket) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16">
        <p className="text-ink-secondary">Ticket não encontrado.</p>
        <button onClick={() => navigate('/suporte')} className="btn-gradient mt-4 px-4 py-2 text-sm font-bold rounded-lg">
          Voltar
        </button>
      </div>
    );
  }

  const isClosed = ticket.status === 'resolved' || ticket.status === 'closed';

  return (
    <div className="max-w-3xl mx-auto flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-shrink-0">
        <button
          onClick={() => navigate('/suporte')}
          className="p-2 rounded-lg hover:bg-surface-1 text-ink-secondary transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-ink-tertiary font-mono">{formatTicketNumber(ticket.ticket_number)}</span>
            <span className="text-ink-tertiary">·</span>
            <h1 className="text-base font-bold text-ink truncate font-display">{ticket.title}</h1>
            <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${STATUS_CLASS[ticket.status] || STATUS_CLASS.open}`}>
              {STATUS_LABEL[ticket.status] || ticket.status}
            </span>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2 pr-1 scrollbar-none">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-ink-tertiary text-sm">
            Nenhuma mensagem ainda.
          </div>
        )}
        {messages.map((msg) => {
          const isUser = msg.author_role === 'user';
          return (
            <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} gap-2`}>
              {!isUser && (
                <div className="w-8 h-8 rounded-full bg-ice border border-mint-200 flex items-center justify-center flex-shrink-0 mt-1">
                  <LifeBuoy className="w-4 h-4 text-mint-700" />
                </div>
              )}
              <div className={`max-w-[75%]`}>
                {!isUser && (
                  <p className="text-[11px] font-semibold text-ink-tertiary mb-1 ml-1">Suporte Aflyo</p>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  isUser
                    ? 'bg-ice text-ink rounded-br-sm'
                    : 'bg-surface-1 text-ink rounded-bl-sm border border-line'
                }`}>
                  {msg.content}
                </div>
                <p className={`text-[10px] text-ink-tertiary mt-1 ${isUser ? 'text-right' : 'text-left ml-1'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' '}
                  {new Date(msg.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply box */}
      <form onSubmit={sendReply} className="mt-3 flex-shrink-0">
        {isClosed ? (
          <p className="text-center text-sm text-ink-secondary py-3 bg-surface-1 rounded-xl border border-line">
            Este ticket está {STATUS_LABEL[ticket.status].toLowerCase()}. Não é possível enviar novas mensagens.
          </p>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Digite sua mensagem..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(e as any); }
              }}
              className="flex-1 px-3 py-2.5 rounded-xl border border-line bg-surface-0 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-mint-400/30 focus:border-mint-400 transition-colors resize-none"
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className="btn-gradient p-3 rounded-xl disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        )}
      </form>
    </div>
  );
};

export default SuporteTicket;
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit` in `D:/ofertapro`
Expected: no new errors.

---

### Task 5: Admin-API Handler

**Files:**
- Create: `supabase/functions/admin-api/handlers/support.ts`
- Modify: `supabase/functions/admin-api/index.ts`

**Interfaces:**
- Consumes: `serviceClient()` from `../_lib.ts`, `RbacError` from `../rbac.ts`, `Handler` type from `../index.ts`
- Produces: handlers `list`, `get`, `reply`, `status-update`, `priority-update` registered under `support` resource in HANDLERS

- [ ] **Step 1: Create `supabase/functions/admin-api/handlers/support.ts`**

```typescript
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
```

- [ ] **Step 2: Register support handlers in `supabase/functions/admin-api/index.ts`**

Add the import at line 15 (after `system` import):
```typescript
import * as support from './handlers/support.ts';
```

Add the HANDLERS entry after the `system` block (around line 109):
```typescript
  support: {
    list:             { permission: 'users.read',   handler: support.list },
    get:              { permission: 'users.read',   handler: support.get },
    reply:            { permission: 'users.read',   handler: support.reply },
    'status-update':  { permission: 'users.read',   handler: support.statusUpdate },
    'priority-update':{ permission: 'users.read',   handler: support.priorityUpdate },
  },
```

- [ ] **Step 3: Verify Deno types**

Run: `deno check supabase/functions/admin-api/handlers/support.ts` (if available)
Expected: no errors.

---

### Task 6: Admin Panel Pages

**Files:**
- Modify: `admin/src/nav.ts`
- Modify: `admin/src/App.tsx`
- Create: `admin/src/pages/support/SupportQueue.tsx`
- Create: `admin/src/pages/support/SupportTicketDetail.tsx`

**Interfaces:**
- Consumes: `callAdminApi` from `../../lib/admin-api`, `RequirePermission` from `../../components/RequirePermission`, `useToast` from `../../context/ToastContext`, `supabase` from `../../lib/supabase` (for send-email)
- Produces: `/support` (queue) and `/support/:id` (detail) routes in the admin app

- [ ] **Step 1: Activate route in `admin/src/nav.ts`**

Change the "Fila de suporte" entry:
```typescript
// BEFORE:
{ label: 'Fila de suporte', permission: 'users.read', icon: LifeBuoy, comingSoon: true },
// AFTER:
{ label: 'Fila de suporte', to: '/support', permission: 'users.read', icon: LifeBuoy },
```

- [ ] **Step 2: Add routes in `admin/src/App.tsx`**

Add imports (alongside other page imports):
```typescript
import SupportQueue from './pages/support/SupportQueue';
import SupportTicketDetail from './pages/support/SupportTicketDetail';
```

Add routes inside the `<Route element={<AdminLayout />}>` block (before the `path="*"` fallback):
```typescript
<Route path="/support" element={<RequirePermission permission="users.read"><SupportQueue /></RequirePermission>} />
<Route path="/support/:id" element={<RequirePermission permission="users.read"><SupportTicketDetail /></RequirePermission>} />
```

- [ ] **Step 3: Create `admin/src/pages/support/SupportQueue.tsx`**

```typescript
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LifeBuoy, ExternalLink } from 'lucide-react';
import { callAdminApi } from '../../lib/admin-api';

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

const STATUS_LABEL: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

const STATUS_CLASS: Record<string, string> = {
  open: 'bg-info-bg text-info-ink',
  in_progress: 'bg-warning-bg text-warning-ink',
  resolved: 'bg-green-50 text-green-700',
  closed: 'bg-surface-1 text-ink-secondary',
};

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente',
};

const PRIORITY_CLASS: Record<string, string> = {
  low: 'text-ink-tertiary', normal: 'text-ink-secondary', high: 'text-warning-ink', urgent: 'text-danger-ink font-bold',
};

function formatTicketNumber(n: number) {
  return `#${String(n).padStart(4, '0')}`;
}

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'open', label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved', label: 'Resolvido' },
  { value: 'closed', label: 'Fechado' },
];

const SupportQueue: React.FC = () => {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const data = await callAdminApi<TicketRow[]>('support', 'list', { status: statusFilter, page, pageSize: 25 });
      setTickets(data ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [statusFilter, page]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ink font-display">Fila de suporte</h1>
          <p className="text-sm text-ink-secondary mt-0.5">Tickets de suporte dos usuários.</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              statusFilter === f.value
                ? 'bg-ink text-surface-0'
                : 'bg-surface-1 text-ink-secondary hover:text-ink'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-line border-t-mint-500 rounded-full animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-surface-0 rounded-xl border border-line text-center space-y-3">
          <LifeBuoy className="w-8 h-8 text-ink-tertiary" />
          <p className="text-sm text-ink-secondary">Nenhum ticket encontrado.</p>
        </div>
      ) : (
        <div className="bg-surface-0 rounded-xl border border-line overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-surface-1">
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-tertiary">#</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-tertiary">Título</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-tertiary">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-tertiary">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-tertiary">Prioridade</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-ink-tertiary">Última msg</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {tickets.map((t) => (
                <tr key={t.id} className="hover:bg-surface-1 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-ink-secondary">{formatTicketNumber(t.ticket_number)}</td>
                  <td className="px-4 py-3 font-medium text-ink max-w-[200px] truncate">{t.title}</td>
                  <td className="px-4 py-3 text-ink-secondary text-xs">{t.profiles?.email ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${STATUS_CLASS[t.status] ?? STATUS_CLASS.open}`}>
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-xs ${PRIORITY_CLASS[t.priority] ?? ''}`}>
                    {PRIORITY_LABEL[t.priority] ?? t.priority}
                  </td>
                  <td className="px-4 py-3 text-xs text-ink-tertiary">
                    {new Date(t.last_message_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => navigate(`/support/${t.id}`)}
                      className="flex items-center gap-1 text-xs font-semibold text-mint-700 hover:text-mint-900 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Abrir
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SupportQueue;
```

- [ ] **Step 4: Create `admin/src/pages/support/SupportTicketDetail.tsx`**

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, LifeBuoy, User } from 'lucide-react';
import { callAdminApi } from '../../lib/admin-api';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';

type TicketDetail = {
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

const STATUS_OPTIONS = [
  { value: 'open',        label: 'Aberto' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'resolved',    label: 'Resolvido' },
  { value: 'closed',      label: 'Fechado' },
];

const PRIORITY_OPTIONS = [
  { value: 'low',    label: 'Baixa' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Alta' },
  { value: 'urgent', label: 'Urgente' },
];

function formatTicketNumber(n: number) {
  return `#${String(n).padStart(4, '0')}`;
}

const USER_APP_URL = import.meta.env.VITE_USER_APP_URL ?? 'https://app.aflyo.com.br';

const SupportTicketDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!id) return;
    try {
      const data = await callAdminApi<{ ticket: TicketDetail; messages: Message[] }>('support', 'get', { ticketId: id });
      if (data) {
        setTicket(data.ticket);
        setMessages(data.messages);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  // Realtime for live updates
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
        setMessages((prev) => {
          if (prev.some((m) => m.id === (payload.new as Message).id)) return prev;
          return [...prev, payload.new as Message];
        })
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticket || !reply.trim() || sending) return;
    setSending(true);
    try {
      const newMsg = await callAdminApi<Message>('support', 'reply', { ticketId: ticket.id, content: reply.trim() });
      if (newMsg) {
        setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
        // Update local status if was open
        setTicket((prev) => prev && prev.status === 'open' ? { ...prev, status: 'in_progress' } : prev);
      }
      setReply('');

      // Send email notification (best effort)
      if (ticket.profiles?.email) {
        const ticketNumber = String(ticket.ticket_number).padStart(4, '0');
        const replyPreview = reply.trim().slice(0, 200) + (reply.trim().length > 200 ? '...' : '');
        const ticketUrl = `${USER_APP_URL}/suporte/${ticket.id}`;
        supabase.functions.invoke('send-email', {
          body: {
            template: 'resposta-suporte',
            to: ticket.profiles.email,
            variables: {
              USER_NAME: ticket.profiles.full_name || 'Usuário',
              USER_EMAIL: ticket.profiles.email,
              TICKET_NUMBER: ticketNumber,
              TICKET_TITLE: ticket.title,
              TICKET_URL: ticketUrl,
              REPLY_PREVIEW: replyPreview,
            },
          },
        }).catch(() => {});
        toast('Resposta enviada.', 'success');
      }
    } catch (err: any) {
      toast(err?.message || 'Erro ao enviar resposta.', 'error');
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: string) => {
    if (!ticket) return;
    try {
      await callAdminApi('support', 'status-update', { ticketId: ticket.id, status });
      setTicket((prev) => prev ? { ...prev, status } : prev);
      toast('Status atualizado.', 'success');
    } catch {
      toast('Erro ao atualizar status.', 'error');
    }
  };

  const updatePriority = async (priority: string) => {
    if (!ticket) return;
    try {
      await callAdminApi('support', 'priority-update', { ticketId: ticket.id, priority });
      setTicket((prev) => prev ? { ...prev, priority } : prev);
      toast('Prioridade atualizada.', 'success');
    } catch {
      toast('Erro ao atualizar prioridade.', 'error');
    }
  };

  if (loading) {
    return <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-line border-t-mint-500 rounded-full animate-spin" /></div>;
  }
  if (!ticket) {
    return <div className="text-center py-16 text-ink-secondary">Ticket não encontrado.</div>;
  }

  return (
    <div className="space-y-4 flex flex-col" style={{ height: 'calc(100vh - 100px)' }}>
      {/* Header */}
      <div className="flex items-start gap-4 flex-shrink-0">
        <button onClick={() => navigate('/support')} className="p-2 rounded-lg hover:bg-surface-1 text-ink-secondary mt-0.5 transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-bold text-ink font-display">
            <span className="font-mono text-ink-tertiary mr-2">{formatTicketNumber(ticket.ticket_number)}</span>
            {ticket.title}
          </h1>
          <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-ink-secondary">
            <User className="w-3.5 h-3.5" />
            <span>{ticket.profiles?.email ?? '—'}</span>
            {ticket.profiles?.id && (
              <button
                onClick={() => navigate(`/users/${ticket.profiles!.id}`)}
                className="text-mint-700 hover:underline"
              >
                Ver usuário
              </button>
            )}
          </div>
        </div>
        {/* Controls */}
        <div className="flex gap-2 flex-shrink-0">
          <select
            value={ticket.status}
            onChange={(e) => updateStatus(e.target.value)}
            className="text-xs border border-line rounded-lg px-2 py-1.5 bg-surface-0 text-ink focus:outline-none focus:ring-2 focus:ring-mint-400/30"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <select
            value={ticket.priority}
            onChange={(e) => updatePriority(e.target.value)}
            className="text-xs border border-line rounded-lg px-2 py-1.5 bg-surface-0 text-ink focus:outline-none focus:ring-2 focus:ring-mint-400/30"
          >
            {PRIORITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pb-2 bg-surface-0 rounded-xl border border-line p-4 scrollbar-none">
        {messages.map((msg) => {
          const isUserMsg = msg.author_role === 'user';
          return (
            <div key={msg.id} className={`flex ${isUserMsg ? 'justify-start' : 'justify-end'} gap-2`}>
              {isUserMsg && (
                <div className="w-8 h-8 rounded-full bg-surface-1 border border-line flex items-center justify-center flex-shrink-0 mt-1">
                  <User className="w-4 h-4 text-ink-tertiary" />
                </div>
              )}
              <div className="max-w-[75%]">
                {isUserMsg && (
                  <p className="text-[11px] font-semibold text-ink-tertiary mb-1 ml-1">
                    {ticket.profiles?.full_name || ticket.profiles?.email || 'Usuário'}
                  </p>
                )}
                {!isUserMsg && (
                  <div className="flex items-center gap-1 mb-1 justify-end">
                    <p className="text-[11px] font-semibold text-ink-tertiary">Suporte</p>
                    <LifeBuoy className="w-3 h-3 text-mint-600" />
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  isUserMsg
                    ? 'bg-surface-1 text-ink rounded-bl-sm border border-line'
                    : 'bg-ice text-ink rounded-br-sm'
                }`}>
                  {msg.content}
                </div>
                <p className={`text-[10px] text-ink-tertiary mt-1 ${isUserMsg ? 'text-left ml-1' : 'text-right'}`}>
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  {' '}
                  {new Date(msg.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </p>
              </div>
              {!isUserMsg && (
                <div className="w-8 h-8 rounded-full bg-ice border border-mint-200 flex items-center justify-center flex-shrink-0 mt-1">
                  <LifeBuoy className="w-4 h-4 text-mint-700" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply form */}
      <form onSubmit={sendReply} className="flex gap-2 items-end flex-shrink-0">
        <textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Responder como suporte..."
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(e as any); }
          }}
          className="flex-1 px-3 py-2.5 rounded-xl border border-line bg-surface-0 text-sm text-ink placeholder:text-ink-tertiary focus:outline-none focus:ring-2 focus:ring-mint-400/30 focus:border-mint-400 transition-colors resize-none"
        />
        <button
          type="submit"
          disabled={sending || !reply.trim()}
          className="btn-gradient p-3 rounded-xl disabled:opacity-50 flex items-center gap-1.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

export default SupportTicketDetail;
```

- [ ] **Step 5: TypeScript check**

Run: `npx tsc --noEmit` in `D:/ofertapro/admin`
Expected: no new errors.

---

### Task 7: Deploy

**Files:** No new files — applies everything created in Tasks 1-6 to production.

**Interfaces:**
- Consumes: all files from Tasks 1-6
- Produces: migration applied to Supabase, `send-email` and `admin-api` Edge Functions redeployed, Vercel prod builds for user app and admin app

- [ ] **Step 1: Apply migration via Supabase MCP**

Use `mcp__claude_ai_Supabase__apply_migration` with the content of `supabase/migrations/20260920000000_support_tickets.sql`.

Verify with `mcp__claude_ai_Supabase__list_tables` that `support_tickets` and `support_messages` appear.

- [ ] **Step 2: Deploy `send-email` Edge Function**

Use `mcp__claude_ai_Supabase__deploy_edge_function` for `send-email` (it now has 2 new templates).

- [ ] **Step 3: Deploy `admin-api` Edge Function**

Use `mcp__claude_ai_Supabase__deploy_edge_function` for `admin-api` (it now has the support handlers).

- [ ] **Step 4: Deploy user app to Vercel**

Use `vercel-cli-with-tokens` skill or run `vercel --prod` in `D:/ofertapro`.

- [ ] **Step 5: Deploy admin app to Vercel**

Run `vercel --prod` in `D:/ofertapro/admin`.

- [ ] **Step 6: Smoke test via browser**

Test the following flows:
1. Open `/suporte` — empty state shows "Nenhum ticket ainda"
2. Click "Abrir ticket" — modal opens, fill title + message, submit
3. Ticket created → navigates to `/suporte/:id` chat view
4. Send a reply message — appears in real time
5. In admin at `/support` — ticket appears in queue with correct number and status
6. Click "Abrir" → detail page shows messages
7. Admin types reply + sends → message appears in chat, email notification sent
8. Admin changes status to "Resolvido" → reply box in user app shows disabled state

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260920000000_support_tickets.sql \
        supabase/functions/_shared/emails/subjects.ts \
        supabase/functions/_shared/emails/templates.ts \
        supabase/functions/admin-api/handlers/support.ts \
        supabase/functions/admin-api/index.ts \
        src/config/features.ts \
        src/components/Sidebar.tsx \
        src/App.tsx \
        src/pages/Suporte.tsx \
        src/components/support/NewTicketModal.tsx \
        src/pages/SuporteTicket.tsx \
        admin/src/nav.ts \
        admin/src/App.tsx \
        admin/src/pages/support/SupportQueue.tsx \
        admin/src/pages/support/SupportTicketDetail.tsx
git commit -m "feat(support): substitui feedbacks pelo sistema de tickets de suporte"
```
