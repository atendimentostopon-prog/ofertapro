# Relatório do Botão de Ajuda — Credenciais Shopee Affiliate

Este documento detalha a implementação do botão de ajuda adicionado na seção de Configurações Adicionais da plataforma Link Oferta.

---

## 1. Onde o Botão foi Adicionado
* **Local:** Na tela de **Configurações** (`/settings`), especificamente dentro da aba **Bot** (na seção de **Configurações Adicionais**).
* **Posição:** Alinhado à direita do título **Credenciais Shopee Affiliate (opcional)** no desktop, quebrando e alinhando-se à esquerda de forma limpa no mobile para evitar qualquer overflow.

---

## 2. Texto Usado no Botão
* **Texto:** `"Como pegar minhas credenciais?"`
* **Ícone:** De ajuda (`HelpCircle` da biblioteca Lucide).

---

## 3. Rota que Ele Abre
* **Rota:** `/automatizacao-shopee`
* **Tipo de Link:** Rota interna via `<Link to="/automatizacao-shopee">` do React Router (navegação de página única sem recarregamento ou dependência de links externos/localhost).

---

## 4. Arquivos Alterados
* [BotTab.tsx](file:///d:/ofertapro/src/components/settings/BotTab.tsx): Importado `HelpCircle` de `lucide-react` e `Link` de `react-router-dom`. Inserido o elemento de link ao lado do título da Shopee.

---

## 5. Responsividade
* **Mobile (320px, 390px, 430px):** O botão quebra responsivamente para baixo do título através de flex-direction dinâmico (`flex-col sm:flex-row`), permanecendo 100% legível e clicável, sem causar vazamento de layout ou overflow.
* **Desktop (768px, 1366px, 1920px):** O botão se alinha perfeitamente ao lado direito do título, mantendo um espaçamento harmônico e refinado em sintonia com o visual premium/dark do Link Oferta.

---

## 6. Resultado do npm run build
* A verificação e o build do projeto passaram com sucesso, sem nenhuma falha de compilação ou de tipos:
```text
> ofertapro@0.0.0 build
> tsc -b && vite build

vite v8.0.11 building client environment for production...
transforming...✓ 2460 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                             0.94 kB │ gzip:   0.51 kB
dist/assets/index-BS-SbEMF.css             90.51 kB │ gzip:  15.32 kB
dist/assets/HistoryService-D7ehVXtw.js      0.32 kB │ gzip:   0.22 kB
dist/assets/index-C6eUzruM.js           1,347.60 kB │ gzip: 374.87 kB

✓ built in 1.76s
```

---

## 7. Pendências Restantes
* Nenhuma. A entrega do botão de ajuda está 100% concluída e testada.
