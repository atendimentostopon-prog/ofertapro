export type MilestoneId =
  | 'telegram'
  | 'marketplaces'
  | 'source'
  | 'destination'
  | 'test_dispatch'
  | 'automatic_offer';

export interface ActivationBotConfig {
  telegram_session?: string | null;
  status?: string | null;
  grupos_origem?: string[] | null;
  amazon_tag?: string | null;
  mercadolivre_tag?: string | null;
}

export interface ActivationInput {
  botConfig: ActivationBotConfig | null;
  connectedChannels: number;
  successfulDispatches: number;
  automaticDispatches: number;
}

export interface Milestone {
  id: MilestoneId;
  title: string;
  description: string;
  actionLabel: string;
  route: string;
  done: boolean;
}

export interface ActivationState {
  milestones: Milestone[];
  next: Milestone | null;
  completed: number;
  total: number;
  percent: number;
  allDone: boolean;
}

const filled = (value: string | null | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export function deriveActivation(input: ActivationInput): ActivationState {
  const bot = input.botConfig;
  const hasAutomatic = input.automaticDispatches > 0;

  const milestones: Milestone[] = [
    {
      id: 'telegram',
      title: 'Conectar sua conta do Telegram',
      description: 'Informe API ID, API Hash e o código recebido para o bot ler seus canais.',
      actionLabel: 'Conectar',
      route: '/integrations?tab=bot',
      done: filled(bot?.telegram_session) || bot?.status === 'active',
    },
    {
      id: 'marketplaces',
      title: 'Configurar seus links de afiliado',
      description: 'Salve ao menos uma tag de afiliado (Amazon ou Mercado Livre).',
      actionLabel: 'Configurar',
      route: '/integrations?tab=bot',
      done: filled(bot?.amazon_tag) || filled(bot?.mercadolivre_tag),
    },
    {
      id: 'source',
      title: 'Escolher o canal a monitorar',
      description: 'Selecione o canal ou grupo do Telegram de onde o bot vai copiar as ofertas.',
      actionLabel: 'Escolher canal',
      route: '/integrations?tab=bot',
      done: Array.isArray(bot?.grupos_origem) && bot.grupos_origem.length > 0,
    },
    {
      id: 'destination',
      title: 'Conectar onde as ofertas serão enviadas',
      description: 'Conecte WhatsApp, Telegram ou Discord como destino dos disparos.',
      actionLabel: 'Conectar destino',
      route: '/channels',
      done: input.connectedChannels > 0,
    },
    {
      id: 'test_dispatch',
      title: 'Fazer um disparo de teste',
      description: 'Envie uma oferta para o seu destino e confirme que chegou.',
      actionLabel: 'Disparar',
      route: '/offers',
      done: input.successfulDispatches > 0 || hasAutomatic,
    },
    {
      id: 'automatic_offer',
      title: 'Receber a primeira oferta automática',
      description: 'Deixe o bot ligado: ele envia sozinho assim que o canal monitorado postar uma oferta.',
      actionLabel: 'Ver o bot',
      route: '/dashboard',
      done: hasAutomatic,
    },
  ];

  const completed = milestones.filter(m => m.done).length;
  const total = milestones.length;

  return {
    milestones,
    next: milestones.find(m => !m.done) ?? null,
    completed,
    total,
    percent: Math.round((completed / total) * 100),
    allDone: completed === total,
  };
}
