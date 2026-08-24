# Rebranding para Link Oferta

## 1. Resumo executivo
Este documento detalha o processo de rebranding do SaaS anteriormente conhecido como "OfertaPro" para o seu nome e domínio oficiais: **Link Oferta**. O domínio público foi corrigido em todos os componentes para apontar para `linkoferta.vercel.app`, e as métricas da página pública (vitrine) foram limpas, mantendo apenas informações reais e não-sensíveis para os usuários finais.

## 2. Domínio público corrigido
Todas as referências ao domínio antigo `ofertapro.com` foram localizadas e alteradas para o domínio oficial `linkoferta.vercel.app`. Adicionalmente, foi criada uma constante centralizada em [src/config/app.ts](file:///d:/ofertapro/src/config/app.ts) que expõe a URL pública do app utilizando opcionalmente `import.meta.env.VITE_PUBLIC_APP_URL` ou caindo de volta de forma dinâmica no `window.location.origin` (o que garante o funcionamento tanto em localhost quanto em produção).

## 3. Métricas removidas da página pública
Na página pública da vitrine ([PublicPage.tsx](file:///d:/ofertapro/src/pages/PublicPage.tsx)), removemos as seguintes métricas que poderiam expor dados sensíveis ou soar artificiais:
* **Removido**: Cliques Totais
* **Removido**: Desconto Acumulado (Economia Acumulada)
* **Mantido**: Apenas a métrica de **Ofertas Ativas** (exibida de forma elegante e limpa no cabeçalho do perfil do afiliado).

## 4. Nome do sistema atualizado
O nome visual do sistema foi alterado de **OfertaPro** para **Link Oferta** (ou **LINK OFERTA** quando aplicável) nos seguintes elementos visuais e de SEO:
* Sidebar (Logotipo no topo esquerdo)
* Cabeçalho de Navegação (Página Pública)
* Telas de Login, Cadastro e Boas-Vindas (Onboarding)
* Título da página (`document.title` e tag `<title>` do `index.html`)
* Descrições de SEO e Meta Tags
* Rodapé do app e rodapés de mensagens integradas (Discord/Telegram)

## 5. Arquivos alterados
* [index.html](file:///d:/ofertapro/index.html): Atualização do título e descrição de SEO.
* [src/config/app.ts](file:///d:/ofertapro/src/config/app.ts): Criação de constantes de branding e URL.
* [src/types/index.ts](file:///d:/ofertapro/src/types/index.ts): Atualização nos cabeçalhos de tipos do sistema.
* [src/pages/Settings.tsx](file:///d:/ofertapro/src/pages/Settings.tsx): Tradução de menções em previews e descrições.
* [src/pages/PublicPage.tsx](file:///d:/ofertapro/src/pages/PublicPage.tsx): Remoção das métricas, alteração do domínio do header e SEO da vitrine.
* [src/pages/NewOfferPage.tsx](file:///d:/ofertapro/src/pages/NewOfferPage.tsx): Correção de URLs demonstrativas no formulário de ofertas.
* [src/pages/Login.tsx](file:///d:/ofertapro/src/pages/Login.tsx): Rebranding no formulário de login/cadastro e rodapé.
* [src/pages/Dashboard.tsx](file:///d:/ofertapro/src/pages/Dashboard.tsx): Rebranding na seção de Insights Inteligentes.
* [src/lib/telegram.ts](file:///d:/ofertapro/src/lib/telegram.ts): Ajuste no texto de confirmação de conexão enviada via Bot API.
* [src/lib/sender.ts](file:///d:/ofertapro/src/lib/sender.ts): Ajuste do rodapé do embed no Discord.
* [src/config/features.ts](file:///d:/ofertapro/src/config/features.ts): Alteração do comentário de flags de feature.
* [src/components/Sidebar.tsx](file:///d:/ofertapro/src/components/Sidebar.tsx): Substituição da marca no logotipo da sidebar.
* [src/components/onboarding/PublicPageSetupModal.tsx](file:///d:/ofertapro/src/components/onboarding/PublicPageSetupModal.tsx): Ajuste de domínio e marca no preview móvel do onboarding.
* [src/components/onboarding/OnboardingChecklist.tsx](file:///d:/ofertapro/src/components/onboarding/OnboardingChecklist.tsx): Correção de textos visuais do checklist de onboarding.
* [src/components/modals/OnboardingModal.tsx](file:///d:/ofertapro/src/components/modals/OnboardingModal.tsx): Correção de branding e domínios no onboarding.
* [src/components/modals/ConnectChannelModal.tsx](file:///d:/ofertapro/src/components/modals/ConnectChannelModal.tsx): Tradução de mensagens no sucesso de canal.
* [src/components/feedback/FeedbackButton.tsx](file:///d:/ofertapro/src/components/feedback/FeedbackButton.tsx): Tradução de menções no canal de feedback beta.
* [src/App.tsx](file:///d:/ofertapro/src/App.tsx): Rebranding na tela de erro crítico de boot e chaves.
* [.env.example](file:///d:/ofertapro/.env.example): Adição da nova variável `VITE_PUBLIC_APP_URL`.

## 6. Variáveis de ambiente adicionadas
* **VITE_PUBLIC_APP_URL**: Adicionada ao `.env.example` para preenchimento em builds de produção. Em desenvolvimento, cede ao `window.location.origin` automaticamente.

## 7. Testes realizados
1. **Nome do Aplicativo**: Confirmado o nome **Link Oferta** no formulário de Login, Cadastro, Sidebar e rodapés.
2. **Domínio Visual**: A URL abaixo do nome do usuário na vitrine pública exibe `linkoferta.vercel.app/u/{username}` perfeitamente.
3. **Página Pública (Vitrine)**: As estatísticas de "Cliques totais" e "Desconto acumulado" foram removidas com sucesso. Apenas o card de **Ofertas ativas** é exibido.
4. **Mensagens**: As mensagens enviadas para o Discord e Telegram utilizam o domínio correto no redirecionamento.

## 8. Resultado do build
O build de produção foi gerado sem falhas:
```bash
vite v8.0.11 building client environment for production...
✓ built in 1.58s
dist/assets/index-BUfnABcI.js           1,184.75 kB
```

## 9. Pendências restantes
Nenhuma. Todo o escopo de rebranding visual, domínio público e simplificação de vitrine pública foi concluído com sucesso.
