import { supabase } from '../lib/supabase';
import { testTelegramConnection, validateTelegramBot } from '../lib/telegram';

export type ValidationStatus = 'valid' | 'invalid' | 'unavailable';

export interface ValidationResult<T = Record<string, never>> {
  status: ValidationStatus;
  message: string;
  checkedAt: string;
  evidence?: T;
}

export type ShopeeMode = 'manual' | 'api';

export interface MarketplaceSettingsInput {
  amazonTag: string;
  shopeeMode: ShopeeMode;
  shopeeAppId?: string;
  shopeeAppSecret?: string;
  mercadolivreTag: string;
}

export interface MarketplaceEvidence {
  amazonTag: string;
  shopeeMode: ShopeeMode;
  shopeeCredentialsStored: boolean;
  mercadolivreTag: string;
  apiConnectionTested: false;
}

const checkedAt = () => new Date().toISOString();

const valid = <T>(message: string, evidence?: T): ValidationResult<T> => ({
  status: 'valid', message, checkedAt: checkedAt(), evidence,
});

const invalid = <T>(message: string, evidence?: T): ValidationResult<T> => ({
  status: 'invalid', message, checkedAt: checkedAt(), evidence,
});

const unavailable = <T>(message: string, evidence?: T): ValidationResult<T> => ({
  status: 'unavailable', message, checkedAt: checkedAt(), evidence,
});

/**
 * O worker que processa bot_requests não está neste repositório e não expõe
 * um endpoint para provar que a sessão consegue listar diálogos. Não inferimos
 * sucesso a partir de status ou campos salvos.
 */
export async function validateTelegramPersonalSession(): Promise<ValidationResult> {
  return unavailable(
    'Não foi possível testar a sessão pessoal: o worker do Telegram não oferece um endpoint de validação neste ambiente.'
  );
}

/** Pelo mesmo motivo, um nome salvo em grupos_origem não comprova leitura. */
export async function validateTelegramSourceRead(): Promise<ValidationResult> {
  return unavailable(
    'Não foi possível testar a leitura do canal de origem: falta um endpoint do worker que leia uma mensagem recente.'
  );
}

export async function validateTelegramDestination(
  botToken: string,
  chatId: string,
  options: { sendTestMessage?: boolean } = {}
): Promise<ValidationResult<{ botName?: string; chatAccessible: boolean; testMessageSent: boolean }>> {
  if (!botToken.trim() || !chatId.trim()) {
    return invalid('Informe o token do BotFather e o Chat ID do destino.');
  }

  const bot = await validateTelegramBot(botToken, chatId);
  if (!bot.valid) {
    return invalid(bot.error || 'O bot ou o destino do Telegram não pôde ser validado.', {
      botName: bot.botName,
      chatAccessible: false,
      testMessageSent: false,
    });
  }

  if (options.sendTestMessage) {
    const test = await testTelegramConnection(botToken, chatId);
    if (!test.success) {
      return invalid(test.error || 'O bot acessa o destino, mas não conseguiu enviar a mensagem de teste.', {
        botName: bot.botName,
        chatAccessible: true,
        testMessageSent: false,
      });
    }
  }

  return valid(
    options.sendTestMessage
      ? 'Bot validado e mensagem de teste enviada com sucesso.'
      : 'Token e acesso ao destino validados com sucesso.',
    { botName: bot.botName, chatAccessible: true, testMessageSent: Boolean(options.sendTestMessage) }
  );
}

