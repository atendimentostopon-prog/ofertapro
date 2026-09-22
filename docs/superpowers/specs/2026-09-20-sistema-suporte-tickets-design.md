# Sistema de Suporte com Tickets

2026-09-20

## Objetivo

Substituir a funcionalidade de Feedbacks por um sistema completo de suporte ao usuário baseado em tickets numerados. Usuários abrem tickets com título, trocam mensagens em formato de chat, e recebem notificações por email quando o suporte/admin responde.

---

## Escopo

### O que entra
- Remoção da página `/feedbacks` e botão flutuante de feedback
- Tabelas `support_tickets` e `support_messages` no Supabase
- Numeração sequencial de tickets (`#0001`, `#0002`, ...)
- Página `/suporte` no app do usuário: listagem + abertura de ticket
- Página `/suporte/:id` no app do usuário: chat do ticket
- Página `/support` no painel admin: fila de suporte
- Página `/support/:id` no painel admin: chat + controles de status
- 2 novos templates de email via Resend: confirmação de abertura e resposta do suporte
- Realtime via Supabase para atualizar o chat sem recarregar

### O que fica de fora (MVP)
- Atribuição de agente (assigned_to) sem UI — coluna existe mas sem tela
- Categorias/tags de ticket
- Anexos/uploads
- SLA / métricas de tempo de resposta

---

## Arquitetura

```
User App (React)          Admin App (React)
  /suporte                  /support
  /suporte/:id   <──RLS──>  /support/:id
        │                        │
        └──── Supabase DB ───────┘
               support_tickets
               support_messages
                     │
              trigger on INSERT
              (author_role != 'user')
                     │
              Edge Function send-email
              template: resposta-suporte
```

---

## Banco de Dados

### `support_tickets`

```sql
CREATE SEQUENCE support_ticket_seq START 1;

CREATE TABLE support_tickets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number  BIGINT NOT NULL DEFAULT nextval('support_ticket_seq'),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'open'
                   CHECK (status IN ('open','in_progress','resolved','closed')),
  priority       TEXT NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low','normal','high','urgent')),
  assigned_to    UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now(),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  resolved_at    TIMESTAMPTZ
);

CREATE UNIQUE INDEX support_tickets_number_idx ON support_tickets(ticket_number);
```

### `support_messages`

```sql
CREATE TABLE support_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT NOT NULL CHECK (author_role IN ('user','support','admin')),
  content     TEXT NOT NULL CHECK (char_length(content) <= 4000),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX support_messages_ticket_idx ON support_messages(ticket_id, created_at);
```

### Trigger `updated_at` e `last_message_at`

```sql
-- Atualiza updated_at do ticket ao inserir mensagem
CREATE OR REPLACE FUNCTION update_ticket_on_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE support_tickets
  SET updated_at = now(), last_message_at = now()
  WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ticket_on_message
AFTER INSERT ON support_messages
FOR EACH ROW EXECUTE FUNCTION update_ticket_on_message();
```

### Trigger de notificação por email

```sql
-- Função que chama o send-email via pg_net ou via RPC notificado pelo frontend
-- Implementado via Edge Function chamada diretamente do frontend admin após insert
-- (pg_net não está disponível no plano free; o admin chama send-email após inserir)
```

### RLS

```sql
-- support_tickets
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

-- Usuário vê e cria seus próprios tickets
CREATE POLICY "user_own_tickets" ON support_tickets
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Admins veem tudo (via service_role ou claim admin)
-- Implementado via has_admin_access() conforme padrão do projeto

-- support_messages
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Usuário lê mensagens dos seus tickets
CREATE POLICY "user_read_own_ticket_messages" ON support_messages
  FOR SELECT TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE user_id = auth.uid()
    )
  );

-- Usuário insere mensagens nos seus tickets (apenas author_role = 'user')
CREATE POLICY "user_insert_own_ticket_messages" ON support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_role = 'user' AND
    ticket_id IN (
      SELECT id FROM support_tickets WHERE user_id = auth.uid()
    )
  );
```

---

## Email Templates

### Template `resposta-suporte`

**Subject:** `Você tem uma nova resposta no ticket #{{TICKET_NUMBER}}`

**Variables:** `USER_NAME`, `USER_EMAIL`, `TICKET_NUMBER`, `TICKET_TITLE`, `TICKET_URL`, `REPLY_PREVIEW`, `APP_URL`, `SUPPORT_URL`, `PREFERENCES_URL`

**Conteúdo:** Notifica que o suporte respondeu, mostra preview da resposta (primeiros 200 chars), CTA "Ver resposta" → `{{TICKET_URL}}`.

### Template `ticket-aberto` (confirmação)

**Subject:** `Ticket #{{TICKET_NUMBER}} aberto com sucesso`

**Variables:** `USER_NAME`, `USER_EMAIL`, `TICKET_NUMBER`, `TICKET_TITLE`, `TICKET_URL`, `APP_URL`, `SUPPORT_URL`, `PREFERENCES_URL`

**Conteúdo:** Confirma a abertura do ticket, informa que o suporte responderá em breve, CTA "Ver meu ticket".

---

## App do Usuário

