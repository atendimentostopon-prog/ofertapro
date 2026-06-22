/**
 * telegram.ts — Integração com Telegram Bot API
 *
 * NOTA DE SEGURANÇA — PRODUÇÃO:
 * Para produção, o envio Telegram deve ser migrado para Edge Function/backend
 * para proteger tokens. Nesta implementação MVP, a requisição é feita
 * diretamente do frontend, o que expõe o Bot Token no DevTools do navegador.
 *
 * Estrutura de armazenamento no canal (tabela channels):
 *   identifier : "CHAT_ID"                → ex: "-100123456789" ou "@meucanal"
 *   metadata   : { "bot_token": "..." }   → token do @BotFather
 *
 * O `identifier` armazena o destino (chat_id / @username do canal).
 * O `metadata.bot_token` armazena o segredo para autenticação na API.
 * Ambos são protegidos por RLS — apenas o dono do canal pode ler/escrever.
 */

import { withTimeout } from './utils';
import { FEATURES } from '../config/features';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

// ────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────

function apiUrl(token: string, method: string): string {
  return `${TELEGRAM_API_BASE}${token}/${method}`;
}

/**
 * Escapa caracteres especiais do Markdown v1 do Telegram.
 * Evita que underscores, asteriscos, crases e colchetes no texto
 * quebrem a formatação da mensagem.
 */
