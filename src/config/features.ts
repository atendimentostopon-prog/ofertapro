// Flags de features globais para o Aflyo
// Permite desativar ou ocultar temporariamente recursos em desenvolvimento ou em fases específicas de teste.
export const FEATURES = {
  billing: true,       // Task 15 flip 2026-08-18: billing ativo (planos mensais via Cakto)
  whatsapp: true,     // Ativa Evolution API/WhatsApp no frontend
  telegram: true,      // Habilita canal Telegram Bot API
  discord: true,       // Habilita canal Discord Webhooks
  feedback: true,      // Habilita o sistema de feedbacks e logs do beta
  publicPage: true,     // Habilita a página pública sem restrições de autenticação
  useDirectAffiliateLinkInChannels: true, // Envia o link de afiliado direto nos canais (Telegram/Discord)
  linkShortener: {
    enabled: true,
    provider: 'isgd' as 'tinyurl' | 'isgd' | 'bitly' | 'none'
  }
};