### Remoção dos Feedbacks

- `FEATURES.feedback = false` em `src/config/features.ts`
- Remover item "Feedbacks" do `navItems` em `Sidebar.tsx`
- Adicionar item "Suporte" com ícone `LifeBuoy` apontando para `/suporte`
- Remover rota `/feedbacks` do `App.tsx`; adicionar `/suporte` e `/suporte/:id`
- O `<FeedbackButton />` flutuante é mantido removido (o flag já o condiciona)

### Página `/suporte` — `src/pages/Suporte.tsx`

```
Header: "Suporte" + botão "Abrir ticket"
Lista de tickets (cards):
  - Badge "#0001"
  - Título do ticket
  - Badge de status: Aberto | Em andamento | Resolvido | Fechado
  - Data de criação + última mensagem
  - Chevron direito → navega para /suporte/:id
Empty state: "Nenhum ticket ainda. Abra um ticket para falar com o suporte."
```

### Modal `NewTicketModal`

```
Campos:
  - Título (text input, obrigatório, max 100)
  - Descrição / primeira mensagem (textarea, obrigatório, max 2000)
Ações:
  - Cancelar
  - Abrir ticket (cria ticket + primeira mensagem em transação)
Ao confirmar: chama send-email template "ticket-aberto", navega para /suporte/:id
```

### Página `/suporte/:id` — `src/pages/SuporteTicket.tsx`

```
Header:
  - Botão "← Meus tickets"
  - "#0001 · Título do ticket"
  - Badge de status
Thread de mensagens:
  - Mensagens do usuário: alinhadas à direita, fundo mint
  - Mensagens do suporte: alinhadas à esquerda, fundo surface-1
  - Avatar + "Suporte Aflyo" para mensagens do suporte
  - Timestamp em cada mensagem
  - Realtime: subscrito em support_messages WHERE ticket_id = id
Caixa de reply:
  - Textarea (max 2000 chars)
  - Botão "Enviar"
  - Desabilitado se status = 'resolved' | 'closed'
```

---

## Painel Admin

### `admin/src/nav.ts`

Ativar item "Fila de suporte":
```typescript
{ label: 'Fila de suporte', to: '/support', permission: 'users.read', icon: LifeBuoy }
// remover comingSoon: true
```

### Página `/support` — `admin/src/pages/SupportQueue.tsx`

```
Filtros: status (todos | aberto | em andamento | resolvido | fechado)
Tabela:
  - #Número
  - Título
  - Usuário (email)
  - Status (badge)
  - Prioridade (badge)
  - Aberto em
  - Última mensagem
  - Ação: "Abrir" → /support/:id
Realtime: subscription em support_tickets
```

### Página `/support/:id` — `admin/src/pages/SupportTicketDetail.tsx`

```
Header:
  - "#0001 · Título"
  - Select de status: Aberto / Em andamento / Resolvido / Fechado
  - Select de prioridade: Baixa / Normal / Alta / Urgente
  - Email do usuário + link para /users/:userId
Thread: igual ao do usuário mas sem restrição
Caixa de reply:
  - Textarea
  - Botão "Responder"
  - Ao enviar: INSERT com author_role='support', depois chama send-email "resposta-suporte"
```

### Notificação de email no admin

Após inserir mensagem no admin:
1. Frontend busca `user_id` do ticket → busca email em `profiles`
2. Chama Edge Function `send-email` com template `resposta-suporte` e variáveis do ticket
3. Exibe toast de confirmação

---

## Realtime

Ambos os lados (user e admin) fazem:
```typescript
supabase
  .channel(`ticket:${ticketId}`)
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'support_messages',
    filter: `ticket_id=eq.${ticketId}`
  }, (payload) => appendMessage(payload.new))
  .subscribe()
```

---

## Formato do número do ticket

Formatado como `#${String(ticket_number).padStart(4, '0')}`.

Exemplos: `#0001`, `#0042`, `#1337`.

---

## Status do ticket

| Status | Cor | Descrição |
|--------|-----|-----------|
| `open` | Azul | Recém aberto, aguardando suporte |
| `in_progress` | Amarelo | Suporte está atendendo |
| `resolved` | Verde | Problema resolvido |
| `closed` | Cinza | Fechado sem resolução ou expirado |

---

## Arquivos Afetados

### Novos
- `supabase/migrations/20260920000000_support_tickets.sql`
- `src/pages/Suporte.tsx`
- `src/pages/SuporteTicket.tsx`
- `src/components/support/NewTicketModal.tsx`
- `admin/src/pages/SupportQueue.tsx`
- `admin/src/pages/SupportTicketDetail.tsx`

### Modificados
- `src/config/features.ts` — `FEATURES.feedback = false`
- `src/components/Sidebar.tsx` — trocar Feedbacks por Suporte
- `src/App.tsx` — rotas /suporte e /suporte/:id
- `admin/src/nav.ts` — ativar Fila de suporte
- `admin/src/App.tsx` — rotas /support e /support/:id
- `supabase/functions/_shared/emails/subjects.ts` — 2 novos templates
- `supabase/functions/_shared/emails/templates.ts` — HTML dos 2 templates
