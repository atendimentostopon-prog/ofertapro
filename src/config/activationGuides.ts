import type { MilestoneId } from '../lib/activationMilestones.ts';

export interface GuideStep { text: string; }
export interface GuideLink { label: string; href: string; }
export interface ActivationGuide {
  id: MilestoneId;
  title: string;
  intro: string;
  steps: GuideStep[];
  link?: GuideLink;
  tip?: string;
}

export const ACTIVATION_GUIDES: Record<MilestoneId, ActivationGuide> = {
  telegram: {
    id: 'telegram',
    title: 'Conectar sua conta do Telegram',
    intro: 'O bot precisa ler os canais de ofertas com a sua conta. Isso exige o API ID e o API Hash, que o próprio Telegram gera de graça.',
    steps: [
      { text: 'Abra my.telegram.org e entre com o número de telefone da sua conta do Telegram.' },
      { text: 'Digite o código que o Telegram enviar para o seu app e confirme.' },
      { text: 'Clique em "API development tools" e preencha "App title" e "Short name" com qualquer nome (por exemplo, Aflyo).' },
      { text: 'Copie os valores "App api_id" e "App api_hash" que aparecem na tela.' },
      { text: 'Volte ao Aflyo, abra Integrações, aba Bot, clique em conectar e cole o API ID, o API Hash e o seu telefone com DDD.' },
      { text: 'Clique em "Enviar código", digite o código de 5 dígitos que chegou no Telegram e clique em "Verificar código".' },
    ],
    link: { label: 'Abrir my.telegram.org', href: 'https://my.telegram.org' },
    tip: 'Nunca compartilhe o API Hash com ninguém. Ele dá acesso à sua conta.',
  },
  marketplaces: {
    id: 'marketplaces',
    title: 'Configurar seus links de afiliado',
    intro: 'As tags de afiliado fazem cada oferta enviada pelo bot virar comissão para você.',
    steps: [
      { text: 'Abra Integrações, aba Bot, e role até "Configurações Adicionais".' },
      { text: 'Na Amazon, preencha "Tag Amazon Associates" com o seu ID de associado (parecido com nome-20).' },
      { text: 'No Mercado Livre, abra "Automação do Mercado Livre" e preencha "Tag de afiliado Mercado Livre".' },
      { text: 'Na Shopee, abra "Credenciais Shopee" e preencha "App ID" e "Secret Key".' },
      { text: 'Clique em "Salvar configurações". Uma credencial já libera esta etapa.' },
    ],
    tip: 'Se você só trabalha com um marketplace, configure só ele. Dá para adicionar os outros depois.',
  },
  source: {
    id: 'source',
    title: 'Escolher o canal a monitorar',
    intro: 'O bot copia as ofertas de um canal ou grupo do Telegram que você já acompanha. Você informa o ID dele.',
    steps: [
      { text: 'Confirme que a sua conta do Telegram é membro do canal ou grupo que você quer monitorar.' },
      { text: 'Abra o canal no Telegram Web (web.telegram.org). O número depois do "#" na barra de endereço, por exemplo -1001234567890, é o ID. Outra opção: encaminhe uma mensagem do canal para o bot @getidsbot.' },
      { text: 'No Aflyo, abra Integrações, aba Bot, em "Grupos de Origem".' },
      { text: 'Cole o ID no campo "ID do Grupo (ex: -100123456789)" e clique em "Adicionar".' },
      { text: 'Clique em "Salvar grupos".' },
      { text: 'Confira se o contador "Grupos monitorados" passou a mostrar o número certo.' },
    ],
    link: { label: 'Abrir o Telegram Web', href: 'https://web.telegram.org' },
    tip: 'Comece com um único canal de ofertas ativo. Fica mais fácil conferir o resultado.',
  },
  destination: {
    id: 'destination',
    title: 'Conectar onde as ofertas serão enviadas',
    intro: 'Destino é o lugar onde o bot publica as ofertas: um grupo de WhatsApp, um canal do Telegram ou um servidor do Discord.',
    steps: [
      { text: 'Abra a página Canais e clique para conectar um novo canal.' },
      { text: 'WhatsApp: leia o QR Code com o celular em Aparelhos conectados, "Conectar um dispositivo", e depois escolha o grupo de disparo.' },
      { text: 'Telegram: crie um bot com o @BotFather, copie o token, adicione o bot como administrador do seu canal e informe o Chat ID.' },
      { text: 'Discord: nas configurações do canal, crie um webhook e cole a URL no Aflyo.' },
      { text: 'Clique em "Validar e Conectar" (ou "Conectar Agora") e espere a confirmação.' },
    ],
    link: { label: 'Abrir o @BotFather', href: 'https://t.me/BotFather' },
    tip: 'Um destino basta para começar. Você pode conectar mais depois.',
  },
  test_dispatch: {
    id: 'test_dispatch',
    title: 'Fazer um disparo de teste',
    intro: 'Antes de deixar o bot sozinho, confirme que uma oferta chega ao seu destino.',
    steps: [
      { text: 'Abra Ofertas e crie ou escolha uma oferta com link de afiliado.' },
      { text: 'Clique em disparar e selecione o destino que você conectou.' },
      { text: 'Confirme o envio.' },
      { text: 'Abra o WhatsApp, Telegram ou Discord e confira se a mensagem chegou com imagem e link.' },
    ],
    tip: 'Se não chegou, abra Histórico para ver o motivo do erro ou chame o suporte.',
  },
  automatic_offer: {
    id: 'automatic_offer',
    title: 'Receber a primeira oferta automática',
    intro: 'Aqui o bot trabalha sozinho: quando o canal monitorado postar uma oferta, ele converte o link e envia para o seu destino.',
    steps: [
      { text: 'Abra o Dashboard e confira que o card do bot mostra "monitorando".' },
      { text: 'Se estiver pausado, use o botão do card para ligar o bot.' },
      { text: 'Em Integrações, aba Bot, na seção "Canais de Destino", marque o canal que vai receber as ofertas e clique em "Salvar canais".' },
      { text: 'Verifique o horário de funcionamento do bot em Integrações, aba Bot. Fora do horário ele não envia.' },
      { text: 'Aguarde o canal monitorado publicar uma nova oferta. Pode levar de alguns minutos a algumas horas.' },
      { text: 'Quando a primeira oferta for enviada, esta etapa conclui sozinha e aparece no Histórico.' },
    ],
    tip: 'Seu teste grátis tem 7 dias. Deixe o bot ligado para ver resultado antes do fim.',
  },
};

export function getGuide(id: string | null): ActivationGuide | null {
  if (!id) return null;
  return Object.prototype.hasOwnProperty.call(ACTIVATION_GUIDES, id)
    ? ACTIVATION_GUIDES[id as MilestoneId]
    : null;
}
