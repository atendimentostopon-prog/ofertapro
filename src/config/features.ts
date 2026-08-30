// Flags de features globais para o Aflyo
// Permite desativar ou ocultar temporariamente recursos em desenvolvimento ou em fases específicas de teste.
export const FEATURES = {
  billing: true,       // Task 15 flip 2026-08-18: aflyo Starter mensal/anual ativo via billing
  whatsapp: true,     // Ativa Evolution API/WhatsApp no frontend
  telegram: true,      // Habilita canal Telegram Bot API
  discord: true,       // Habilita canal Discord Webhooks
  feedback: true,      // Habilita o sistema de feedbacks e logs do beta
  publicPage: true,     // Habilita a página pública sem restrições de autenticação
  useDirectAffiliateLinkInChannels: true, // Envia o link de afiliado direto nos canais (Telegram/Discord)
  // Encurtador de terceiro (is.gd / tinyurl / bitly) DESLIGADO para sempre.
  // Nos canais vai só o encurtador próprio (aflyo.com.br/o/<code>) ou o link
  // de afiliado original. Nada de domínio de terceiro.
  linkShortener: {
    enabled: false,
    provider: 'none' as 'tinyurl' | 'isgd' | 'bitly' | 'none'
  }
};

