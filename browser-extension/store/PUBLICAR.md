# Publicar a extensão na Chrome Web Store

Arquivos desta pasta:

| Arquivo | Uso na loja |
|---|---|
| `aflyo-mercadolivre-chrome-web-store.zip` | Pacote para upload (manifest na raiz). Gerado por `browser-extension/pack.sh`. |
| `promo-tile-440x280.png` | Small promo tile (obrigatório) |
| `screenshot-1-diagnostico.png`, `screenshot-2-alerta.png` | Screenshots 1280x800 |
| `../mercadolivre/icons/icon128.png` | Ícone da loja (128x128) |

## 1. Conta de desenvolvedor (uma vez)
1. Entre em https://chrome.google.com/webstore/devconsole com a conta Google que será a dona da extensão.
2. Pague a taxa única de US$ 5 e verifique o e-mail de contato.
3. Ative a verificação em duas etapas na conta Google (a loja exige).

## 2. Enviar o pacote
"Novo item" > envie `aflyo-mercadolivre-chrome-web-store.zip`. Versão atual: 1.1.0.

## 3. Aba "Listagem da loja"
- **Nome:** Aflyo — Automação Mercado Livre
- **Resumo (até 132 caracteres):** Gera links de afiliado do Mercado Livre automaticamente nos disparos do seu bot Aflyo, usando a sua própria sessão.
- **Categoria:** Produtividade
- **Idioma:** Português (Brasil)
- **Descrição detalhada:**

```
A extensão do Aflyo conecta a sua sessão no Mercado Livre à sua conta Aflyo para que os links de afiliado das ofertas do Mercado Livre sejam gerados automaticamente, sem você precisar colar cada link à mão.

COMO FUNCIONA
1. Instale a extensão e cole a sua API Key do Aflyo.
2. Faça login no mercadolivre.com.br no mesmo navegador.
3. Preencha a sua etiqueta de afiliado no painel do Aflyo.
Pronto: quando o seu bot detectar uma oferta do Mercado Livre, o Aflyo gera o link de afiliado da sua conta. Se não tiver certeza de qual produto é, a oferta vai para revisão manual em vez de arriscar um link errado.

O QUE A EXTENSÃO FAZ
- Sincroniza sozinha quando o seu login no Mercado Livre muda, ao abrir o site e periodicamente.
- Mostra um diagnóstico no popup: login no Mercado Livre, chave válida, etiqueta configurada e se o Mercado Livre aceitou a sessão.
- Avisa quando a sessão expira e o que fazer para resolver.

PRIVACIDADE
- Envia apenas cerca de 10 cookies de login do mercadolivre.com.br. Não envia cookies de rastreamento nem de publicidade, e não lê senhas, histórico ou o conteúdo das páginas.
- Os dados vão somente para a sua conta Aflyo e são usados só para gerar os seus links de afiliado.
- Você pode parar a qualquer momento clicando em "Desconectar" ou removendo a extensão.

Requer uma conta Aflyo (aflyo.com.br). Não é um produto oficial do Mercado Livre.
```

- **Ícone:** `icon128.png` · **Screenshots:** os dois PNG · **Small promo tile:** `promo-tile-440x280.png`
- **URL do site:** https://www.aflyo.com.br
- **E-mail/URL de suporte:** informe o seu e-mail de suporte.

## 4. Aba "Práticas de privacidade"
- **Finalidade única:** Sincronizar a sessão de login do usuário no Mercado Livre com a conta Aflyo dele, para gerar links de afiliado automaticamente.
- **Justificativa das permissões:**
  - `cookies`: lê apenas cookies de login/sessão do domínio mercadolivre.com.br (lista fixa de ~10 nomes) para enviá-los à conta Aflyo do próprio usuário, que os usa para gerar links de afiliado. Não lê cookies de outros domínios.
  - `storage`: guarda a chave de API do usuário e o estado da última sincronização.
  - `alarms`: agenda a verificação periódica (25 min) e a espera de 30 s após uma mudança de login, para não enviar em excesso.
  - Acesso ao host `*://*.mercadolivre.com.br/*`: necessário para ler os cookies desse domínio e detectar quando o usuário abre o site.
  - Acesso ao host `https://zuqaccivowbzdfrpgekz.supabase.co/*`: API do Aflyo, para onde a sessão é enviada e de onde o diagnóstico é consultado.
- **Código remoto:** Não, a extensão não carrega nem executa código remoto.
- **Dados coletados:** marque "Informações de autenticação" (cookies de sessão). Não marque os demais.
- **Certificações:** marque as três (não vende dados, não usa fora da finalidade única, não usa para crédito/empréstimo).
- **URL da política de privacidade:** https://app.aflyo.com.br/politica-de-privacidade (a seção 9 trata da extensão).

## 5. Aba "Distribuição"
- Visibilidade: comece como **Não listada** (só quem tem o link instala, ideal para os seus tenants) ou **Pública**.
- Regiões: Brasil (ou todas).

## 6. Enviar para revisão
Clique em "Enviar para revisão". Costuma levar de 1 a 3 dias, mas a permissão `cookies` pode gerar revisão mais longa e um pedido de esclarecimento: responda com as justificativas acima.

## 7. Depois de aprovada
1. Copie o link da extensão na loja e coloque no botão de download da página `/automatizacao-mercadolivre` (mantendo o zip como alternativa).
2. Para lançar uma versão nova: aumente `version` em `mercadolivre/manifest.json`, rode `bash browser-extension/pack.sh` e envie o novo `aflyo-mercadolivre-chrome-web-store.zip` na loja. Quem instala pela loja recebe a atualização automática.
