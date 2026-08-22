# Aflyo — Brand Reference

Esta pasta contém a identidade visual oficial da **Aflyo** e deve ser utilizada como fonte principal de referência para qualquer implementação visual do produto.

> **IMPORTANTE:** os arquivos desta pasta são referências oficiais da marca. Não sobrescrever, alterar, deformar ou substituir esses arquivos sem autorização.

---

## Brand

**Nome:** Aflyo

**Posicionamento:** plataforma SaaS para automação, organização e distribuição de promoções e ofertas de afiliados.

### Personalidade

A identidade visual da Aflyo deve transmitir:

* minimalismo;
* clareza;
* automação;
* tecnologia;
* agilidade;
* organização;
* confiança;
* simplicidade;
* sofisticação;
* escalabilidade.

### Princípios visuais

```text
clarity > decoration
hierarchy > effects
spacing > borders
consistency > novelty
usability > aesthetics
product design > template design
```

---

# Estrutura

```text
aflyo-brand-reference/
│
├── logos/
│   ├── logo-primary.png
│   ├── logo-white.png
│   ├── logo-monochrome.png
│   ├── logo-stacked.png
│   ├── logo-stacked-white.png
│   ├── wordmark.png
│   ├── symbol-mint.png
│   └── symbol-graphite.png
│
├── references/
│   ├── brand-identity.png
│   ├── logo-system.png
│   ├── brand-applications.png
│   ├── color-palette.png
│   └── typography.png
│
└── README.md
```

---

# Logos

## `logo-primary.png`

Logo principal da Aflyo.

Composição:

* símbolo Mint;
* wordmark Graphite;
* orientação horizontal.

### Uso recomendado

Utilizar prioritariamente em:

* header;
* login;
* landing pages;
* dashboard;
* documentos;
* superfícies claras.

---

## `logo-white.png`

Versão para fundos escuros.

Composição:

* símbolo Mint;
* wordmark branco.

### Uso recomendado

Utilizar em:

* backgrounds Graphite;
* footer escuro;
* sidebar escura;
* telas dark;
* superfícies escuras.

---

## `logo-monochrome.png`

Versão monocromática em Graphite.

Utilizar quando aplicações de uma única cor forem necessárias.

---

## `logo-stacked.png`

Versão vertical da marca.

Composição:

* símbolo Mint;
* wordmark Graphite;
* símbolo acima da palavra.

Ideal para aplicações mais quadradas ou centralizadas.

---

## `logo-stacked-white.png`

Versão vertical destinada a superfícies escuras.

Composição:

* símbolo Mint;
* wordmark branco.

---

## `wordmark.png`

Somente o logotipo:

`aflyo`

Sem símbolo.

Utilizar apenas quando a aplicação exigir uma representação horizontal extremamente simples ou quando o símbolo já estiver presente no contexto.

---

## `symbol-mint.png`

Símbolo oficial isolado em Mint.

Utilização recomendada:

* favicon;
* app icon;
* sidebar colapsada;
* avatar da plataforma;
* loading;
* pequenos contextos;
* elementos de marca;
* detalhes visuais.

---

## `symbol-graphite.png`

Versão Graphite do símbolo isolado.

Utilizar em aplicações monocromáticas ou situações onde Mint não possuir contraste adequado.

---

# Regras da marca

Nunca:

* distorcer a logo;
* esticar;
* comprimir;
* inclinar;
* mudar proporções;
* modificar o símbolo;
* adicionar sombra;
* aplicar glow;
* aplicar efeitos 3D;
* aplicar gradientes arbitrários;
* utilizar cores que não pertençam à identidade;
* alterar o wordmark;
* recriar a logo utilizando outra fonte.

Sempre preservar área de respiro ao redor da marca.

---

# Paleta oficial

## Graphite

```css
#101418
```

Cor estrutural principal.

Utilizar em:

* textos principais;
* botões primários;
* navegação;
* headings;
* superfícies escuras.

---

## Cloud

```css
#F6F7F9
```

Cor de superfície secundária.

Utilizar em:

* backgrounds;
* seções;
* áreas secundárias;
* dashboards.

---

## Slate

```css
#6B7280
```

Utilizar para:

* textos secundários;
* labels;
* placeholders;
* informações auxiliares.

---

## Mint

```css
#5EE7A5
```

Accent principal da marca.

Utilizar para:

* estados ativos;
* destaques;
* indicadores;
* pequenos detalhes;
* ícones;
* ações específicas;
* elementos de marca.

Mint não deve dominar toda a interface.

---

## Ice

