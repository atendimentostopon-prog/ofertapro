// Conteúdo do guia exibido em /instagram. Texto de produto: sem travessão.
import { COMPANY } from './company';

export interface GuideStep {
  title: string;
  body: string;
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface GuideLimits {
  maxIgAccounts: number;
  maxIgAutomations: number;
  maxIgDmsMonth: number;
}

export const GUIDE_STEPS: GuideStep[] = [
  {
    title: 'Use um Instagram profissional',
    body:
      'A conta precisa ser Comercial ou Criador. Para mudar, abra o Instagram e vá em Configurações > Tipo de conta e ferramentas > Mudar para conta profissional. É grátis e leva um minuto.',
  },
  {
    title: 'Conecte sua conta',
    body:
      'Clique em Conectar Instagram, autorize as 3 permissões (perfil, comentários e mensagens) e você volta para o Aflyo com a conta conectada.',
  },
  {
    title: 'Crie uma automação',
    body:
      'Escolha o post, defina a palavra-chave (por exemplo: quero) e escreva a mensagem. Use {{usuario}} para o nome de quem comentou e {{link}} para o seu link. A resposta pública no comentário é opcional.',
  },
  {
    title: 'Ative e teste',
    body:
      'Ligue a automação e comente a palavra-chave de outra conta. A resposta aparece no comentário e a DM chega em segundos. Se a pessoa não segue você, a DM pode ir para Solicitações de mensagem.',
  },
];

export const EARLY_ACCESS_NOTICE = {
  title: 'Acesso antecipado',
  body:
    'A liberação do Instagram para todas as contas está em andamento junto à Meta. Se ao conectar aparecer "Função de desenvolvedor é insuficiente", sua conta ainda não foi liberada.',
  contact: `Fale com a gente em ${COMPANY.contactEmail} e adicionamos você como testador.`,
};

function fmt(n: number): string {
  return Number.isFinite(n) ? n.toLocaleString('pt-BR') : 'ilimitadas';
}

export function buildFaq(limits: GuideLimits): GuideFaq[] {
  return [
    {
      q: 'A DM não chegou. O que verifico?',
      a: 'Confira: 1) a automação está ativa; 2) a palavra-chave aparece no comentário; 3) quem comentou não é a própria conta conectada (esses comentários são ignorados); 4) o comentário foi feito no post escolhido; 5) você não atingiu o limite de DMs do mês.',
    },
    {
      q: 'Quantas mensagens posso enviar?',
      a: `Seu plano permite ${fmt(limits.maxIgDmsMonth)} DMs por mês, ${fmt(limits.maxIgAutomations)} automações ativas e ${fmt(limits.maxIgAccounts)} conta(s) de Instagram.`,
    },
    {
      q: 'A mesma pessoa recebe a mensagem várias vezes?',
      a: 'Por padrão, cada pessoa recebe a mensagem uma vez por automação. Você pode mudar isso no editor, desmarcando "Enviar só uma vez por pessoa".',
    },
    {
      q: 'Posso usar uma conta pessoal?',
      a: 'Não. A API do Instagram só funciona com conta Comercial ou Criador. A mudança é gratuita nas configurações do Instagram.',
    },
    {
      q: 'O que acontece se meu plano vencer?',
      a: 'As automações são pausadas e podem ser ativadas de novo quando você assinar outra vez.',
    },
    {
      q: 'Como desconecto e apago meus dados?',
      a: 'Clique em Desconectar na conta. O acesso é removido na hora e os dados são apagados em até 30 dias. Os detalhes estão em /exclusao-de-dados.',
    },
    {
      q: 'Quais cuidados evitam problemas com a conta?',
      a: 'Envie mensagens apenas a quem comentou, sem spam e sem conteúdo enganoso. Seguir as regras do Instagram protege a sua conta.',
    },
  ];
}
