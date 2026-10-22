// Base de conhecimento do Lyo. Vai inteira no prompt de sistema.
// Para atualizar: editar este texto e fazer deploy de assistant-chat.
// Fatos aqui precisam bater com o código (planos, limites, telas). Sem travessão.
export const KNOWLEDGE = `
# O que é o Aflyo

O Aflyo é uma plataforma para afiliados de Shopee, Amazon e Mercado Livre. Ele ajuda a criar ofertas com link de afiliado, montar uma vitrine pública e enviar as ofertas para grupos de WhatsApp, canais do Telegram e servidores do Discord.

O coração do Aflyo é o bot: ele monitora canais ou grupos de ofertas do Telegram que você já acompanha, troca os links pelos seus links de afiliado e publica as ofertas nos seus destinos, sozinho.

# Menu lateral

- Dashboard: visão geral. Mostra o card do bot (monitorando ou pausado), atalhos e métricas.
- Ofertas: criar, editar e disparar ofertas manualmente.
- Canais: conectar os destinos (WhatsApp, Telegram, Discord).
- Integrações: aba Bot (conta do Telegram, grupos de origem, canais de destino, tags de afiliado, horário de funcionamento) e aba API e integrações.
- Histórico: todos os disparos, com o resultado de cada um.
- Configurações: abas Minha conta, Vitrine, Links da vitrine, Mensagens e Plano e cobrança.
- Suporte: tickets com o time do Aflyo.
- Planos: comparar e assinar planos.

# Planos e preços (cobrança mensal)

- Starter: R$ 47,90 por mês. Monitora até 2 grupos de origem, conecta 1 número de WhatsApp, dispara para até 5 grupos de WhatsApp e até 5 grupos do Telegram, disparo em massa e agendamento, template de mensagem personalizável, Shopee, Amazon e Mercado Livre.
- Pro: R$ 97 por mês. Monitora até 6 grupos de origem, até 2 números de WhatsApp, até 12 grupos de WhatsApp e 12 do Telegram, analytics avançado, encurtador automático de links e tudo do Starter.
- Business: R$ 197 por mês. Monitora até 15 grupos de origem, até 4 números de WhatsApp, até 20 grupos de WhatsApp e 20 do Telegram, analytics avançado, encurtador automático, remove a marca Aflyo da vitrine, suporte prioritário e tudo do Pro.

Ofertas são ilimitadas em todos os planos e não expiram sozinhas.
No pagamento com cartão há uma taxa de processamento de R$ 0,99 somada ao preço do plano.
Hoje só existe cobrança mensal. Não há plano anual à venda.
Sem fidelidade: dá para cancelar quando quiser.

Perguntas ao assistente Lyo por dia: Free 10, Starter 50, Pro 150, Business 400. Renovam à meia-noite (horário de Brasília).

# Teste grátis

Toda conta nova começa com um teste grátis de 7 dias com os recursos do plano Starter.
A data de término aparece em Configurações > Plano e cobrança.
Quando o teste termina sem assinatura, o acesso fica expirado: aparece a faixa "Seu acesso terminou. Seus dados continuam salvos." e o bot para de monitorar e enviar. Nada é apagado. Ao assinar um plano, tudo volta a funcionar.

# Assinatura, cancelamento e cobrança

- Para assinar ou trocar de plano: menu Planos, escolha o plano e pague. O pagamento é processado pela Cakto.
- Para cancelar: Configurações > Plano e cobrança > Cancelar assinatura. A renovação automática é cancelada e você mantém o acesso até o fim do período já pago. A data aparece na mesma tela.
- Se o pagamento foi feito e o plano não liberou, espere alguns minutos e recarregue a página. Pagar de novo não é necessário. Se continuar, fale com o time.
- Reembolso e problemas de cobrança são tratados pelo time: abra um ticket em Suporte.

# Primeiros passos (ativação)

Ordem recomendada: conectar o Telegram, configurar os links de afiliado, escolher o canal a monitorar, conectar um destino, fazer um disparo de teste e receber a primeira oferta automática.

## 1. Conectar sua conta do Telegram
O bot lê os canais de ofertas usando a sua conta do Telegram. Para isso precisa do API ID e do API Hash, que o Telegram gera de graça.
1. Abra my.telegram.org e entre com o número da sua conta do Telegram.
2. Digite o código que o Telegram enviar para o app e confirme.
3. Clique em "API development tools" e preencha "App title" e "Short name" com qualquer nome (por exemplo, Aflyo).
4. Copie "App api_id" e "App api_hash".
5. No Aflyo, abra Integrações, aba Bot, clique em conectar e cole o API ID, o API Hash e o seu telefone com DDD.
6. Clique em "Enviar código", digite o código de 5 dígitos que chegou no Telegram e clique em "Verificar código".
Nunca compartilhe o API Hash com ninguém. Ele dá acesso à sua conta.

## 2. Configurar seus links de afiliado
As tags de afiliado fazem cada oferta enviada virar comissão para você.
1. Abra Integrações, aba Bot, e role até "Configurações Adicionais".
2. Amazon: preencha "Tag Amazon Associates" com o seu ID de associado (parecido com nome-20).
3. Mercado Livre: abra "Automação do Mercado Livre" e preencha "Tag de afiliado Mercado Livre".
4. Shopee: abra "Credenciais Shopee" e preencha "App ID" e "Secret Key".
5. Clique em "Salvar configurações".
Se você trabalha com um marketplace só, configure só ele.

## 3. Escolher o canal a monitorar (grupo de origem)
1. Confirme que a sua conta do Telegram é membro do canal ou grupo.
2. Abra o canal no Telegram Web (web.telegram.org). O número depois do "#" na barra de endereço, como -1001234567890, é o ID. Outra opção: encaminhe uma mensagem do canal para o bot @getidsbot.
3. No Aflyo, Integrações, aba Bot, em "Grupos de Origem", cole o ID e clique em "Adicionar".
4. Clique em "Salvar grupos" e confira o contador "Grupos monitorados".
O número de grupos de origem depende do plano.

## 4. Conectar onde as ofertas serão enviadas (destino)
Abra Canais e clique para conectar um novo canal.
- WhatsApp: leia o QR Code com o celular em Aparelhos conectados, "Conectar um dispositivo", e depois escolha o grupo de disparo.
- Telegram: crie um bot com o @BotFather, copie o token, adicione o bot como administrador do seu canal e informe o Chat ID.
- Discord: nas configurações do canal do Discord, crie um webhook e cole a URL no Aflyo.
Clique em "Validar e Conectar" (ou "Conectar Agora") e espere a confirmação.
Depois, em Integrações, aba Bot, seção "Canais de Destino", marque os canais que vão receber as ofertas automáticas e clique em "Salvar canais".

## 5. Fazer um disparo de teste
1. Abra Ofertas e crie ou escolha uma oferta com link de afiliado.
2. Clique em disparar, selecione o destino e confirme.
3. Confira no WhatsApp, Telegram ou Discord se a mensagem chegou com imagem e link.
Se não chegou, abra Histórico para ver o motivo do erro.

## 6. Receber a primeira oferta automática
1. No Dashboard, o card do bot deve mostrar "monitorando". Se estiver pausado, use o botão do card para ligar.
2. Confira os "Canais de Destino" marcados em Integrações, aba Bot.
3. Confira o horário de funcionamento do bot em Integrações, aba Bot. Fora do horário ele não envia.
4. Espere o canal monitorado publicar uma oferta nova. Pode levar de minutos a horas.
A oferta enviada aparece no Histórico.

# Vitrine pública

A vitrine é uma página pública com as suas ofertas, para divulgar em redes sociais.
- Configure em Configurações > Vitrine (nome, foto, bio, tema) e Configurações > Links da vitrine (links dos seus grupos de WhatsApp, Telegram e Discord).
- No plano Business a marca Aflyo sai da vitrine.

# Mensagens (templates)

Em Configurações > Mensagens você personaliza o texto que acompanha cada oferta enviada. Está disponível em todos os planos.

# Encurtador e analytics

- Encurtador automático de links: Pro e Business. No Starter o link vai como está, sem encurtar.
- Analytics avançado (cliques e desempenho): Pro e Business. No Starter alguns números aparecem bloqueados com convite para upgrade.

# Histórico de disparos

Em Histórico cada envio aparece com um status:
- Sucesso: chegou em todos os destinos.
- Parcial: chegou em parte dos destinos. Abra o item para ver quais falharam e por quê.
- Erro: não chegou em nenhum destino. O motivo aparece no item.

# Problemas comuns

- Bot pausado: veja o card no Dashboard. Pode ser acesso expirado, pausa manual ou um erro de conexão. Ligue pelo botão do card. Se o acesso expirou, assine um plano em Planos.
- Bot ligado mas nada chega: confira se o canal de origem está publicando, se há Canais de Destino marcados e salvos, se está dentro do horário de funcionamento e se o destino continua conectado em Canais.
- WhatsApp desconectado: em Canais, reconecte lendo o QR Code de novo. Isso acontece quando o celular fica sem internet por muito tempo ou a sessão é encerrada em Aparelhos conectados.
- Bot do Telegram não publica no canal: o bot precisa ser administrador do canal, com permissão para postar.
- Discord não recebe: confira se a URL do webhook está completa e se o webhook não foi apagado no Discord.
- Grupo de origem não é lido: a sua conta do Telegram precisa ser membro do canal, e o ID precisa estar no formato -100...
- Link sem comissão: confira a tag de afiliado do marketplace em Integrações, aba Bot, "Configurações Adicionais".
- Limite do plano atingido (grupos, números ou destinos): faça upgrade em Planos ou remova um item antes de adicionar outro.

# Suporte

- Suporte: abra um ticket no menu Suporte ou toque em "Falar com o time" aqui no Lyo. O time responde pelo próprio ticket.
- Grupo "Aflyo | Suporte | Networking" no WhatsApp: tire dúvidas com o time e troque ideias com outros afiliados. O atalho fica no menu lateral.
`;
