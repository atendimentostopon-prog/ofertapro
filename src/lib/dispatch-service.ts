import { supabase } from './supabase';
import { evolution } from './evolution';
import { sender } from './sender';
import { sendTelegramMessage, sendTelegramPhoto, sendTelegramOffer } from './telegram';
import { TemplateService } from '../services/TemplateService';
import { DispatchResult, HistoryStatus, ChannelType } from '../types';
import { withTimeout } from './utils';
import { FEATURES } from '../config/features';
import { normalizeProductTitle } from '../services/ProductEnrichmentService';

interface DispatchParams {
  userId: string;
  offerId: string;
  offerName: string;
  offerImage: string;
  salePrice: number;
  originalPrice: number;
  discount: number;
  coupon?: string;
  affiliateLink: string;
  marketplace: string;
  description?: string;
  channelIds: string[];
  shortCode?: string;
  onChannelStart?: (channelName: string, channelType: string) => void;
  onStepChange?: (stepText: string) => void;
}

/**
 * Helper para aguardar um determinado tempo (delay/sleep)
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Executa uma ação assíncrona com mecanismo de retry automático
 */
async function executeWithRetry<T>(
  action: () => Promise<T>,
  retries: number = 2,
  delayMs: number = 500
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        console.warn(`Tentativa de envio falhou (tentativa ${attempt + 1}/${retries + 1}). Tentando novamente em ${delayMs}ms...`);
        await delay(delayMs);
      }
    }
  }
  throw lastError;
}

/**
 * Normaliza o status do envio para conformidade com a constraint do banco ('success', 'partial', 'error').
 */
export function normalizeHistoryStatus(status: any): 'success' | 'partial' | 'error' {
  if (!status) return 'error';
  const s = String(status).trim().toLowerCase();
  if (s === 'success' || s === 'sent') return 'success';
  if (s === 'partial') return 'partial';
  if (s === 'error' || s === 'failed') return 'error';
  return 'error';
}

