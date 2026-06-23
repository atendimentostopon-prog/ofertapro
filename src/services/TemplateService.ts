import { ChannelType } from '../types';
import { formatCurrency } from '../lib/utils';
import { supabase } from '../lib/supabase';

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

💎 *{titulo}*

{preco_original_linha}
✅ *Por apenas:* {preco_promocional}

{cupom_linha}

🛒 *Marketplace:* {marketplace}

🔗 Comprar agora:
{link}`;
 
      case 'telegram':
        return `🔥 **OFERTA ENCONTRADA**

💎 **{titulo}**

{preco_original_linha}
✅ **Por apenas:** {preco_promocional}

{cupom_linha}

🛒 **Marketplace:** {marketplace}
🔗 [Comprar agora]({link})`;
 
      case 'discord':
        return `🔥 **OFERTA ENCONTRADA**

💎 **{titulo}**

{preco_original_linha}
✅ **Por apenas:** {preco_promocional}

{cupom_linha}

🛒 **Marketplace:** {marketplace}
🔗 [Comprar agora]({link})`;
 
      default:
        return `{titulo} - {preco_promocional} {link}`;
    }
  },

  /**
   * Recupera todos os templates salvos no banco de dados para o usuário.
   * Se não houver registro, retorna o template padrão de cada canal.
   */
  async getTemplates(userId: string): Promise<Record<string, string>> {
    const templates: Record<string, string> = {
      telegram: this.getDefaultTemplate('telegram'),
      discord: this.getDefaultTemplate('discord'),
      whatsapp: this.getDefaultTemplate('whatsapp')
    };

    try {
      // Tenta buscar da tabela dedicada message_templates com timeout
      const result = await Promise.race([
        supabase.from('message_templates').select('*').eq('user_id', userId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000))
      ]) as any;

      if (!result.error && result.data) {
        result.data.forEach((row: any) => {
          if (row.channel_type && row.template_text) {
            templates[row.channel_type] = row.template_text;
          }
        });
        return templates;
      }
    } catch (err) {
      console.warn('message_templates indisponível, tentando user_settings...', err);
    }

    // Fallback: buscar de user_settings (tabela legada)
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('whatsapp_template, telegram_template, discord_template')
        .eq('user_id', userId)
        .maybeSingle();

      if (data) {
        if (data.whatsapp_template) templates.whatsapp = data.whatsapp_template;
        if (data.telegram_template) templates.telegram = data.telegram_template;
        if (data.discord_template) templates.discord = data.discord_template;
      }
    } catch (err) {
      console.error('Erro ao buscar templates no fallback user_settings:', err);
    }

    return templates;
  },

  /**
   * Recupera o template de um canal específico para o usuário.
   */
  async getTemplateByChannel(userId: string, channelType: string): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('message_templates')
        .select('template_text')
        .eq('user_id', userId)
        .eq('channel_type', channelType)
        .maybeSingle();

      if (error) throw error;
      if (data?.template_text) {
        return data.template_text;
      }
    } catch (err) {
      console.error(`Erro ao buscar template de ${channelType} no TemplateService:`, err);
    }
    return this.getDefaultTemplate(channelType as any);
  },

  /**
   * Salva o template de um canal específico no banco utilizando upsert.
   * Tenta primeiro em message_templates; se falhar, usa user_settings como fallback.
   */
  async saveTemplate(userId: string, channelType: string, templateText: string): Promise<void> {
    // Tenta salvar na tabela dedicada com timeout
    try {
      const { error } = await Promise.race([
        supabase
          .from('message_templates')
          .upsert(
            {
              user_id: userId,
              channel_type: channelType,
              template_text: templateText,
              status: 'active',
              updated_at: new Date().toISOString()
            },
            { onConflict: 'user_id,channel_type' }
          ),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 8000))
      ]) as any;

      if (!error) {
        console.log(`[TemplateService] Template de ${channelType} salvo em message_templates.`);
        return;
      }
      console.warn(`[TemplateService] Erro em message_templates (${error.message}), usando fallback...`);
    } catch (err) {
      console.warn('[TemplateService] message_templates indisponível, usando fallback user_settings...', err);
    }

    // Fallback: salvar em user_settings (tabela que sempre existe)
    const col = channelType === 'telegram' ? 'telegram_template'
      : channelType === 'discord' ? 'discord_template'
      : 'whatsapp_template';

    const { error: fallbackError } = await supabase
      .from('user_settings')
      .upsert(
        { user_id: userId, [col]: templateText, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (fallbackError) {
      throw new Error(`Erro ao salvar template: ${fallbackError.message}`);
    }
    console.log(`[TemplateService] Template de ${channelType} salvo no fallback user_settings.`);
  },

  /**
   * Remove o template customizado do banco de dados e retorna o padrão.
   */
  async restoreDefaultTemplate(userId: string, channelType: string): Promise<string> {
    // Tenta deletar de message_templates com timeout (sem lançar erro se falhar)
    try {
      await Promise.race([
        supabase
          .from('message_templates')
          .delete()
          .eq('user_id', userId)
          .eq('channel_type', channelType),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000))
      ]);
    } catch (err) {
      console.warn('[TemplateService] Falha ao deletar de message_templates (ignorado):', err);
    }

    // Limpa também no user_settings fallback
    try {
      const col = channelType === 'telegram' ? 'telegram_template'
        : channelType === 'discord' ? 'discord_template'
        : 'whatsapp_template';
      await supabase
        .from('user_settings')
        .update({ [col]: null })
        .eq('user_id', userId);
    } catch {}

    return this.getDefaultTemplate(channelType as any);
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
    let descriptionVal = offer.description || offer.headline || offer.copy || '';
    if (isTelegram) {
      descriptionVal = escapeHTML(descriptionVal);
    }

    rendered = rendered
      .replace(/{titulo}/g, titleVal)
      .replace(/{chamada}/g, descriptionVal)
      .replace(/{preco_original}/g, originalPriceFormatted)
      .replace(/{preco_promocional}/g, salePriceFormatted)
      .replace(/{desconto}/g, discountVal > 0 ? `${discountVal}%` : '')
      .replace(/{cupom}/g, couponVal)
      .replace(/{marketplace}/g, marketplaceVal.toUpperCase())
      .replace(/{categoria}/g, categoryVal)
      .replace(/{link}/g, trackingLink)
      .replace(/{imagem}/g, imageVal)
      .replace(/{nome_afiliado}/g, '')   // Removido: não exibir nome do afiliado
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
      { name: '{chamada}', description: 'Descrição/chamada criativa (slogan/copy)' },
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
