# Release Notes — OfertaPro v0.9.0-BETA

Bem-vindo ao lançamento da primeira versão de teste fechado do **OfertaPro**, o gerenciador e disparador inteligente de ofertas para afiliados e criadores de conteúdo. 

Este documento lista todas as funcionalidades disponíveis, limitações conhecidas, pendências e o plano de evolução do sistema.

---

## 📌 Versão Atual
*   **Identificador:** `v0.9.0-beta`
*   **Ambiente:** Homologação / Beta Fechado

---

## ✨ Funcionalidades Disponíveis

1.  **Dashboard de Métricas Resiliente:**
    *   Painel visual com métricas em tempo real de cliques, ofertas criadas e histórico de disparos.
    *   Gráfico interativo de cliques nos últimos 7 dias.
2.  **Gerenciador de Ofertas (CRUD):**
    *   Painel de gerenciamento de ofertas ativas/arquivadas.
    *   Modal inteligente para criação de ofertas com cálculo automático de porcentagem de desconto baseada em preços.
    *   Suporte a marcas de marketplace (Shopee, Magalu, Mercado Livre, AliExpress e Amazon).
3.  **Vitrine Pública do Afiliado:**
    *   Catálogo online responsivo e rápido acessível diretamente em `/:username` (ou `/u/:username`).
    *   Busca integrada de ofertas e filtragem por marcas de marketplaces e categorias.
    *   Integração automatizada de tags de SEO dinâmicas para compartilhamento social estruturado (Open Graph, título de página e descrição personalizados).
4.  **Sistema de Tracking com Alta Tolerância a Falhas:**
    *   Links de direcionamento inteligentes em `/r/:id` e `/l/:id`.
    *   Acompanhamento de cliques integrado e gravado em banco de forma assíncrona. Em caso de sobrecarga ou indisponibilidade momentânea no banco de dados, o redirecionamento ocorre de forma fluida sem travar o cliente.
5.  **Gerenciador de Canais de Disparo:**
    *   Painel de conexões para cadastrar canais de mídia (WhatsApp, Telegram e Discord) com controle individual de ativação e sincronização.
6.  **Disparador de Ofertas Integrado:**
    *   Opção de disparar o anúncio criado simultaneamente para múltiplos canais selecionados em lote no momento de salvar a oferta.
    *   Histórico e log detalhado de auditoria de disparos exibindo quais canais receberam a oferta e mensagens de erro específicas para falhas de envio.

---

## 🔌 Integrações Suportadas

*   **Discord (Webhooks):**
    *   *Status:* 100% Operacional. Envia mensagens com formatação embed avançada contendo imagem, links inline, valores e cupons.
*   **Telegram (Bot API):**
    *   *Status:* 100% Operacional. Envio de foto com legenda em Markdown ou mensagem de texto (fallback). Inclui validador e teste de canal automatizados na interface do usuário.
*   **WhatsApp (Evolution API):**
    *   *Status:* Estrutura operacional no código. Pendente de ativação das variáveis de ambiente globais e pareamento de dispositivo celular.

---

## ⚠️ Limitações Conhecidas no Beta

1.  **Disparo síncrono no Frontend:**
    *   O processamento de disparos para múltiplos canais é feito diretamente no navegador do usuário via `Promise.all`. Caso o usuário feche a página ou perca conexão no exato momento de salvar, alguns disparos em lote podem falhar. A migração para execução assíncrona via Edge Functions do Supabase está agendada para a v1.0.
2.  **Segurança dos Tokens no Frontend (Telegram):**
    *   Os bot tokens do Telegram são consumidos do banco de dados diretamente no frontend para fazer requisições à API do Telegram. Em produção, este tráfego deve ser tunelado através de rotas seguras de backend ou Edge Functions para evitar a exposição do token de bot na aba Network do DevTools do navegador de usuários Pro.
3.  **Dependência de Chave de WhatsApp Unificada:**
    *   O motor de WhatsApp consome credenciais de ambiente globais do painel do SaaS. Usuários não conseguem cadastrar servidores ou tokens Evolution próprios no plano padrão de conexões sem intermediação do administrador.

---

## 📋 Pendências e Próximos Passos

1.  **Migração Física de Banco (Supabase):** Executar os scripts `supabase_schema.sql` e `supabase_clicks_schema.sql` no banco de dados do Supabase conectado para ativar as tabelas de histórico, cliques e as políticas de segurança de linha (RLS).
2.  **Criação dos Buckets de Storage:** Configurar manualmente os buckets públicos `offers` e `avatars` no console do Supabase.
3.  **Configuração da Evolution API (.env):** Ligar um servidor Evolution API ativo e colocar os endpoints no arquivo `.env`.
4.  **Automação de Assinaturas e Planos:** Integração de gateway de pagamento (ex: Stripe ou Asaas) para gerenciar limites automáticos de canais ativos baseados em planos de usuários.