export const dispatchOffer = async (params: DispatchParams) => {
  console.log("[DISPATCH] start");
  const { channelIds, userId, offerId, offerName, offerImage, marketplace, onChannelStart, onStepChange } = params;

  if (channelIds.length === 0) {
    console.log("[DISPATCH] finished", { status: 'success', results: [] });
    return { status: 'success' as const, results: [] as DispatchResult[] };
  }

  if (FEATURES.useDirectAffiliateLinkInChannels) {
    if (!params.affiliateLink || !params.affiliateLink.trim().startsWith('http')) {
      throw new Error('Link de Afiliado inválido ou ausente. O disparo direto requer um link de afiliado válido.');
    }
  }

  try {
    // Resolver ou gerar shortCode e link de afiliado se necessário
    let shortCode = params.shortCode;
    let finalAffiliateLink = params.affiliateLink;

    const { data: offerData, error: offerErr } = await supabase
      .from('offers')
      .select('short_code, affiliate_link, short_affiliate_url')
      .eq('id', offerId)
      .maybeSingle();

    if (!offerErr && offerData) {
      if (offerData.short_code) {
        shortCode = offerData.short_code;
      }
      finalAffiliateLink = offerData.short_affiliate_url || offerData.affiliate_link || finalAffiliateLink;
    }

    if (!shortCode) {
      console.log("[DISPATCH] shortCode ausente no banco de dados. Gerando dinamicamente...");
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let localCode = '';
      for (let i = 0; i < 6; i++) {
        localCode += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      // Tentar salvar no banco em background
      supabase
        .from('offers')
        .update({ short_code: localCode })
        .eq('id', offerId)
        .then(({ error }) => {
          if (error) console.error("[DISPATCH] erro ao salvar shortCode gerado em background:", error);
        });
      shortCode = localCode;
    }

    // 1. Buscar perfil do usuário e configurações de canais
    if (onStepChange) {
      onStepChange('Carregando informações do perfil e canais...');
    }

    const [profileRes, settingsRes, channelsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('channels').select('*').in('id', channelIds)
    ]);

    if (channelsRes.error) throw channelsRes.error;
    const channels = channelsRes.data || [];
    const profile = profileRes.data || { full_name: 'Afiliado' };
    const settings = settingsRes.data || null;

    console.log("[DISPATCH] channels count", channels.length);
    const results: DispatchResult[] = [];

    // 2. Loop sequencial controlado para disparar canal por canal de forma isolada
    for (const channel of channels) {
      console.log("[DISPATCH] channel start", channel.type, channel.name);
      const sentAt = new Date().toISOString();
      try {
        let renderedMessage = '';

        // --- WHATSAPP (Evolution API - Desativado Temporariamente) ---
        if (channel.type === 'whatsapp') {
          results.push({
            channelId: channel.id,
            channelName: channel.name,
            channelType: channel.type as ChannelType,
            success: true,
            status: 'sent',
            message: 'WhatsApp desativado temporariamente. O suporte completo virá em breve via Evolution API.',
            sentAt
          });
          continue;
        }

        // --- DISCORD (Webhook) ---
        else if (channel.type === 'discord') {
          console.log("[DISPATCH] discord start");
          if (!channel.identifier?.startsWith('http')) {
            throw new Error('Webhook do Discord inválido (URL ausente ou incorreta).');
          }

          const trackingLink = FEATURES.useDirectAffiliateLinkInChannels
            ? finalAffiliateLink
            : `${window.location.origin}/o/${shortCode}?src=discord`;

          const template = settings?.discord_template || TemplateService.getDefaultTemplate('discord');
          renderedMessage = TemplateService.renderTemplate(
            template,
            { ...params, offerName: normalizeProductTitle(offerName) },
            profile,
            trackingLink,
            'discord'
          );

          try {
            await executeWithRetry(async () => {
              await sender.sendToDiscord(channel.identifier, {
                ...params,
                offerId,
                offerName: normalizeProductTitle(offerName),
                offerImage,
                shortCode,
                customDescription: renderedMessage,
                affiliateLink: trackingLink
              });
            });
            console.log("[DISPATCH] discord success");
          } catch (error: any) {
            console.error("[DISPATCH] discord error", error);
            throw error;
          }
        }

        // --- TELEGRAM (Bot API) ---
        else if (channel.type === 'telegram') {
          console.log("[DISPATCH] telegram start");
          const chatId = channel.identifier;
          const botToken = channel.metadata?.bot_token;

          if (!botToken || !chatId) {
            throw new Error('Configuração do Telegram incompleta: token ou chat_id ausente.');
          }

          const trackingLink = FEATURES.useDirectAffiliateLinkInChannels
            ? finalAffiliateLink
            : `${window.location.origin}/o/${shortCode}?src=telegram`;

          const template = settings?.telegram_template || TemplateService.getDefaultTemplate('telegram');
          renderedMessage = TemplateService.renderTemplate(
            template,
            { ...params, offerName: normalizeProductTitle(offerName) },
            profile,
            trackingLink,
            'telegram'
          );

          const hasImage = offerImage &&
            offerImage.trim() !== '' &&
            offerImage.trim() !== 'null' &&
            offerImage.trim() !== 'undefined' &&
            offerImage.trim().startsWith('http');

          try {
            await executeWithRetry(async () => {
              if (hasImage) {
                await sendTelegramPhoto(botToken, chatId, offerImage.trim(), renderedMessage, 'HTML');
              } else {
                await sendTelegramMessage(botToken, chatId, renderedMessage, 'HTML');
              }
            });
            console.log("[DISPATCH] telegram success");
          } catch (error: any) {
            console.error("[DISPATCH] telegram error", error);
            throw error;
          }
        }

        // Registrar sucesso individual
        results.push({
          channelId: channel.id,
          channelName: channel.name,
          channelType: channel.type as ChannelType,
          success: true,
          status: 'sent',
          message: 'Mensagem enviada com sucesso.',
          sentAt
        });

      } catch (err: any) {
        console.error(`Erro ao disparar para canal ${channel.name}:`, err);

        let cleanErrorMessage = err?.message || 'Erro de conexão ou envio.';

        // Mascarar apenas se contiver segredos sensíveis como o bot token real ou URL confidenciais expostas
        const hasSensitiveToken = /bot[0-9]+:[a-zA-Z0-9_-]+/i.test(cleanErrorMessage);
        const hasApiUrl = cleanErrorMessage.includes('api.telegram.org/bot');
        const hasEvolutionKey = cleanErrorMessage.includes('evolution') && (cleanErrorMessage.includes('apikey') || cleanErrorMessage.includes('http'));

        if (hasSensitiveToken || hasApiUrl) {
          cleanErrorMessage = 'Falha ao conectar com o Telegram. Verifique as credenciais.';
        } else if (hasEvolutionKey) {
          cleanErrorMessage = 'Falha ao conectar com o serviço de envio WhatsApp. Verifique as credenciais.';
        }

        if (cleanErrorMessage.includes('discord.com/api/webhooks')) {
          cleanErrorMessage = cleanErrorMessage.replace(/discord\.com\/api\/webhooks\/[^\s]+/g, 'discord.com/api/webhooks/***');
        }

        results.push({
          channelId: channel.id,
          channelName: channel.name,
          channelType: channel.type as ChannelType,
          success: false,
          status: 'failed',
          message: cleanErrorMessage,
          errorMessage: cleanErrorMessage,
          error: cleanErrorMessage,
          sentAt
        });
      }

      await delay(200);
    }

    // 3. Computar Resumo de Envio
    const successfulChannels = results.filter(r => r.success).map(r => r.channelName);
    const failedChannels = results.filter(r => !r.success);

    let finalStatus: 'success' | 'partial' | 'error' = 'success';
    if (failedChannels.length > 0) {
      finalStatus = successfulChannels.length > 0 ? 'partial' : 'error';
    }

    const errorMessage = failedChannels.length > 0
      ? `Falha no envio para: ${failedChannels.map(f => f.channelName).join(', ')}`
      : undefined;

    const dispatchResult = {
      status: finalStatus,
      results
    };
    console.log("[DISPATCH] finished", dispatchResult);

    // 4. Salvar no Histórico com Mecanismo de Fallback e Timeout de 10 segundos
    if (onStepChange) {
      onStepChange('Registrando histórico do disparo...');
    }

    const historyPayload = {
      user_id: userId,
      offer_id: offerId,
      offer_name: offerName,
      offer_image: offerImage,
      marketplace: marketplace,
      successful_channels: successfulChannels,
      failed_channels: failedChannels.map(f => f.channelName),
      success_count: successfulChannels.length,
      failure_count: failedChannels.length,
      dispatch_results: results,
      channels: successfulChannels,
      channel_count: successfulChannels.length,
      status: normalizeHistoryStatus(finalStatus),
      error: errorMessage
    };

    console.log("[HISTORY] create start");
    try {
      const historyPromise = (async () => {
        try {
          const { error: historyError } = await supabase.from('history').insert(historyPayload);
          if (historyError) throw historyError;
          console.log("[HISTORY] create success");
        } catch (dbError: any) {
          console.warn('Falha ao registrar histórico detalhado (provavelmente colunas ausentes no banco). Executando fallback...', dbError);

          const fallbackPayload = {
            user_id: userId,
            offer_id: offerId,
            offer_name: offerName,
            offer_image: offerImage,
            marketplace: marketplace,
            channels: successfulChannels,
            channel_count: successfulChannels.length,
            status: normalizeHistoryStatus(finalStatus),
            error: errorMessage
          };

          const { error: fallbackError } = await supabase.from('history').insert(fallbackPayload);
          if (fallbackError) {
            console.error("[HISTORY] create error", fallbackError);
            throw fallbackError;
          }
          console.log("[HISTORY] create success");
        }
      })();

      await withTimeout(historyPromise, 10000, 'Registro de Histórico');
    } catch (historyErr: any) {
      console.error("[HISTORY] create error", historyErr);
      console.error('Falha crítica ao registrar histórico (fluxo prossegue):', historyErr);
    }

    return dispatchResult;

  } catch (err: any) {
    console.error('Erro geral no serviço de disparo:', err);
    const results = channelIds.map(id => ({
      channelId: id,
      channelName: 'Canal',
      channelType: 'telegram' as ChannelType,
      success: false,
      status: 'failed' as const,
      message: err?.message || 'Erro inesperado no serviço de disparo.',
      errorMessage: err?.message || 'Erro inesperado no serviço de disparo.',
      sentAt: new Date().toISOString()
    }));
    console.log("[DISPATCH] finished", { status: 'error', results });
    return {
      status: 'error' as const,
      results
    };
  }
};
