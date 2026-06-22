import { ChannelType } from '../types';
import { formatCurrency } from '../lib/utils';

function escapeHTML(text: string): string {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTelegramHTML(text: string): string {
  if (!text) return '';
  let formatted = text;
  
  // 1. Links markdown: [texto](url) -> <a href="url">texto</a>
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, anchorText, url) => {
    const safeUrl = url.replace(/&amp;/g, '&').replace(/&/g, '&amp;');
    return `<a href="${safeUrl}">${anchorText}</a>`;
  });
  
  // 2. Negrito: **texto** ou *texto* -> <b>texto</b>
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<b>$1</b>');
  
  // 3. Itálico: _texto_ -> <i>texto</i>
  formatted = formatted.replace(/_([^_]+)_/g, '<i>$1</i>');
  
  // 4. Riscado: ~texto~ -> <s>texto</s>
  formatted = formatted.replace(/~([^~]+)~/g, '<s>$1</s>');
  
  return formatted;
}

function formatDiscordMarkdown(text: string): string {
  if (!text) return '';
  let formatted = text;
  
  // Riscado: ~texto~ ou ~~texto~~ -> ~~texto~~
  formatted = formatted.replace(/~~([^~]+)~~/g, '~~$1~~');
  formatted = formatted.replace(/(?<!~)~([^~]+)~(?!~)/g, '~~$1~~');
  
  // Negrito: **texto** ou *texto* -> **texto**
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '**$1**');
  formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '**$1**');
  
  return formatted;
}

function formatWhatsAppText(text: string): string {
  if (!text) return '';
  let formatted = text;
  
  // Links markdown: [texto](url) -> texto:\nurl
  formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1:\n$2');
  
  // Negrito: **texto** -> *texto*
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '*$1*');
  
  return formatted;
}

