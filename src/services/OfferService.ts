import { supabase } from '../lib/supabase';
import { Marketplace } from '../types';
import { withTimeout } from '../lib/utils';

export const OfferService = {
  async getOffers(userId: string) {
    const { data, error } = await supabase
      .from('offers')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  async createOffer(offerData: any) {
    console.time("[OFFER_SERVICE] createOffer");
    try {
      // Garantir tipos simples no payload
      const cleanedData = {
        user_id: offerData.user_id,
        name: offerData.name,
        image: typeof offerData.image === 'string' ? offerData.image : null,
        original_price: offerData.original_price,
        sale_price: offerData.sale_price,
        discount: offerData.discount,
        coupon: offerData.coupon || null,
        affiliate_link: offerData.affiliate_link,
        marketplace: offerData.marketplace,
        category: offerData.category,
        status: offerData.status,
        channels: offerData.channels || [],
      };

      const queryPromise = (async () => {
        const { data, error } = await supabase
          .from('offers')
          .insert(cleanedData)
          .select()
          .single();

        if (error) {
          console.error("[OFFER_SERVICE] create error detail:", {
            message: error.message,
            code: error.code,
            details: error.details
          });

          // Tratar erros comuns de forma clara
          if (error.code === '42501') {
            throw new Error('Permissão negada (RLS). Você não tem autorização para criar esta oferta.');
          }
          if (error.code === '42703') {
            throw new Error(`Coluna inexistente na tabela do banco de dados: ${error.message}`);
          }
          throw new Error(`Erro do Supabase (${error.code}): ${error.message}`);
        }
        return data;
      })();

      const result = await withTimeout(queryPromise, 15000, "Criar oferta no Supabase");
      console.timeEnd("[OFFER_SERVICE] createOffer");
      return result;
    } catch (error: any) {
      console.timeEnd("[OFFER_SERVICE] createOffer");
      console.error("[OFFER_SERVICE] create error", {
        message: error.message,
        code: error.code || 'UNKNOWN',
        details: error.details || ''
      });
      throw error;
    }
  },

  async updateOffer(id: string, offerData: any) {
    console.time("[OFFER_SERVICE] updateOffer");
    try {
      const cleanedData = {
        user_id: offerData.user_id,
        name: offerData.name,
        image: typeof offerData.image === 'string' ? offerData.image : null,
        original_price: offerData.original_price,
        sale_price: offerData.sale_price,
        discount: offerData.discount,
        coupon: offerData.coupon || null,
        affiliate_link: offerData.affiliate_link,
        marketplace: offerData.marketplace,
        category: offerData.category,
        status: offerData.status,
        channels: offerData.channels || [],
      };

      const queryPromise = (async () => {
        const { error } = await supabase
          .from('offers')
          .update(cleanedData)
          .eq('id', id);

        if (error) {
          console.error("[OFFER_SERVICE] update error detail:", {
            message: error.message,
            code: error.code,
            details: error.details
          });

          if (error.code === '42501') {
            throw new Error('Permissão negada (RLS). Você não tem autorização para atualizar esta oferta.');
          }
          if (error.code === '42703') {
            throw new Error(`Coluna inexistente na tabela do banco de dados: ${error.message}`);
          }
          throw new Error(`Erro do Supabase (${error.code}): ${error.message}`);
        }
      })();

      await withTimeout(queryPromise, 15000, "Atualizar oferta no Supabase");
      console.timeEnd("[OFFER_SERVICE] updateOffer");
    } catch (error: any) {
      console.timeEnd("[OFFER_SERVICE] updateOffer");
      console.error("[OFFER_SERVICE] update error", {
        message: error.message,
        code: error.code || 'UNKNOWN',
        details: error.details || ''
      });
      throw error;
    }
  },

  async deleteOffer(id: string) {
    try {
      // Buscar a oferta para obter a URL da imagem antes de deletar
      const { data: offerData } = await supabase
        .from('offers')
        .select('image')
        .eq('id', id)
        .single();

      if (offerData?.image) {
        const imageUrl = offerData.image;
        // Verificar se a imagem está hospedada no storage do Supabase
        if (imageUrl.includes('supabase.co/storage') || imageUrl.includes('/storage/v1/object/public/')) {
          const bucketIndicator = '/offers/';
          const indicatorIndex = imageUrl.indexOf(bucketIndicator);
          if (indicatorIndex !== -1) {
            const filePath = imageUrl.substring(indicatorIndex + bucketIndicator.length);
            if (filePath) {
              console.log('[OFFER_SERVICE] Tentando apagar imagem do storage:', filePath);
              // Deleta silenciosamente para não quebrar o fluxo principal se falhar ou se não tiver permissão
              await supabase.storage.from('offers').remove([filePath]);
              console.log('[OFFER_SERVICE] Imagem deletada do storage com sucesso.');
            }
          }
        }
      }
    } catch (storageErr) {
      console.error('[OFFER_SERVICE] Erro ao deletar imagem do storage:', storageErr);
      // Não joga erro para não quebrar a exclusão no banco de dados
    }

    const { error } = await supabase
      .from('offers')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  },

  async toggleStatus(id: string, currentStatus: string) {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    const { error } = await supabase
      .from('offers')
      .update({ status: newStatus })
      .eq('id', id);
    
    if (error) throw error;
    return newStatus;
  }
};
