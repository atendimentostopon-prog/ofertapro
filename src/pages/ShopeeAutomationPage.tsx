import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, BookOpen, AlertTriangle, ArrowRight, ExternalLink, 
  Check, Lock, Shield, Clock, ChevronDown, ChevronUp, Info, 
  HelpCircle, FileText, CheckCircle2 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const ShopeeAutomationPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Como solicitar a API da Shopee | Link Oferta';
    
    // Configuração de meta description para SEO
    const metaDescription = document.querySelector('meta[name="description"]');
    const descriptionText = 'Veja o passo a passo para solicitar a API da Shopee, acessar suas credenciais e preparar sua conta para automações de afiliados no Link Oferta.';
    if (metaDescription) {
      metaDescription.setAttribute('content', descriptionText);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'description';
      meta.content = descriptionText;
      document.head.appendChild(meta);
    }
  }, []);

  // FAQ state
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex(openFaqIndex === index ? null : index);
  };

  const shopeeFormUrl = 'https://help.shopee.com.br/portal/webform/bbce78695c364ba18c9cbceb74ec9091';
  const shopeeOpenApiUrl = 'https://affiliate.shopee.com.br/open_api';

  const steps = [
    {
      title: 'Passo 1 — Solicite suas chaves API',
      text: 'Acesse o formulário oficial da Shopee e preencha as informações solicitadas, como ID de afiliado e telefone de contato. Revise os dados antes de enviar.',
      buttonLabel: 'Abrir formulário da Shopee',
      url: shopeeFormUrl
    },
    {
      title: 'Passo 2 — Aguarde a resposta da Shopee',
      text: 'Após o envio, acompanhe seu e-mail. A Shopee poderá enviar uma confirmação ou atualização sobre a disponibilidade da sua API. O prazo pode variar conforme a análise da plataforma.',
      buttonLabel: null,
      url: null
    },
    {
      title: 'Passo 3 — Acesse a área Open API',
      text: 'Quando sua API estiver disponível, acesse a página de Open API da Shopee pelo computador. Caso a liberação esteja ativa, o botão de aplicação/ativação deverá estar disponível para exibir suas credenciais.',
      buttonLabel: 'Abrir Open API Shopee',
      url: shopeeOpenApiUrl
    },
    {
      title: 'Passo 4 — Salve suas credenciais com segurança',
      text: 'Depois que a Shopee liberar suas credenciais, copie o ID e o token/senha com cuidado. Guarde essas informações em local seguro e nunca compartilhe publicamente.',
      buttonLabel: null,
      url: null
    }
  ];

  const precautions = [
    'Não publique seu token em grupos, sites ou prints.',
    'Não envie suas credenciais para terceiros.',
    'Use apenas páginas oficiais da Shopee.',
    'Revise se o link acessado pertence ao domínio oficial da Shopee.',
    'Em caso de dúvida, consulte o suporte oficial da Shopee.'
  ];

  const faqs = [
    {
      q: 'Preciso obrigatoriamente da API para divulgar produtos da Shopee?',
      a: 'Não necessariamente. Para muitos afiliados, o link de afiliado tradicional já é suficiente. A API é mais útil quando você deseja automação, integração com ferramentas ou operação em equipe.'
    },
    {
      q: 'Quanto tempo a Shopee demora para liberar a API?',
      a: 'O prazo pode variar. Após enviar o formulário, acompanhe o e-mail informado na solicitação.'
    },
    {
      q: 'Onde encontro minhas credenciais depois da aprovação?',
      a: 'Na área de Open API da Shopee, acessando pelo computador com sua conta de afiliado.'
    },
    {
      q: 'Posso compartilhar meu token com outras pessoas?',
      a: 'Não. O token é uma credencial sensível. Compartilhar esse dado pode colocar sua conta e suas integrações em risco.'
    },
    {
      q: 'Links da Shopee Vídeo funcionam da mesma forma?',
      a: 'Podem existir limitações específicas para links da Shopee Vídeo. Quando necessário, utilize o link gerado diretamente pela sua conta Shopee.'
    }
  ];

  return (
    <div className="min-h-screen bg-[#070A12] text-[#F8FAFC] py-12 px-4 sm:px-6 relative overflow-hidden font-sans">
      {/* Background Glow Emitters */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-[#7C3AED]/5 rounded-full blur-3xl opacity-60 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#6366F1]/5 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute top-[40%] right-[20%] w-[400px] h-[400px] bg-[#4F46E5]/3 rounded-full blur-3xl opacity-40 pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-12">
        {/* Navigation Bar / Header */}
        <div className="flex items-center justify-between pb-6 border-b border-white/[0.06] select-none">
          <Link
            to="/login"
            className="flex items-center gap-2 text-xs font-bold text-[#94A3B8] hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Voltar ao Login
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-sm font-extrabold text-white tracking-tight">Ajuda · Link Oferta</span>
          </div>
        </div>

        {/* 1. Hero Principal */}
        <section className="text-center space-y-6 py-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-[11px] font-bold text-orange-400 rounded-full select-none animate-pulse">
            🧡 Integração Shopee Affiliate
          </div>
          <h1 className="text-3xl sm:text-4.5xl font-black text-white tracking-tight leading-tight max-w-2xl mx-auto">
            Como solicitar a API da Shopee
          </h1>
          <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed max-w-xl mx-auto font-medium">
            Aprenda o passo a passo para pedir suas credenciais de API da Shopee e preparar sua conta para automações de afiliados no Link Oferta.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <a
              href={shopeeFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto btn-gradient text-[13px] font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 hover:opacity-95 transition-opacity"
            >
              Solicitar API da Shopee
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={shopeeOpenApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/5 bg-[#101827]/40 hover:bg-[#101827]/70 text-[13px] font-bold text-[#F8FAFC] flex items-center justify-center gap-2 transition-all"
            >
              Acessar Open API Shopee
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </section>

        {/* 2. Aviso importante */}
        <section className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h4 className="text-xs sm:text-sm font-extrabold text-amber-400 uppercase tracking-wider">Aviso Importante</h4>
              <p className="text-xs sm:text-sm text-[#E2E8F0] leading-relaxed font-medium">
                Antes de começar, tenha em mãos seu ID de afiliado da Shopee e um número de telefone válido. A liberação da API depende da análise e resposta da própria Shopee.
              </p>
              <p className="text-xs sm:text-sm text-[#E2E8F0] leading-relaxed font-medium pt-1">
                Links da Shopee Vídeo podem ter regras diferentes e podem não ser convertidos automaticamente. Para esses casos, use o link gerado diretamente na sua conta Shopee.
              </p>
            </div>
          </div>
        </section>

        {/* 3. Seção “Quando preciso solicitar a API?” */}
        <section className="glass-card overflow-hidden border-white/[0.04] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <Info className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <h3 className="text-[17px] font-extrabold text-white tracking-tight">Quando preciso solicitar a API?</h3>
          </div>
          <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed font-medium">
            A API da Shopee é indicada para afiliados que desejam automatizar ou integrar processos, principalmente quando trabalham com equipe, bot, painel próprio ou múltiplos fluxos de divulgação. Com as credenciais corretas, o Link Oferta poderá usar os dados autorizados para melhorar a automação dos links da Shopee.
          </p>
        </section>

        {/* 4. Passo a passo (Timeline / Stepper) */}
        <section className="space-y-6">
          <h3 className="text-xl font-black text-white tracking-tight">Passo a Passo para Solicitação</h3>
          
          <div className="relative border-l border-white/[0.06] ml-4 pl-6 sm:pl-8 space-y-10">
            {steps.map((step, idx) => (
              <div key={idx} className="relative space-y-3">
                {/* Stepper Circle Bullet */}
                <div className="absolute left-[-39px] sm:left-[-47px] top-0.5 w-6 h-6 rounded-full bg-[#101827] border border-indigo-500 flex items-center justify-center text-[10px] font-black text-indigo-400 shadow-md">
                  {idx + 1}
                </div>

                <div className="glass-card border-white/[0.04] p-5 space-y-3">
                  <h4 className="text-sm font-extrabold text-slate-100 tracking-tight">{step.title}</h4>
                  <p className="text-xs text-[#94A3B8] leading-relaxed font-medium">{step.text}</p>
                  
                  {step.buttonLabel && step.url && (
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-650/20 border border-indigo-500/20 hover:border-indigo-500/35 text-indigo-400 text-[11px] font-bold rounded-lg transition-all"
                    >
                      {step.buttonLabel}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Seção “Depois que eu receber a API, o que faço?” */}
        <section className="glass-card border-white/[0.04] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <h3 className="text-[17px] font-extrabold text-white tracking-tight">Depois que eu receber a API, o que faço?</h3>
          </div>
          
          <div className="space-y-3 text-xs sm:text-sm text-[#94A3B8] leading-relaxed font-medium">
            <p>
              Assim que você tiver suas credenciais da Shopee, acesse o painel do Link Oferta e vá até a área de configurações ou integrações da Shopee. Cole as informações solicitadas e salve. Depois disso, você poderá usar a integração conforme os recursos disponíveis na sua conta.
            </p>
            <div className="p-3 bg-[#0B1020]/50 border border-white/5 rounded-xl flex items-center gap-2 mt-2">
              <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <p className="text-[11px] text-[#64748B]">
                <strong>Nota:</strong> Se a integração Shopee ainda não estiver visível no seu painel, guarde suas credenciais e aguarde a liberação do módulo correspondente.
              </p>
            </div>
          </div>
        </section>

        {/* 6. Seção de segurança */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Lock className="w-4.5 h-4.5 text-rose-400" />
            </div>
            <h3 className="text-lg font-extrabold text-white tracking-tight">Cuidados importantes</h3>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {precautions.map((prec, idx) => (
              <div key={idx} className="p-4 bg-[#101827]/40 border border-white/5 rounded-xl flex items-start gap-2.5 shadow-sm">
                <Shield className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-[#94A3B8] leading-relaxed font-medium">{prec}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7. FAQ */}
        <section className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <HelpCircle className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <h3 className="text-lg font-extrabold text-white tracking-tight">Perguntas Frequentes (FAQ)</h3>
          </div>

          <div className="space-y-2.5">
            {faqs.map((faq, idx) => {
              const isOpen = openFaqIndex === idx;
              return (
                <div 
                  key={idx} 
                  className={`border rounded-xl transition-all duration-200 overflow-hidden ${
                    isOpen 
                      ? 'border-indigo-500/20 bg-indigo-950/5' 
                      : 'border-white/5 bg-[#101827]/30 hover:bg-[#101827]/60'
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(idx)}
                    className="w-full flex items-center justify-between p-4 text-left cursor-pointer transition-colors"
                  >
                    <span className="text-xs sm:text-sm font-bold text-slate-100 pr-4">{faq.q}</span>
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    )}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 pt-1 border-t border-white/[0.03]">
                      <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed font-medium">
                        {faq.a}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 8. CTA Final */}
        <section className="p-8 sm:p-10 bg-gradient-to-r from-indigo-950/40 to-slate-950/40 border border-indigo-500/15 rounded-3xl text-center space-y-5 relative overflow-hidden">
          {/* Subtle overlay glow */}
          <div className="absolute inset-0 bg-indigo-500/[0.02] pointer-events-none" />
          
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Pronto para automatizar suas ofertas da Shopee?
          </h3>
          <p className="text-xs sm:text-sm text-[#94A3B8] max-w-lg mx-auto leading-relaxed font-medium">
            Solicite suas credenciais, aguarde a liberação da Shopee e depois configure tudo no Link Oferta.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <a
              href={shopeeFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto btn-gradient text-xs font-bold px-5 py-2.5 rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950/40"
            >
              Solicitar API da Shopee
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <a
              href={shopeeOpenApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg border border-white/5 bg-[#101827]/40 hover:bg-[#101827]/70 text-xs font-bold text-[#F8FAFC] flex items-center justify-center gap-1.5 transition-all"
            >
              Acessar Open API
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ShopeeAutomationPage;
