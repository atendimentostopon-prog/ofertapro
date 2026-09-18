# Card "Canais" do Dashboard — composição por tipo

## Contexto

O card "Canais" (`src/components/dashboard/OperationalMetrics.tsx:32-58`), um dos
4 na grade de métricas operacionais do Dashboard, hoje mostra só um número
agregado ("5 / 9", "conectados") sem dizer a composição. O usuário considera
isso vago demais.

Todos os dados necessários pro redesenho já existem sem nenhuma query nova:
`connectedWhatsappChannels`, `connectedTelegramChannels` (computados em
`useDashboardStats.ts:109-115`) e os limites por tipo já calculados em
`Dashboard.tsx:60-64` (`whatsappAtLimit`, `telegramAtLimit`,
`limits.maxWhatsappGroups`, `limits.maxTelegramGroups`).

## Escopo

- Dentro: só o corpo do card "Canais" em `OperationalMetrics.tsx` e os props
  que `Dashboard.tsx` já passa (mais os 2 novos: contagem/limite por tipo).
- Fora: os outros 3 cards da grade (Disparos, Ofertas ativas, Grupos), o
  tamanho/posição do card na grade, qualquer nova query ao banco.

## Design

Mantém o mesmo tamanho de card (compacto, um dos 4 numa grade `grid-cols-2
lg:grid-cols-4`). Header (label "Canais" + ícone `Radio`) fica igual. O
corpo muda de um número único pra duas colunas lado a lado, uma por tipo de
canal:

- Cada coluna: ícone de marca (`ChannelLogo` com `type="whatsapp"` /
  `type="telegram"`, `size="w-3.5 h-3.5"`) + número grande + `/ limite`
  (ou `/ ∞` se `Infinity`), no mesmo estilo tipográfico do número atual
  (`text-lg font-bold tracking-tight tabular-nums font-display` — reduzido
  de `text-2xl` pra `text-lg` porque agora são dois números lado a lado no
  mesmo espaço).
- Uma barra de progresso fina por coluna (reaproveita o padrão visual já
  existente: `bg-surface-1 h-1.5 rounded-full`, preenchimento
  `bg-mint-500` normal / `bg-warning` no limite), só quando aquele tipo
  tem limite (`Infinity` não mostra barra).
- Mensagem de rodapé: se QUALQUER um dos dois tipos estiver no limite,
  mostra "Limite atingido" (`text-warning-ink`) igual hoje — sem
  diferenciar qual tipo bateu o limite, pra não sobrecarregar o card
  pequeno com texto. Caso nenhum esteja no limite, mostra "conectados"
  genérico como hoje.
- Se um tipo tiver 0 canais e 0 de limite (feature não disponível no
  plano — não deveria acontecer hoje, já que todo plano tem pelo menos 1
  WhatsApp, mas por segurança), a coluna mostra "0 / 0" sem erro.

## Interface do componente

`OperationalMetrics.tsx` ganha 2 props novos, substituindo o uso de
`connectedChannels`/`channelLimit`/`channelLimited` (que somavam os dois
tipos) só dentro do card Canais — os outros 3 cards não mudam:

```ts
interface Props {
  dispatches30d: number;
  whatsappChannels: number;
  whatsappLimit: number; // Infinity permitido
  telegramChannels: number;
  telegramLimit: number; // Infinity permitido
  channelsAtLimit: boolean; // já existe, mantido (whatsappAtLimit || telegramAtLimit)
  activeOffers: number;
  groupsMonitored: number;
}
```

`connectedChannels`/`channelLimit`/`channelLimited` somem da interface —
não são mais usados por nenhum card depois dessa mudança (só o card Canais
os consumia). `Dashboard.tsx` passa `connectedWhatsappChannels` /
`limits.maxWhatsappGroups` / `connectedTelegramChannels` /
`limits.maxTelegramGroups` diretamente em vez de agregá-los antes.

## Fora de escopo (YAGNI)

- Discord/outros tipos de canal futuros — só WhatsApp e Telegram existem
  hoje como canais de disparo.
- Tornar o card clicável/expansível — mantém o padrão "métrica sem
  clique" dos outros 3 cards da grade (decisão já tomada no SP3).
- Mensagem de limite diferenciada por tipo.

## Teste/verificação

- `npm run build` limpo.
- Visual manual (via `run` ou navegador) do Dashboard com uma conta que
  tenha WhatsApp e Telegram conectados, nos dois temas (claro/escuro),
  conferindo: os dois números aparecem lado a lado, as barras de
  progresso batem com a proporção certa, e o aviso de limite aparece
  quando aplicável.
- Conferir em 375px (mobile) que os dois números cabem sem cortar/quebrar
  layout — a grade já vira `grid-cols-2` nesse breakpoint, tornando o
  card mais largo relativamente, mas ainda compacto o bastante pra caber
  duas colunas internas.
