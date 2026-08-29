// Regex salvas de src/pages/AdminDashboard.tsx (RPC get_admin_channels) antes
// da remocao no SP1. Nao usadas por tela no SP1; prontas para SP2.
export const DISCORD_WEBHOOK_MASK_RE =
  /discord\.com\/api\/webhooks\/[0-9]+\/[a-zA-Z0-9_-]+/g;

export function maskDiscordWebhook(value: string): string {
  return value.replace(DISCORD_WEBHOOK_MASK_RE, 'discord.com/api/webhooks/********');
}

export function maskTelegramBotToken(value: string): string {
  const [prefix] = value.split(':');
  return prefix ? `${prefix}:********` : '********';
}