export const TemplateService = {
  /**
   * Retorna o template padrão para um tipo de canal
   */
  getDefaultTemplate(channelType: ChannelType): string {
    switch (channelType) {
      case 'whatsapp':
        return `🔥 *OFERTA ENCONTRADA*
 
*{titulo}*
 
{preco_original_linha}
💰 *Por:* {preco_promocional}
{cupom_linha}
 
👉 Comprar agora:
{link}`;
 
      case 'telegram':
        return `🔥 OFERTA ENCONTRADA
 
{titulo}
 
{preco_original_linha}
💰 Por: {preco_promocional}
{cupom_linha}
 
Comprar agora:
{link}`;
 
      case 'discord':
        return `🔥 OFERTA ENCONTRADA
 
{titulo}
 
{preco_original_linha}
💰 Por: {preco_promocional}
{cupom_linha}
 
Comprar agora:
{link}`;
 
      default:
        return `{titulo} - {preco_promocional} {link}`;
    }
  },

  /**
   * Substitui as variáveis dinâmicas do template por dados reais da oferta e do afiliado
   */
  renderTemplate(template: string, offer: any, userProfile: any, trackingLink: string, channelType?: string): string {
    if (!template) return '';

    // Extrair valores com segurança e resiliência de chaves
    const originalPriceCents = offer.originalPrice !== undefined
      ? parseFloat(offer.originalPrice)
      : (offer.original_price ? parseFloat(offer.original_price) : 0);

    const salePriceCents = offer.salePrice !== undefined
      ? parseFloat(offer.salePrice)
      : (offer.sale_price ? parseFloat(offer.sale_price) : 0);

    const originalPriceFormatted = originalPriceCents > 0
      ? formatCurrency(originalPriceCents)
      : '';

    const salePriceFormatted = salePriceCents > 0
      ? formatCurrency(salePriceCents)
      : '';

    const type = (channelType || '').toLowerCase();
    const isTelegram = type === 'telegram';
    const isDiscord = type === 'discord';
    const isWhatsApp = type === 'whatsapp';

    let couponVal = offer.coupon && offer.coupon !== 'null' && offer.coupon !== 'undefined'
      ? offer.coupon.trim()
      : '';

    let marketplaceVal = offer.marketplace && offer.marketplace !== 'null' && offer.marketplace !== 'undefined'
      ? offer.marketplace.trim()
      : '';

    let categoryVal = offer.category && offer.category !== 'null' && offer.category !== 'undefined'
      ? offer.category.trim()
      : '';

    const discountVal = offer.discount
      ? parseInt(String(offer.discount))
      : (originalPriceCents > salePriceCents && originalPriceCents > 0
        ? Math.round((1 - (salePriceCents / originalPriceCents)) * 100)
        : 0);

    let titleVal = offer.name || offer.offerName || offer.title || '';
    const imageVal = offer.image || offer.offerImage || offer.imageUrl || '';
    let affiliateName = userProfile?.full_name || userProfile?.preferred_name || 'Afiliado';
    let vitrineName = userProfile?.public_name || userProfile?.public_display_name || userProfile?.username || 'Vitrine';

    if (isTelegram) {
      titleVal = escapeHTML(titleVal);
      couponVal = escapeHTML(couponVal);
      marketplaceVal = escapeHTML(marketplaceVal);
      categoryVal = escapeHTML(categoryVal);
      affiliateName = escapeHTML(affiliateName);
      vitrineName = escapeHTML(vitrineName);
    }

    const dateVal = new Date().toLocaleDateString('pt-BR');
    const timeVal = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    let rendered = template;

    // Substituir aliases/versões antigas
    rendered = rendered
      .replace(/{{titulo}}/g, '{titulo}')
      .replace(/{{preco_original}}/g, '{preco_original}')
      .replace(/{{preco_promocional}}/g, '{preco_promocional}')
      .replace(/{{cupom}}/g, '{cupom}')
      .replace(/{{link}}/g, '{link}');

    // 1. Substituir Linhas Inteligentes
    const originalPriceLine = originalPriceCents > 0
      ? (isDiscord ? `De: ~~${originalPriceFormatted}~~` : `De: ~${originalPriceFormatted}~`)
      : '';
    rendered = rendered.replace(/{preco_original_linha}/g, originalPriceLine);

    const couponLine = couponVal
      ? (isDiscord ? `🎟️ **Cupom:** \`${couponVal}\`` : `🎟️ Cupom: *${couponVal}*`)
      : '';
    rendered = rendered.replace(/{cupom_linha}/g, couponLine);

    const discountLine = discountVal > 0
      ? (isDiscord ? `🔥 **${discountVal}% OFF**` : `🔥 *${discountVal}% OFF*`)
      : '';
    rendered = rendered.replace(/{desconto_linha}/g, discountLine);

    const marketplaceLine = marketplaceVal
      ? (isDiscord ? `🛒 **Marketplace:** ${marketplaceVal.toUpperCase()}` : `🛒 Marketplace: *${marketplaceVal.toUpperCase()}*`)
      : '';
    rendered = rendered.replace(/{marketplace_linha}/g, marketplaceLine);

    const categoryLine = categoryVal
      ? (isDiscord ? `📁 **Categoria:** ${categoryVal}` : `📁 Categoria: *${categoryVal}*`)
      : '';
    rendered = rendered.replace(/{categoria_linha}/g, categoryLine);

    const imageLine = imageVal
      ? (isDiscord ? `🖼️ **Imagem:** ${imageVal}` : `🖼️ Imagem: ${imageVal}`)
      : '';
    rendered = rendered.replace(/{imagem_linha}/g, imageLine);

    // 2. Substituir Variáveis Simples
    rendered = rendered
      .replace(/{titulo}/g, titleVal)
      .replace(/{preco_original}/g, originalPriceFormatted)
      .replace(/{preco_promocional}/g, salePriceFormatted)
      .replace(/{desconto}/g, discountVal > 0 ? `${discountVal}%` : '')
      .replace(/{cupom}/g, couponVal)
      .replace(/{marketplace}/g, marketplaceVal.toUpperCase())
      .replace(/{categoria}/g, categoryVal)
      .replace(/{link}/g, trackingLink)
      .replace(/{imagem}/g, imageVal)
      .replace(/{nome_afiliado}/g, affiliateName)
      .replace(/{nome_vitrine}/g, vitrineName)
      .replace(/{data}/g, dateVal)
      .replace(/{hora}/g, timeVal);

    // 3. Limpeza de Linhas Vazias e Espaços Extras
    rendered = rendered.replace(/\n{3,}/g, '\n\n');

    rendered = rendered
      .split('\n')
      .filter((line, i, arr) => {
        if (line.trim() === '') {
          return i === 0 || arr[i - 1].trim() !== '';
        }
        return true;
      })
      .join('\n')
      .trim();

    // 4. Formatação pós-processamento específica por canal
    if (isTelegram) {
      rendered = formatTelegramHTML(rendered);
    } else if (isDiscord) {
      rendered = formatDiscordMarkdown(rendered);
    } else if (isWhatsApp) {
      rendered = formatWhatsAppText(rendered);
    }

    return rendered;
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

    // Validar variáveis inválidas ou desconhecidas (qualquer chave {nome} não listada)
    const validVariables = this.listAvailableVariables().map(v => v.name);
    const matches = template.match(/{[a-zA-Z0-9_]+}/g) || [];
    for (const match of matches) {
      if (!validVariables.includes(match)) {
        return { valid: false, error: `Variável desconhecida encontrada: ${match}` };
      }
    }

    return { valid: true };
  },

  /**
   * Retorna a lista de variáveis dinâmicas disponíveis
   */
  listAvailableVariables(): { name: string; description: string }[] {
    return [
      { name: '{titulo}', description: 'Título/Nome da oferta' },
      { name: '{preco_original}', description: 'Preço original (sem formatação de riscado)' },
      { name: '{preco_promocional}', description: 'Preço com desconto' },
      { name: '{desconto}', description: 'Percentual do desconto (Ex: 15% OFF)' },
      { name: '{cupom}', description: 'Cupom de desconto (se houver)' },
      { name: '{marketplace}', description: 'Nome do marketplace (Ex: AMAZON)' },
      { name: '{categoria}', description: 'Categoria da oferta' },
      { name: '{link}', description: 'Link de afiliado direto' },
      { name: '{imagem}', description: 'URL da imagem da oferta' },
      { name: '{nome_afiliado}', description: 'Nome do afiliado' },
      { name: '{nome_vitrine}', description: 'Nome do catálogo público' },
      { name: '{data}', description: 'Data do disparo (DD/MM/YYYY)' },
      { name: '{hora}', description: 'Hora do disparo (HH:MM)' },
      { name: '{preco_original_linha}', description: 'Linha inteligente: De: ~Preço~ (oculta se vazio)' },
      { name: '{cupom_linha}', description: 'Linha inteligente: Cupom: CUPOM (oculta se vazio)' },
      { name: '{desconto_linha}', description: 'Linha inteligente: 🔥 15% OFF (oculta se vazio)' },
      { name: '{marketplace_linha}', description: 'Linha inteligente: Marketplace: LOJA (oculta se vazio)' },
      { name: '{categoria_linha}', description: 'Linha inteligente: Categoria: CAT (oculta se vazio)' },
      { name: '{imagem_linha}', description: 'Linha inteligente: Imagem: URL (oculta se vazio)' }
    ];
  }
};
