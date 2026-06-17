import axios from 'axios';

const EVOLUTION_URL = import.meta.env.VITE_EVOLUTION_URL;
const EVOLUTION_API_KEY = import.meta.env.VITE_EVOLUTION_API_KEY;

const evolutionApi = axios.create({
  baseURL: EVOLUTION_URL,
  headers: {
    'apikey': EVOLUTION_API_KEY,
    'Content-Type': 'application/json',
  },
});

export const evolution = {
  // Criar ou recuperar instância baseada no ID do usuário
  async getOrCreateInstance(userId: string) {
    const instanceName = `ofertapro-${userId.substring(0, 8)}`;
    
    try {
      // Tentar buscar se já existe
      const { data } = await evolutionApi.get(`/instance/connectionStatus/${instanceName}`);
      return { instanceName, status: data.instance.state };
    } catch (err: any) {
      if (err.response?.status === 404) {
        // Criar nova instância
        await evolutionApi.post('/instance/create', {
          instanceName,
          token: userId.substring(0, 12), // Token opcional para a instância
          qrcode: true,
        });
        return { instanceName, status: 'close' };
      }
      throw err;
    }
  },

  // Obter QR Code (Base64)
  async getQrCode(instanceName: string) {
    const { data } = await evolutionApi.get(`/instance/connect/${instanceName}`);
    return data.code; // Retorna o base64 do QR Code
  },

  // Desconectar instância
  async logout(instanceName: string) {
    await evolutionApi.delete(`/instance/logout/${instanceName}`);
  },

  // Deletar instância
  async deleteInstance(instanceName: string) {
    await evolutionApi.delete(`/instance/delete/${instanceName}`);
  },

  // Enviar mensagem de texto
  async sendText(instanceName: string, number: string, text: string) {
    const { data } = await evolutionApi.post(`/message/sendText/${instanceName}`, {
      number,
      text,
      delay: 1200,
      linkPreview: true,
    });
    return data;
  },

  // Enviar mensagem com imagem e legenda
  async sendImage(instanceName: string, number: string, imageUrl: string, caption: string) {
    const { data } = await evolutionApi.post(`/message/sendMedia/${instanceName}`, {
      number,
      mediaMessage: {
        mediatype: 'image',
        caption,
        media: imageUrl,
      },
      delay: 1200,
    });
    return data;
  },
};
