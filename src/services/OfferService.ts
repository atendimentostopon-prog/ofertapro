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