```css
#DFF8EE
```

Utilizar para:

* backgrounds de badges;
* highlights;
* itens ativos;
* superfícies suaves;
* estados positivos.

---

# CSS Tokens

Sugestão inicial:

```css
:root {
    --aflyo-graphite: #101418;
    --aflyo-cloud: #F6F7F9;
    --aflyo-slate: #6B7280;
    --aflyo-mint: #5EE7A5;
    --aflyo-ice: #DFF8EE;

    --aflyo-white: #FFFFFF;

    --text-primary: #101418;
    --text-secondary: #6B7280;

    --surface-primary: #FFFFFF;
    --surface-secondary: #F6F7F9;
    --surface-accent: #DFF8EE;

    --brand-accent: #5EE7A5;
}
```

A implementação pode adicionar tokens derivados para:

* hover;
* active;
* focus;
* disabled;
* error;
* warning;
* success;
* borders;
* overlays;

desde que preserve a identidade visual principal.

---

# Tipografia

## Headlines

### Space Grotesk

Utilizar para:

* H1;
* H2;
* H3;
* títulos de seção;
* hero;
* métricas importantes;
* destaques.

Google Fonts:

https://fonts.google.com/specimen/Space+Grotesk

Pesos recomendados:

```text
500
600
700
```

---

## Interface e Body

### Inter

Utilizar para:

* body;
* menus;
* sidebar;
* labels;
* formulários;
* inputs;
* botões;
* tabelas;
* badges;
* mensagens;
* dashboard.

Google Fonts:

https://fonts.google.com/specimen/Inter

Pesos recomendados:

```text
400
500
600
```

---

# Escala tipográfica sugerida

```text
Display        56px / 64px
H1             48–56px / 64px
H2             40px / 48px
H3             32px / 40px
H4             24px / 32px
Body Large     18px / 28px
Body           16px / 24px
Small          14px / 20px
Caption        12px / 16px
```

Adaptar responsivamente conforme necessário.

---

# References

## `brand-identity.png`

Referência geral da identidade Aflyo.

Utilizar para compreender:

* linguagem visual;
* cores;
* tipografia;
* espaçamentos;
* cards;
* botões;
* composição da marca.

---

## `logo-system.png`

Referência oficial do sistema de logos.

Utilizar para compreender:

* versões da marca;
* símbolo;
* posicionamento;
* clear space;
* escalabilidade;
* favicon;
* usos corretos e incorretos.

---

## `brand-applications.png`

Principal referência para implementação do produto.

Mostra como a identidade deve aparecer em:

* landing page;
* dashboard;
* sidebar;
* cards;
* KPIs;
* mobile;
* campanhas;
* notificações;
* componentes;
* story/promo;
* app icon.

Essa referência deve orientar o design do SaaS real.

Não é necessário copiar cada tela pixel por pixel.

O objetivo é aplicar o mesmo **sistema visual** ao produto real.

---

## `color-palette.png`

Referência visual oficial da paleta de cores.

Os códigos HEX escritos neste README são a fonte técnica de verdade.

---

## `typography.png`

Referência visual da hierarquia e combinação tipográfica.

---

# Direção de UI

A interface da Aflyo deve possuir:

* bastante whitespace;
* bordas sutis;
* sombras mínimas;
* radius moderado;
* excelente hierarquia;
* alta legibilidade;
* componentes consistentes;
* microinterações discretas;
* Mint utilizado como accent;
* Graphite utilizado como cor estrutural.

Evitar:

* glassmorphism exagerado;
* neon;
* glow;
* excesso de gradientes;
* roxo/azul genérico de SaaS;
* sombras pesadas;
* border-radius gigantes;
* excesso de cores;
* cards dentro de cards;
* elementos decorativos sem função.

---

# Implementação

Ao implementar a Aflyo em um projeto real:

1. analisar primeiro a arquitetura existente;
2. preservar a lógica do sistema;
3. centralizar design tokens;
4. configurar as fontes;
5. implementar os assets oficiais;
6. padronizar componentes;
7. atualizar layout global;
8. atualizar páginas;
9. revisar responsividade;
10. revisar acessibilidade;
11. realizar QA visual e funcional.

---

# Fonte da verdade

Para decisões técnicas de cores e tipografia:

**este `README.md` é a fonte da verdade.**

Para decisões de linguagem visual:

**as imagens dentro de `/references/` são a fonte visual da verdade.**

Para utilização da marca:

**os arquivos dentro de `/logos/` são os assets oficiais.**

Não criar uma nova identidade visual se a solução já estiver especificada aqui.
