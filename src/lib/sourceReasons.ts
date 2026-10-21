// Textos da atividade das fontes (source_messages.status / reason) para a aba Fontes e rotas.
export const REASON_LABELS: Record<string, string> = {
  no_access: 'Seu acesso está inativo. Assine um plano para voltar a disparar.',
  bot_paused: 'O bot está pausado.',
  outside_hours: 'Fora do horário de funcionamento do bot.',
  no_link: 'A mensagem não tinha link.',
  unsupported_marketplace: 'Loja ainda não suportada. Hoje lemos Amazon, Mercado Livre e Shopee.',
  missing_credentials: 'Falta a sua credencial de afiliado dessa loja. Configure na aba Bot.',
  ml_session_invalid: 'A sessão do Mercado Livre expirou. Abra a extensão do Aflyo e entre de novo.',
  conversion_failed: 'Não foi possível gerar o seu link de afiliado.',
  duplicate: 'Oferta repetida nas últimas 6 horas.',
  no_destination: 'Nenhum destino configurado. Marque os canais de destino na aba Bot.',
  no_price: 'Não encontramos o preço da oferta.',
};

const FALLBACK = 'Falha temporária. O Aflyo tenta de novo sozinho.';

export function reasonLabel(reason: string | null): string {
  if (!reason) return '';
  return Object.prototype.hasOwnProperty.call(REASON_LABELS, reason) ? REASON_LABELS[reason] : FALLBACK;
}

export type SourceMessageStatus = 'pending' | 'processing' | 'dispatched' | 'skipped' | 'failed';

export function statusLabel(status: SourceMessageStatus): string {
  if (status === 'dispatched') return 'Enviada';
  if (status === 'skipped') return 'Ignorada';
  if (status === 'failed') return 'Falhou';
  return 'Na fila';
}
