// Mascaramento de segredo herdado do painel antigo. Antes ficava server-side
// na RPC get_admin_channels (colunas identifier_masked / token_masked de
// src/pages/AdminDashboard.tsx, removida no SP1). Reimplementado aqui como
// util compartilhado. Nao usado por tela no SP1; pronto para SP2.
export const DISCORD_WEBHOOK_MASK_RE =
  /discord\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g;

// bot_token do Telegram: "<digitos>:<segredo alfanumerico>"
export const TELEGRAM_BOT_TOKEN_MASK_RE = /\b(\d{6,}):[A-Za-z0-9_-]{30,}\b/g;

export function maskDiscordWebhook(value: string): string {
  return value.replace(DISCORD_WEBHOOK_MASK_RE, 'discord.com/api/webhooks/********');
}

export function maskTelegramBotToken(value: string): string {
  return value.replace(TELEGRAM_BOT_TOKEN_MASK_RE, '$1:********');
}
