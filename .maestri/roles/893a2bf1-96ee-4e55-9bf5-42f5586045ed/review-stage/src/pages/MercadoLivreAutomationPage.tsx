import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, BookOpen, AlertTriangle,
  ChevronDown, ChevronUp, Info, HelpCircle, CheckCircle2, Settings, Puzzle, Key, Link2, Download,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { APP_NAME } from '../config/app';

const EXTENSION_DOWNLOAD_URL = '/extensions/aflyo-mercadolivre-extension.zip';

export const MercadoLivreAutomationPage: React.FC = () => {
  useEffect(() => {
    document.title = `Como automatizar links do Mercado Livre | ${APP_NAME}`;

    const metaDescription = document.querySelector('meta[name="description"]');
    const descriptionText = `Veja como instalar e conectar a extensão do ${APP_NAME} para gerar links de afiliado do Mercado Livre automaticamente.`;
    if (metaDescription) {
      metaDescription.setAttribute('content', descriptionText);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = descriptionText;
      document.head.appendChild(meta);
    }
  }, []);

  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const steps = [
    {
      num: '01',
      title: 'Baixar a extensão do Chrome',
      desc: `A extensão do ${APP_NAME} para Mercado Livre ainda não está na Chrome Web Store. Você baixa o arquivo aqui e carrega no Chrome manualmente. É rápido, leva menos de 2 minutos:`,
      bullets: [
        'Clique no botão abaixo para baixar o arquivo .zip da extensão.',
        'Descompacte o arquivo numa pasta do seu computador.',
        'Abra chrome://extensions na barra de endereço do Chrome.',
        'Ative "Modo do desenvolvedor" no canto superior direito da tela.',
        'Clique em "Carregar sem compactação" e selecione a pasta descompactada.',
      ],
      note: 'O ícone do Aflyo deve aparecer na barra de extensões do Chrome depois desse passo.',
      buttonLabel: 'Baixar extensão (.zip)',
      url: EXTENSION_DOWNLOAD_URL,
    },
    {
      num: '02',
      title: `Gerar sua API Key do ${APP_NAME}`,
      desc: 'A extensão precisa de uma credencial para saber que a conta é sua e salvar os dados no lugar certo:',
      bullets: [
        `No menu lateral do ${APP_NAME}, abra "Integrações" e clique na aba "API & Integrações".`,
        'Clique em "Gerar API Key" (se ainda não tiver uma).',
        'Copie a chave gerada (começa com lof_live_...).',
      ],
      note: 'Guarde essa chave com cuidado, ela dá acesso à sua conta. Se desconfiar de vazamento, regenere a qualquer momento.',
      buttonLabel: null,
      url: null,
    },
    {
      num: '03',
      title: 'Conectar a extensão',
      desc: 'Com a chave em mãos, ative a sincronização:',
      bullets: [
        'Clique no ícone do Aflyo na barra do Chrome para abrir a extensão.',
        'Cole sua API Key no campo indicado.',
        'Clique em "Conectar".',
        'Se ainda não estiver, faça login em mercadolivre.com.br numa aba do mesmo navegador.',
      ],
      note: 'O status muda para "Conectado" quando a sincronização funciona. A extensão repete essa sincronização sozinha a cada 25 minutos enquanto o Chrome estiver aberto.',
      buttonLabel: null,
      url: null,
    },
    {
      num: '04',
      title: `Cadastrar sua tag de afiliado no ${APP_NAME}`,
      desc: 'Falta um último dado, a mesma tag que você já usa no painel de afiliados do Mercado Livre:',
      bullets: [
        `No menu lateral do ${APP_NAME}, abra "Integrações" e fique na aba "Bot".`,
        'Desça até a seção "Configurações Adicionais" e localize "Mercado Livre (opcional)".',
        'Preencha o campo "Tag de afiliado Mercado Livre".',
        'Clique em "Salvar configurações".',
      ],
      note: 'Pronto. A partir daqui, ofertas do Mercado Livre detectadas nos seus grupos de origem geram link de afiliado automaticamente, sem precisar de revisão manual.',
      buttonLabel: null,
      url: null,
    },
  ];

  const faqs = [
    {
      q: 'Isso é um recurso oficial do Mercado Livre?',
      a: 'Não. O Mercado Livre não oferece uma API pública de afiliados. A extensão usa a mesma técnica de ferramentas parecidas no mercado: aproveita a sua própria sessão logada no site para automatizar a geração do link, do mesmo jeito que aconteceria se você clicasse manualmente no painel de afiliados deles. Por não ser um recurso oficial, pode parar de funcionar sem aviso se o Mercado Livre mudar algo no site deles. Nesse caso a oferta simplesmente volta a cair na revisão manual, como já acontecia antes.',
    },
    {
      q: 'Preciso deixar o Chrome aberto o tempo todo?',
      a: 'A extensão só sincroniza enquanto o Chrome está aberto (ela roda em segundo plano a cada 25 minutos). Se o computador ficar desligado por muito tempo, a sessão do Mercado Livre pode expirar. Nesse caso, basta abrir o Chrome de novo com o Mercado Livre logado que a próxima sincronização resolve sozinha.',
    },
    {
      q: 'O que fazer se aparecer "sessão expirada" ou erro parecido?',
      a: 'Abra o mercadolivre.com.br numa aba e confirme que sua conta ainda está logada (às vezes o Mercado Livre desloga sozinho por segurança). Depois de logar de novo, clique no ícone da extensão para forçar uma nova sincronização.',
    },
    {
      q: 'Isso é seguro? Que dado é enviado?',
      a: `Só os cookies da sua sessão no mercadolivre.com.br são enviados, direto do seu navegador para os servidores do ${APP_NAME}, nunca para terceiros. Eles ficam associados só à sua conta e são usados exclusivamente para gerar seus próprios links de afiliado.`,
    },
    {
      q: 'E se eu não quiser usar a extensão?',
      a: 'Sem problema. Sem ela, ofertas do Mercado Livre continuam funcionando exatamente como hoje: você recebe o aviso no Telegram e responde colando o link de afiliado manualmente.',
    },
    {
      q: 'Onde cadastro minha tag de afiliado?',
      a: 'No menu lateral, em Integrações > aba "Bot" > seção "Configurações Adicionais" > "Mercado Livre (opcional)". É a mesma tag que aparece no seu painel de afiliados do próprio Mercado Livre.',
    },
  ];

  return (
    <div className="min-h-screen bg-surface-1 text-ink py-12 px-4 sm:px-6 relative overflow-hidden font-sans">
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-mint-400/10 rounded-full blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-graphite/5 rounded-full blur-3xl opacity-50 pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-12">
        <div className="flex items-center justify-between pb-6 border-b border-line select-none">
          <Link
            to="/integrations?tab=bot"
            className="flex items-center gap-2 text-xs font-bold text-ink-secondary hover:text-ink transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Voltar para Integrações
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-ice border border-mint-200 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-mint-700" />
            </div>
            <span className="text-sm font-extrabold text-ink tracking-tight">Central de Ajuda · {APP_NAME}</span>
          </div>
        </div>

        <section className="text-center space-y-6 py-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-yellow-500/10 border border-yellow-500/20 text-[11px] font-bold text-yellow-600 rounded-full select-none">
            Automação Mercado Livre
          </div>
          <h1 className="text-3xl sm:text-4.5xl font-black text-ink tracking-tight leading-tight max-w-2xl mx-auto">
            Como automatizar seus links do Mercado Livre
          </h1>
          <p className="text-sm sm:text-base text-ink-secondary leading-relaxed max-w-xl mx-auto font-medium">
            Instale a extensão do Chrome, conecte com sua conta e o {APP_NAME} passa a gerar o link de afiliado do Mercado Livre sozinho, sem revisão manual.
          </p>
          <div className="flex justify-center pt-1">
            <a
              href={EXTENSION_DOWNLOAD_URL}
              download
              className="inline-flex items-center gap-2 btn-gradient text-xs font-bold px-6 py-3 rounded-lg shadow-md"
            >
              <Download className="w-4 h-4" />
              Baixar extensão (.zip)
            </a>
          </div>
        </section>

        <section className="bg-warning-bg border border-warning/20 rounded-2xl p-6 sm:p-7 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5.5 h-5.5 text-warning-ink flex-shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-extrabold text-warning-ink uppercase tracking-wider">Aviso Importante</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-ink-secondary leading-relaxed font-medium list-disc list-inside">
                <li>Esse recurso é opcional. Sem ele, ofertas do Mercado Livre continuam indo pra revisão manual normalmente.</li>
                <li>Não é um recurso oficial do Mercado Livre. Pode parar de funcionar sem aviso se eles mudarem algo no site.</li>
                <li>A extensão precisa do Chrome aberto e você logado no Mercado Livre para sincronizar.</li>
                <li>Ainda não está na Chrome Web Store. A instalação é manual ("carregar sem compactação").</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <h2 className="text-xl sm:text-2xl font-black text-ink tracking-tight">Passo a Passo</h2>

          <div className="space-y-12">
            {steps.map((step, idx) => (
              <div key={idx} className="glass-card border-line p-6 sm:p-8 space-y-6 relative overflow-hidden">
                <div className="absolute top-4 right-6 text-6xl sm:text-7xl font-black text-ink/[0.04] pointer-events-none select-none">
                  {step.num}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-extrabold px-2.5 py-1 bg-ice border border-mint-200 text-mint-700 rounded-md">
                      PASSO {step.num}
                    </span>
                    <h3 className="text-lg font-black text-ink tracking-tight">{step.title}</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed font-medium">{step.desc}</p>
                </div>

                {step.bullets && (
                  <ul className="space-y-2 text-xs sm:text-sm text-ink leading-relaxed font-medium list-disc list-inside pl-1">
                    {step.bullets.map((b, bIdx) => <li key={bIdx}>{b}</li>)}
                  </ul>
                )}

                {step.note && (
                  <div className="p-4 bg-surface-1 border border-mint-200 rounded-xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-mint-700 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-mint-800 leading-relaxed font-semibold">
                      {step.note}
                    </p>
                  </div>
                )}

                {step.url && step.buttonLabel && (
                  <a
                    href={step.url}
                    download
                    className="inline-flex items-center gap-2 btn-gradient text-xs font-bold px-5 py-3 rounded-lg shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    {step.buttonLabel}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card border-line p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-ice border border-mint-200 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-mint-700" />
            </div>
            <h3 className="text-[17px] font-extrabold text-ink tracking-tight">Como funciona, no dia a dia</h3>
          </div>

          <div className="space-y-3 text-xs sm:text-sm text-ink-secondary leading-relaxed font-medium">
            <div className="flex items-start gap-2.5">
              <Puzzle className="w-4 h-4 text-mint-700 mt-0.5 flex-shrink-0" />
              <p>A extensão roda em segundo plano no seu Chrome, capturando sua sessão do Mercado Livre a cada 25 minutos.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Key className="w-4 h-4 text-mint-700 mt-0.5 flex-shrink-0" />
              <p>Essa sessão fica salva com segurança na sua conta do {APP_NAME}, associada só ao seu usuário.</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Link2 className="w-4 h-4 text-mint-700 mt-0.5 flex-shrink-0" />
              <p>Quando o bot encontra uma oferta do Mercado Livre num dos seus grupos de origem, ele usa essa sessão pra gerar o link de afiliado na hora e publicar direto, sem esperar você responder um aviso manual.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-ice border border-mint-200 flex items-center justify-center">
              <HelpCircle className="w-4.5 h-4.5 text-mint-700" />
            </div>
            <h3 className="text-lg font-extrabold text-ink tracking-tight">Perguntas Frequentes (FAQ)</h3>
          </div>

          <div className="space-y-2.5">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div
                  key={idx}
                  className={`border rounded-xl transition-all duration-200 overflow-hidden ${
                    isOpen
                      ? 'border-mint-200 bg-surface-1/5'
                      : 'border-line bg-surface-0/30 hover:bg-surface-0/60'
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full flex items-center justify-between p-4 text-left cursor-pointer transition-colors"
                  >
                    <span className="text-xs sm:text-sm font-bold text-ink pr-4">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-mint-700 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-ink-tertiary flex-shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-line-subtle">
                      <p className="text-xs sm:text-sm text-ink-secondary leading-relaxed font-medium">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="p-8 sm:p-10 bg-graphite border border-graphite rounded-3xl text-center space-y-5 relative overflow-hidden">
          <div className="absolute inset-0 bg-mint-500/[0.06] pointer-events-none" />

          <h3 className="text-xl sm:text-2xl font-black text-ink-inverse tracking-tight">
            Pronto pra automatizar?
          </h3>
          <p className="text-xs sm:text-sm text-ink-inverse/70 max-w-lg mx-auto leading-relaxed font-medium">
            Abra "Integrações" no menu lateral para gerar sua API Key (aba "API & Integrações") e cadastrar sua tag de afiliado (aba "Bot").
          </p>
          <div className="flex justify-center pt-2">
            <Link
              to="/integrations?tab=bot"
              className="w-full sm:w-auto btn-gradient text-xs font-bold px-6 py-3 rounded-lg flex items-center justify-center gap-1.5 shadow-md"
            >
              <Settings className="w-4 h-4" />
              Ir para Integrações
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default MercadoLivreAutomationPage;
