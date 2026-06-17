import { supabase } from '../lib/supabase';

interface FeedbackData {
  type: 'Bug' | 'Sugestão' | 'Dúvida' | 'Elogio';
  rating: number;
  message: string;
  page?: string;
  metadata?: Record<string, any>;
}

interface EventData {
  event_type: string;
  page?: string;
  message?: string;
  metadata?: Record<string, any>;
}

export const FeedbackService = {
  /**
   * Envia um feedback do usuário beta para o Supabase
   */
  async sendFeedback(data: FeedbackData): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Usuário não autenticado para envio de feedback.');
      }

      const { error } = await supabase.from('beta_feedback').insert({
        user_id: user.id,
        type: data.type,
        rating: data.rating,
        message: data.message,
        page: data.page || window.location.pathname,
        metadata: data.metadata || {}
      });

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (err: any) {
      console.warn('Falha silenciosa ao enviar feedback:', err.message || err);
      return { success: false, error: err.message || 'Erro inesperado' };
    }
  },

  /**
   * Registra um evento de telemetria/analytics de forma resiliente
   */
  async logEvent(data: EventData): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      // Higienização leve para evitar tokens ou dados sensíveis em metadata
      const cleanMetadata = { ...(data.metadata || {}) };
      
      // Remover propriedades com suspeita de chaves/tokens
      const sensitiveKeys = ['token', 'bot_token', 'webhook', 'password', 'key', 'secret', 'auth'];
      Object.keys(cleanMetadata).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (sensitiveKeys.some(s => lowerKey.includes(s))) {
          cleanMetadata[key] = '[MASCARADO/REMOVIDO]';
        }
      });

      const { error } = await supabase.from('app_events').insert({
        user_id: userId,
        event_type: data.event_type,
        page: data.page || window.location.pathname,
        message: data.message || '',
        metadata: cleanMetadata
      });

      if (error) {
        // Apenas loga no console interno de desenvolvimento
        console.warn('Erro ao inserir evento no Supabase:', error.message);
      }
    } catch (err: any) {
      // Falha silenciosa absoluta para garantir que não interrompa o fluxo do usuário
      console.warn('Falha silenciosa absoluta de telemetria:', err.message || err);
    }
  }
};
