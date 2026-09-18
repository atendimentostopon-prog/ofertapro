# Auditoria da interface: continuação de 17/09/2026

Base revisada: commit `387ef06`. Escopo desta rodada: revisão estática das pendências visuais, cabeçalho, notificações e estados de carregamento. Alterações locais, sem deploy.

## Correções implementadas

- Sidebar: usa `logo-white.png` no tema escuro, seguindo `resolvedTheme` do provedor existente.
- API e Integrações: apresenta carregamento antes de exibir o status; erros de consulta mostram "Status indisponível", sem afirmar que não há configuração.
- Origem de Tráfego: limita os textos ao espaço disponível, mantém distância entre colunas e oferece o valor completo no atributo `title`.
- Cabeçalho: substitui `z-35`, sem definição no Tailwind, por `z-[35]`; impede a redução da altura pelo contêiner flex.
- Notificações: posicionamento mobile relativo ao cabeçalho, com margem lateral; altura limitada pela viewport e rolagem interna. Itens passam a ser botões acessíveis por teclado.
- Busca: implementa o atalho Ctrl/Cmd+K anunciado na interface e descreve corretamente a busca por ofertas, que é a rota efetivamente usada.
- Botões: nome acessível para Nova oferta quando só o ícone está visível e estado de expansão no sino.

## Verificação realizada

- `npm run build`: passou (TypeScript e Vite).
- `git diff --check`: passou.
- Revisão do diff e do contexto dos componentes.
- O build mantém o aviso de bundle acima de 500 kB.

## Validação visual pendente

A ferramenta de navegador retornou inventário vazio. Tentativas de abrir Chrome e navegador integrado retornaram "Browser is not available". Nenhuma navegação autenticada, captura visual ou validação em produção foi realizada nesta rodada.

Com navegador disponível, conferir:

1. Desktop e mobile (320, 375, 390 e 1280 px), temas claro e escuro.
2. Logo legível, cabeçalho estável durante scroll e menu mobile acima do conteúdo.
3. Sino aberto: painel dentro da viewport, acima dos cards, com rolagem e rodapé acessíveis; fechamento por Escape e clique externo.
4. Navegação das notificações com Tab e Enter, sem recarga completa da página.
5. Ctrl/Cmd+K focando a busca e envio da consulta para Ofertas.
6. Status da API durante carregamento, falha de consulta, chave ativa e ausência de chave.
7. Card de tráfego com nomes longos.

## Outras pendências encontradas no plano anterior

Estes pontos continuam exigindo investigação/validação funcional; não são considerados resolvidos por esta rodada:

- Dashboard agora compara WhatsApp e Telegram com os limites de grupos de destino; o cartão continua exibindo o total agregado e a regra de Discord deve ser confirmada com dados reais.
- `useDashboardStats` usa margem de 10 segundos e limpa os timers quando cada consulta termina.
- `useBotStatus` e `BotTab` usam `last_error`, conforme o contrato documentado para `bot_configs`.
- `useOffers` atualiza novamente ao recuperar o foco da janela, reduzindo divergência causada por dados alterados em outra aba; a contagem ainda requer validação com dados reais.
- O teste manual de Telegram agora persiste `connected` ou `disconnected` em `channels.status` e atualiza `last_sync`.
- O webhook da Evolution sincroniza `channels.status` tanto na reconexão (`open`) quanto na desconexão (`close`/`refused`). A Edge Function ainda precisa ser publicada para entrar em produção.
- O artefato visual antigo das notificações não foi reproduzido. A correção da camada CSS elimina uma causa concreta, mas não comprova a resolução completa sem navegador.
- O cascade do webhook precisa de uma simulação autenticada com uma instância e grupo reais após o deploy.
- O wrapper raiz do `Layout` deixou de usar `overflow-hidden`, permitindo que o `sticky` do cabeçalho use o contêiner de rolagem correto; o `main` mantém o recorte horizontal local.

Não marcar a auditoria completa nem a versão em produção como validada com base apenas no build.