export function escapeMarkdown(text: string): string {
  return text.replace(/([_*`\[\]])/g, '\\$1');
}

/**
 * Mascara um Bot Token para exibição segura na UI.
 * Ex: "123456:AAHdq...MZ" → "123456:••••••••MZ"
 */
export function maskBotToken(token: string): string {
  if (!token || token.length < 10) return '••••••••';
  const parts = token.split(':');
  if (parts.length !== 2) return '••••••••';
  const suffix = parts[1].slice(-3);
  return `${parts[0]}:${'•'.repeat(8)}${suffix}`;
}

// ────────────────────────────────────────────────────
// Envio de Mensagens
// ────────────────────────────────────────────────────

/**
 * Envia uma mensagem de texto para um chat/canal Telegram.
 * Suporta formatação Markdown (parse_mode: Markdown).
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
  parseMode: 'Markdown' | 'HTML' | 'MarkdownV2' | undefined = 'Markdown'
): Promise<void> {
  const cleanToken = String(botToken).trim();
  const cleanChatId = String(chatId).trim();

  if (!cleanToken) {
    throw new Error('Token do Telegram inválido ou ausente.');
  }
  if (!cleanChatId) {
    throw new Error('Chat ID inválido ou ausente.');
  }

  const body: Record<string, any> = {
    chat_id: cleanChatId,
    text,
    disable_web_page_preview: false,
  };
  if (parseMode) {
    body.parse_mode = parseMode;
  }

  let data: any;
  try {
    const fetchPromise = fetch(apiUrl(cleanToken, 'sendMessage'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await withTimeout(fetchPromise, 15000, "Envio Telegram");
    data = await response.json();
  } catch (err: any) {
    if (err.message && err.message.includes('[TIMEOUT]')) {
      throw err;
    }
    throw new Error('Erro de conexão ao enviar mensagem ao Telegram.', { cause: err });
  }

  if (!data.ok) {
    const desc = data.description || '';
    if (desc.includes('Unauthorized') || desc.includes('bot_token') || data.error_code === 401) {
      throw new Error('Token do Telegram inválido.');
    }
    if (desc.includes('chat not found') || desc.includes('chat_id') || data.error_code === 400) {
      throw new Error('Chat não encontrado. Verifique se o bot está no grupo/canal como administrador e se o Chat ID está correto.');
    }
    if (desc.includes('forbidden') || desc.includes('admin') || desc.includes('blocked') || data.error_code === 403) {
      throw new Error('O bot foi bloqueado ou não tem permissão para enviar mensagens no canal/grupo.');
    }
    throw new Error(`Telegram respondeu com erro: ${desc || 'Erro desconhecido.'}`);
  }
}

/**
 * Envia uma foto para um chat/canal Telegram, com legenda.
 * Em caso de falha na foto (URL inválida, por ex.), faz fallback para sendMessage.
 */
export async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption: string,
  parseMode: 'Markdown' | 'HTML' | 'MarkdownV2' | undefined = 'Markdown'
): Promise<void> {
  const cleanToken = String(botToken).trim();
  const cleanChatId = String(chatId).trim();

  if (!cleanToken) {
    throw new Error('Token do Telegram inválido ou ausente.');
  }
  if (!cleanChatId) {
    throw new Error('Chat ID inválido ou ausente.');
  }

  const body: Record<string, any> = {
    chat_id: cleanChatId,
    photo: photoUrl,
    caption,
  };
  if (parseMode) {
    body.parse_mode = parseMode;
  }

  let data: any;
  try {
    const fetchPromise = fetch(apiUrl(cleanToken, 'sendPhoto'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await withTimeout(fetchPromise, 15000, "Envio Telegram Photo");
    data = await response.json();
  } catch (err: any) {
    console.warn(`Telegram [sendPhoto] falhou na conexão ou timeout. Tentando fallback com sendMessage...`, err);
    await sendTelegramMessage(
      cleanToken,
      cleanChatId,
      `${caption}\n\n🖼️ [Ver imagem](${photoUrl})`,
      parseMode
    );
    return;
  }

  if (!data.ok) {
    console.warn(
      `Telegram [sendPhoto] falhou (${data.description ?? 'Erro desconhecido'}). Tentando fallback com sendMessage...`
    );
    
    const desc = data.description || '';
    if (desc.includes('Unauthorized') || data.error_code === 401 || desc.includes('chat not found') || data.error_code === 400 || desc.includes('forbidden') || desc.includes('blocked') || data.error_code === 403) {
      if (desc.includes('Unauthorized') || data.error_code === 401) {
        throw new Error('Token do Telegram inválido.');
      }
      if (desc.includes('chat not found') || data.error_code === 400) {
        throw new Error('Chat não encontrado. Verifique se o bot está no grupo/canal como administrador e se o Chat ID está correto.');
      }
      if (desc.includes('forbidden') || desc.includes('blocked') || data.error_code === 403) {
        throw new Error('O bot foi bloqueado ou não tem permissão para enviar mensagens no canal/grupo.');
      }
    }

    // Fallback: envia a imagem como link inline no texto
    await sendTelegramMessage(
      cleanToken,
      cleanChatId,
      `${caption}\n\n🖼️ [Ver imagem](${photoUrl})`,
      parseMode
    );
  }
}

/**
 * Envia uma oferta formatada de forma limpa para o Telegram.
 * Não usa parse_mode por padrão para evitar quebras causadas por caracteres especiais do título do produto.
 */
export async function sendTelegramOffer(
  botToken: string,
  chatId: string,
  offer: {
    name: string;
    originalPrice: number;
    salePrice: number;
    coupon?: string;
    image?: string;
    trackingLink: string;
    affiliateLink?: string;
  }
): Promise<void> {
  const cleanToken = String(botToken).trim();
  const cleanChatId = String(chatId).trim();

  if (!cleanToken) {
    throw new Error('Token do Telegram inválido.');
  }
  if (!cleanChatId) {
    throw new Error('Chat ID inválido.');
  }

  const finalUrl = FEATURES.useDirectAffiliateLinkInChannels
    ? offer.affiliateLink || offer.trackingLink
    : offer.trackingLink;

  if (!finalUrl || !finalUrl.trim().startsWith('http')) {
    throw new Error('Link de afiliado ausente. Não foi possível disparar a oferta.');
  }

  const couponText = offer.coupon && offer.coupon.trim() ? `\nCupom: ${offer.coupon}` : '';
  const originalPriceText = offer.originalPrice && offer.originalPrice > 0
    ? `De: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.originalPrice)}\n`
    : '';
  const salePriceFormatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(offer.salePrice);

  const messageText = 
`🔥 OFERTA ENCONTRADA

${offer.name}

${originalPriceText}Por: ${salePriceFormatted}${couponText}

Comprar agora:
${finalUrl}`;

  const hasImage = offer.image && 
                   offer.image.trim() !== '' && 
                   offer.image.trim() !== 'null' && 
                   offer.image.trim() !== 'undefined' && 
                   offer.image.trim().startsWith('http');

  const sendPromise = hasImage
    ? sendTelegramPhoto(cleanToken, cleanChatId, offer.image!.trim(), messageText, undefined)
    : sendTelegramMessage(cleanToken, cleanChatId, messageText, undefined);

  // Timeout de 15 segundos para o Telegram
  await withTimeout(sendPromise, 15000, 'Envio Telegram');
}

// ────────────────────────────────────────────────────
// Validação e Teste de Conexão
// ────────────────────────────────────────────────────

/**
 * Valida um Bot Token e Chat ID chamando getMe + getChat.
 * Retorna { valid: true, botName } em caso de sucesso.
 * NÃO expõe o token completo em mensagens de erro.
 */
export async function validateTelegramBot(
  botToken: string,
  chatId: string
): Promise<{ valid: boolean; botName?: string; error?: string }> {
  const cleanToken = String(botToken).trim();
  const cleanChatId = String(chatId).trim();
  try {
    // 1. Valida o token via getMe
    const meRes = await fetch(apiUrl(cleanToken, 'getMe'));
    const meData = await meRes.json();
    if (!meData.ok) {
      return { valid: false, error: 'Token inválido. Verifique o token gerado pelo @BotFather.' };
    }

    const botName = meData.result?.first_name ?? 'Bot';

    // 2. Valida o acesso ao chat via getChat
    const chatRes = await fetch(apiUrl(cleanToken, 'getChat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cleanChatId }),
    });
    const chatData = await chatRes.json();
    if (!chatData.ok) {
      return {
        valid: false,
        error: 'Chat ID inválido ou bot sem acesso. Adicione o bot como administrador do canal/grupo.',
      };
    }

    return { valid: true, botName };
  } catch {
    return { valid: false, error: 'Erro de rede ao validar o bot do Telegram.' };
  }
}

/**
 * Envia mensagem de teste para confirmar que o canal Telegram funciona.
 * Retorna { success, error? }.
 */
export async function testTelegramConnection(
  botToken: string,
  chatId: string
): Promise<{ success: boolean; error?: string }> {
  const cleanToken = String(botToken).trim();
  const cleanChatId = String(chatId).trim();
  try {
    await sendTelegramMessage(
      cleanToken,
      cleanChatId,
      '✅ *Link Oferta conectado com sucesso!*\n\nSeu canal Telegram está pronto para receber ofertas.'
    );
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Erro desconhecido ao testar a conexão.' };
  }
}
