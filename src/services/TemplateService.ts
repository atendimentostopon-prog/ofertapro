import { ChannelType } from '../types';
import { formatCurrency } from '../lib/utils';

export const TemplateService = {
  /**
   * Retorna o template padrão para um tipo de canal
   */
  getDefaultTemplate(channelType: ChannelType): string {
    switch (channelType) {
      case 'whatsapp':
        return `🔥 *OFERTA ENCONTRADA*

{titulo}

💰 *De:* ~{preco_original}~
✅ *Por apenas:* {preco_promocional}

🎟️ *Cupom:* {cupom}

🛒 *Marketplace:* {marketplace}
🔗 *Comprar agora:* {link}

📢 *Divulgado por:* {nome_afiliado}`;
      
      case 'telegram':
        return `🔥 *{titulo}*

💰 *De:* ~{preco_original}~
✅ *Por apenas:* {preco_promocional}

🎟️ *Cupom:* {cupom}

🛒 *Marketplace:* {marketplace}
🔗 [Comprar agora]({link})

📢 *Divulgado por:* {nome_afiliado}`;
      
      case 'discord':
        return `⚡ **NOVA OFERTA DISPONÍVEL!**

**{titulo}**
*{categoria}*

💰 **Preço:** {preco_promocional}
🏷️ **De:** ~~{preco_original}~~
🎟️ **Cupom:** \`{cupom}\`
🛒 **Marketplace:** {marketplace}

🔗 **Garanta aqui:** {link}`;
      
      default:
        return `{titulo} - {preco_promocional} {link}`;
    }
  },

  /**
   * Substitui as variáveis dinâmicas do template por dados reais da oferta e do afiliado
   */
  renderTemplate(template: string, offer: any, userProfile: any, trackingLink: string): string {
    if (!template) return '';

    const originalPriceFormatted = offer.originalPrice 
      ? formatCurrency(parseFloat(offer.originalPrice)) 
      : (offer.original_price ? formatCurrency(parseFloat(offer.original_price)) : 'R$ 0,00');
    
    const salePriceFormatted = offer.salePrice 
      ? formatCurrency(parseFloat(offer.salePrice)) 
      : (offer.sale_price ? formatCurrency(parseFloat(offer.sale_price)) : 'R$ 0,00');

    const couponVal = offer.coupon || 'Sem cupom necessário';
    const marketplaceVal = (offer.marketplace || '').toUpperCase();
    const categoryVal = offer.category || 'Geral';
    const discountVal = offer.discount ? `${offer.discount}% OFF` : 'Sem desconto';
    const titleVal = offer.name || offer.offerName || '';
    const affiliateName = userProfile?.full_name || 'Afiliado';

    return template
      .replace(/{titulo}/g, titleVal)
      .replace(/{preco_original}/g, originalPriceFormatted)
      .replace(/{preco_promocional}/g, salePriceFormatted)
      .replace(/{desconto}/g, discountVal)
      .replace(/{cupom}/g, couponVal)
      .replace(/{marketplace}/g, marketplaceVal)
      .replace(/{categoria}/g, categoryVal)
      .replace(/{link}/g, trackingLink)
      .replace(/{nome_afiliado}/g, affiliateName);
  },

  /**
   * Valida se um template de mensagem está correto
   */
  validateTemplate(template: string): { valid: boolean; error?: string } {
    if (!template || template.trim() === '') {
      return { valid: false, error: 'O template não pode ser vazio.' };
    }

    if (!template.includes('{link}')) {
      return { valid: false, error: 'O template deve conter a tag {link} para que os clientes consigam comprar.' };
    }

    if (!template.includes('{titulo}')) {
      return { valid: false, error: 'O template deve conter a tag {titulo} para identificar o produto.' };
    }

    return { valid: true };
  },

  /**
   * Retorna a lista de variáveis dinâmicas disponíveis
   */
  listAvailableVariables(): { name: string; description: string }[] {
    return [
      { name: '{titulo}', description: 'Título/Nome da oferta' },
      { name: '{preco_original}', description: 'Preço original (riscado)' },
      { name: '{preco_promocional}', description: 'Preço com desconto' },
      { name: '{desconto}', description: 'Percentual do desconto (Ex: 15% OFF)' },
      { name: '{cupom}', description: 'Cupom de desconto (se houver)' },
      { name: '{marketplace}', description: 'Nome do marketplace (Ex: AMAZON)' },
      { name: '{categoria}', description: 'Categoria da oferta' },
      { name: '{link}', description: 'Link de redirecionamento rastreável (obrigatório)' },
      { name: '{nome_afiliado}', description: 'Nome público do afiliado' }
    ];
  }
};
