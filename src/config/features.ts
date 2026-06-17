// Flags de features globais para o OfertaPro
// Permite desativar ou ocultar temporariamente recursos em desenvolvimento ou em fases específicas de teste.
export const FEATURES = {
  billing: false,      // Desativa planos pagos, upgrades, CTAs de cobrança e telas de checkout
  whatsapp: false,     // Desativa Evolution API/WhatsApp temporariamente (mostra "Em breve")
  telegram: true,      // Habilita canal Telegram Bot API
  discord: true,       // Habilita canal Discord Webhooks
  feedback: true,      // Habilita o sistema de feedbacks e logs do beta
  publicPage: true     // Habilita a página pública sem restrições de autenticação
};