export async function validateWhatsAppDestinations(
  userId: string
): Promise<ValidationResult<{ connectedInstances: number; selectedDestinations: number }>> {
  if (!userId) return invalid('Usuário não autenticado.');

  const { data: instances, error: instanceError } = await supabase
    .from('whatsapp_instances')
    .select('id, status')
    .eq('user_id', userId);

  if (instanceError) {
    return unavailable(`Não foi possível consultar a conexão do WhatsApp: ${instanceError.message}`);
  }

  const checkedInstances = await Promise.all((instances || []).map(async (instance) => {
    const { data, error } = await supabase.functions.invoke('evolution-instance-status', {
      body: { whatsapp_instance_id: instance.id },
    });
    return { id: instance.id, status: data?.data?.status as string | undefined, error };
  }));

  const statusError = checkedInstances.find((instance) => instance.error)?.error;
  if (statusError) {
    return unavailable(`Não foi possível confirmar o estado do WhatsApp na Evolution: ${statusError.message}`);
  }

  const connectedIds = checkedInstances
    .filter((instance) => instance.status === 'connected')
    .map((instance) => instance.id);
  if (connectedIds.length === 0) {
    return invalid('Conecte uma conta do WhatsApp antes de configurar os destinos.', {
      connectedInstances: 0,
      selectedDestinations: 0,
    });
  }

  const { data: groups, error: groupsError } = await supabase
    .from('whatsapp_groups')
    .select('id')
    .eq('user_id', userId)
    .eq('is_selected', true)
    .eq('status', 'available')
    .in('whatsapp_instance_id', connectedIds);

  if (groupsError) {
    return unavailable(`A conta está conectada, mas não foi possível consultar os grupos: ${groupsError.message}`, {
      connectedInstances: connectedIds.length,
      selectedDestinations: 0,
    });
  }

  const selectedDestinations = groups?.length || 0;
  if (selectedDestinations === 0) {
    return invalid('A conta está conectada, mas selecione ao menos um grupo de destino.', {
      connectedInstances: connectedIds.length,
      selectedDestinations,
    });
  }

  return valid('WhatsApp conectado e com ao menos um grupo de destino selecionado.', {
    connectedInstances: connectedIds.length,
    selectedDestinations,
  });
}

// Regras conservadoras: rejeitam espaços/URLs, sem alegar validação externa.
const AFFILIATE_TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,79}$/;
const SHOPEE_CREDENTIAL_PATTERN = /^\S{4,200}$/;

export function validateMarketplaceSettings(
  input: MarketplaceSettingsInput
): ValidationResult<MarketplaceEvidence> {
  const amazonTag = input.amazonTag.trim();
  const mercadolivreTag = input.mercadolivreTag.trim();
  const appId = input.shopeeAppId?.trim() || '';
  const appSecret = input.shopeeAppSecret?.trim() || '';
  const evidence: MarketplaceEvidence = {
    amazonTag,
    shopeeMode: input.shopeeMode,
    shopeeCredentialsStored: Boolean(appId && appSecret),
    mercadolivreTag,
    apiConnectionTested: false,
  };

  if (!AFFILIATE_TAG_PATTERN.test(amazonTag)) {
    return invalid('Informe uma tag Amazon válida, sem espaços ou URL.', evidence);
  }
  if (!AFFILIATE_TAG_PATTERN.test(mercadolivreTag)) {
    return invalid('Informe uma etiqueta do Mercado Livre válida, sem espaços ou URL.', evidence);
  }
  if (input.shopeeMode === 'api') {
    if (!SHOPEE_CREDENTIAL_PATTERN.test(appId) || !SHOPEE_CREDENTIAL_PATTERN.test(appSecret)) {
      return invalid('No modo API, informe App ID e App Secret da Shopee.', evidence);
    }
    return valid(
      'Configurações válidas para persistência. As credenciais Shopee ainda não foram testadas contra a API externa.',
      evidence
    );
  }

  return valid('Tags válidas e modo manual da Shopee configurado.', evidence);
}

export async function saveMarketplaceSettings(
  userId: string,
  input: MarketplaceSettingsInput
): Promise<ValidationResult<MarketplaceEvidence>> {
  if (!userId) return invalid('Usuário não autenticado.');
  const validation = validateMarketplaceSettings(input);
  if (validation.status !== 'valid' || !validation.evidence) return validation;

  const { error } = await supabase
    .from('bot_configs')
    .update({
      amazon_tag: validation.evidence.amazonTag,
      shopee_app_id: input.shopeeMode === 'api' ? input.shopeeAppId?.trim() || null : null,
      shopee_app_secret: input.shopeeMode === 'api' ? input.shopeeAppSecret?.trim() || null : null,
      mercadolivre_tag: validation.evidence.mercadolivreTag,
    })
    .eq('user_id', userId);

  if (error) {
    return unavailable(`As configurações são válidas, mas não puderam ser salvas: ${error.message}`, validation.evidence);
  }

  return valid(
    input.shopeeMode === 'api'
      ? 'Configurações salvas. A conexão com a API Shopee continua pendente de um endpoint de teste.'
      : 'Configurações salvas com a Shopee em modo manual.',
    validation.evidence
  );
}

export const OnboardingValidationService = {
  validateTelegramPersonalSession,
  validateTelegramSourceRead,
  validateTelegramDestination,
  validateWhatsAppDestinations,
  validateMarketplaceSettings,
  saveMarketplaceSettings,
};
