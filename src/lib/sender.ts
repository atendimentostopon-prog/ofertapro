import { withTimeout } from './utils';
import { FEATURES } from '../config/features';

interface DiscordEmbed {
  title: string;
  description?: string;
  url?: string;
  color?: number;
  fields?: { name: string; value: string; inline?: boolean }[];
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export const sender = {
  /**
   * Envia uma oferta para um Webhook do Discord.
   * Usa APENAS o template renderizado como description do embed,
   * sem duplicar dados em fields automáticos.
   */
  async sendToDiscord(webhookUrl: string, offer: any) {
    const trackingLink = FEATURES.useDirectAffiliateLinkInChannels && offer.affiliateLink
      ? offer.affiliateLink
      : (offer.shortCode 
        ? `${window.location.origin}/o/${offer.shortCode}?src=discord`
        : `${window.location.origin}/r/${offer.offerId}?src=discord`);

    const embed: DiscordEmbed = {
      title: offer.offerName,
      url: trackingLink,
      color: 0x4f46e5, // Indigo 600
      footer: {
        text: 'Link Oferta • Enviado via Painel',
      },
      timestamp: new Date().toISOString()
    };

    // Usar template renderizado como description (sem fields duplicados)
    const customDesc = offer.customDescription || offer.description;
    if (customDesc && customDesc.trim()) {
      embed.description = customDesc.trim();
    }

    if (offer.offerImage && 
        offer.offerImage.trim() !== '' && 
        offer.offerImage.trim() !== 'null' && 
        offer.offerImage.trim() !== 'undefined' && 
        offer.offerImage.trim().startsWith('http')) {
      embed.image = { url: offer.offerImage.trim() };
    }

    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      throw new Error('Webhook do Discord inválido ou ausente.');
    }

    const sendPromise = (async () => {
      let response: Response;
      try {
        const fetchPromise = fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [embed]
          })
        });
        response = await withTimeout(fetchPromise, 15000, "Envio Discord Fetch");
      } catch (err: any) {
        if (err.message && err.message.includes('[TIMEOUT]')) {
          throw err;
        }
        throw new Error('Erro de conexão ao enviar para o Discord.', { cause: err });
      }

      // HTTP 204 No Content é sucesso no Discord
      if (response.status === 204) {
        return true;
      }

      if (!response.ok) {
        let errorMessage = 'Erro ao enviar para o Discord';
        try {
          const responseText = await response.text();
          if (responseText) {
            try {
              const errorData = JSON.parse(responseText);
              errorMessage = errorData.message || responseText;
            } catch (_) {
              errorMessage = responseText;
            }
          }
        } catch (e) {
          // Ignorar falhas secundárias no tratamento de erros
        }
        throw new Error(`Discord respondeu com status ${response.status}: ${errorMessage}`);
      }

      return true;
    })();

    return withTimeout(sendPromise, 15000, 'Envio Discord');
  }
};

