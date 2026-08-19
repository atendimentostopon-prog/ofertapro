import React, { useEffect, useState } from 'react';
import { 
  ArrowLeft, BookOpen, AlertTriangle, ArrowRight, ExternalLink, 
  Check, Lock, Shield, Clock, ChevronDown, ChevronUp, Info, 
  HelpCircle, FileText, CheckCircle2, Settings 
} from 'lucide-react';
import { Link } from 'react-router-dom';

export const ShopeeAutomationPage: React.FC = () => {
  useEffect(() => {
    document.title = 'Como solicitar a API da Shopee | Aflyo';
    
    // Configuração de meta description para SEO
    const metaDescription = document.querySelector('meta[name="description"]');
    const descriptionText = 'Veja o tutorial completo e passo a passo de como solicitar e cadastrar suas credenciais da API Shopee Affiliate no Aflyo.';
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
      num: '01',
      title: 'Solicitar o acesso no formulário da Shopee',
      desc: 'Acesse o formulário oficial de atendimento de afiliados da Shopee e responda às perguntas da seguinte maneira:',
      bullets: [
        'Responda "Sim" para a pergunta se você já é afiliado.',
        'Selecione "Não, estou com outras dificuldades / dúvidas" na pergunta de login.',
        'Preencha com o seu ID de Afiliado real e o número de telefone correspondente à sua conta.',
        'No tema da dificuldade, escolha "Tenhos dúvidas/ dificuldades com meu cadastro / conta".',
        'No cenário final, selecione "Quero ativar a API".'
      ],
      note: 'Atenção: O ID de afiliado e o telefone informados devem ser exatamente os mesmos cadastrados na sua conta Shopee Affiliate.',
      image: '/shopee-guide/step1.png',
      caption: 'Preenchimento recomendado para o formulário de ativação de API da Shopee.',
      buttonLabel: 'Abrir formulário da Shopee',
      url: shopeeFormUrl
    },
    {
      num: '02',
      title: 'Aguardar o retorno por e-mail',
      desc: 'Após o envio do formulário, a Shopee fará a análise do seu caso e enviará um e-mail de resposta. Fique atento às seguintes informações:',
      bullets: [
        'A análise e liberação costumam levar até 7 dias úteis.',
        'Aguarde o e-mail oficial com a confirmação de que o acesso foi estabelecido.',
        'Após receber o retorno positivo, você poderá prosseguir para o próximo passo no console.'
      ],
      note: 'Importante: A resposta por e-mail confirma a liberação do recurso, mas a disponibilização real das credenciais no painel pode levar algumas horas após o recebimento da mensagem.',
      image: '/shopee-guide/step2.png',
      caption: 'Exemplo de e-mail de confirmação enviado pelo suporte de afiliados da Shopee.',
      buttonLabel: null,
      url: null
    },
    {
      num: '03',
      title: 'Acessar a área da API da Shopee',
      desc: 'Com o acesso liberado, conecte-se ao console de afiliados pelo computador e siga o passo a passo:',
      bullets: [
        'Acesse a área "Open API" ou o menu "Meu API" na Shopee.',
        'Quando a liberação estiver ativa, o botão "Aplicar" ficará habilitado na tela.',
        'Clique em "Aplicar" para expor e gerar o seu App ID e a Secret Key (token de senha).'
      ],
      note: 'Dica: Caso o botão "Aplicar" não apareça imediatamente após receber o e-mail, aguarde um pouco mais ou atualize a página.',
      image: '/shopee-guide/step3.png',
      caption: 'Localização do botão "Aplicar" na seção Meu API da Shopee.',
      buttonLabel: 'Abrir painel Open API',
      url: shopeeOpenApiUrl
    },
    {
      num: '04',
      title: 'Cadastrar as credenciais no Aflyo',
      desc: 'Depois de copiar suas credenciais do console da Shopee, conclua a configuração dentro da sua conta do Aflyo:',
      bullets: [
        'Acesse o painel administrativo do Aflyo.',
        'Vá em Configurações > Configurações Adicionais (aba Bot).',
        'Localize a seção "Credenciais Shopee Affiliate (opcional)".',
        'Insira o seu App ID e a Secret Key nos respectivos campos.',
        'Clique no botão "Salvar configurações".'
      ],
      note: 'Pronto! Suas credenciais estarão salvas com segurança no Aflyo e prontas para rodar integrações automatizadas.',
      image: '/shopee-guide/step4.png',
      caption: 'Seção de preenchimento das credenciais Shopee Affiliate dentro do painel do Aflyo.',
      buttonLabel: null,
      url: null
    }
  ];

  const faqs = [
    {
      q: 'Preciso ser afiliado da Shopee antes de solicitar a API?',
      a: 'Sim. A solicitação da API é um recurso direcionado para quem já possui uma conta de afiliado aprovada e ativa no programa de afiliados da Shopee.'
    },
    {
      q: 'Onde encontro meu ID de afiliado?',
      a: 'O ID de afiliado pode ser encontrado acessando o painel da Shopee Affiliate (geralmente visível nas configurações da conta ou no canto superior da tela do console).'
    },
    {
      q: 'Quanto tempo a Shopee leva para liberar a API?',
      a: 'O tempo médio de análise e resposta informado pela Shopee é de até 7 dias úteis após o envio correto do formulário oficial.'
    },
    {
      q: 'O que fazer se o botão “Aplicar” não aparecer?',
      a: 'Se você já recebeu o e-mail confirmando a liberação e o botão ainda não aparece, tente limpar o cache do navegador, acessar por uma janela anônima ou aguardar mais 24 horas até que a liberação seja propagada no banco de dados da Shopee.'
    },
    {
      q: 'Onde cadastro o App ID e a Secret Key no Aflyo?',
      a: 'No menu principal, acesse Configurações > vá na aba "Bot" > desça até a seção "Configurações Adicionais" > preencha os campos sob "Credenciais Shopee Affiliate (opcional)" e salve.'
    },
    {
      q: 'Posso usar essa integração sem aprovação da Shopee?',
      a: 'Não. Para que a automação e integração de links da Shopee funcionem de forma direta no Aflyo, você precisa obrigatoriamente preencher credenciais válidas e aprovadas pela plataforma.'
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
            to="/settings"
            className="flex items-center gap-2 text-xs font-bold text-[#94A3B8] hover:text-white transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-0.5" />
            Voltar para Configurações
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            <span className="text-sm font-extrabold text-white tracking-tight">Central de Ajuda · Aflyo</span>
          </div>
        </div>

        {/* 1. Hero Principal */}
        <section className="text-center space-y-6 py-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-orange-500/10 border border-orange-500/20 text-[11px] font-bold text-orange-400 rounded-full select-none">
            🍊 Integração Shopee Affiliate
          </div>
          <h1 className="text-3xl sm:text-4.5xl font-black text-white tracking-tight leading-tight max-w-2xl mx-auto">
            Como pegar suas credenciais da Shopee
          </h1>
          <p className="text-sm sm:text-base text-[#94A3B8] leading-relaxed max-w-xl mx-auto font-medium">
            Siga este passo a passo para solicitar acesso à API da Shopee Affiliate e depois cadastrar seu App ID e Secret Key no Aflyo.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 pt-2">
            <a
              href={shopeeFormUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto btn-gradient text-[13px] font-bold px-6 py-3 rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-indigo-950/50 hover:opacity-95 transition-opacity"
            >
              Abrir formulário da Shopee
              <ExternalLink className="w-4 h-4" />
            </a>
            <a
              href={shopeeOpenApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto px-6 py-3 rounded-xl border border-white/5 bg-[#101827]/40 hover:bg-[#101827]/70 text-[13px] font-bold text-[#F8FAFC] flex items-center justify-center gap-2 transition-all"
            >
              Abrir painel Open API
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </section>

        {/* 2. Card de aviso importante */}
        <section className="bg-amber-500/5 border border-amber-500/15 rounded-2xl p-6 sm:p-7 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5.5 h-5.5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-3">
              <h4 className="text-xs sm:text-sm font-extrabold text-amber-400 uppercase tracking-wider">Aviso Importante</h4>
              <ul className="space-y-2 text-xs sm:text-sm text-[#E2E8F0] leading-relaxed font-medium list-disc list-inside">
                <li>Este processo é necessário para quem deseja usar a automação da Shopee no Aflyo.</li>
                <li>O acesso de API não é liberado instantaneamente. A Shopee costuma levar alguns dias para analisar e disponibilizar o acesso.</li>
                <li>A ativação depende exclusivamente da aprovação e critérios de parceiro da própria equipe da Shopee.</li>
                <li>Se você prefere trabalhar de forma manual ou com fluxos simples e diretos, o preenchimento da API pode não ser obrigatório.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* 3. Passo a passo visual com 4 etapas */}
        <section className="space-y-8">
          <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Passo a Passo Detalhado</h2>
          
          <div className="space-y-12">
            {steps.map((step, idx) => (
              <div key={idx} className="glass-card border-white/[0.04] p-6 sm:p-8 space-y-6 relative overflow-hidden">
                {/* Step number watermark */}
                <div className="absolute top-4 right-6 text-6xl sm:text-7xl font-black text-white/[0.02] pointer-events-none select-none">
                  {step.num}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-extrabold px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 rounded-md">
                      PASSO {step.num}
                    </span>
                    <h3 className="text-lg font-black text-white tracking-tight">{step.title}</h3>
                  </div>
                  <p className="text-xs sm:text-sm text-[#94A3B8] leading-relaxed font-medium">{step.desc}</p>
                </div>

                {step.bullets && (
                  <ul className="space-y-2 text-xs sm:text-sm text-slate-300 leading-relaxed font-medium list-disc list-inside pl-1">
                    {step.bullets.map((b, bIdx) => <li key={bIdx}>{b}</li>)}
                  </ul>
                )}

                {/* Paso Image with rounded borders and shadow */}
                {step.image && (
                  <div className="space-y-2.5 pt-2">
                    <div className="border border-white/[0.05] rounded-xl overflow-hidden shadow-2xl bg-[#090e1c]/45 p-1 sm:p-2 max-w-full group/img">
                      <img 
                        src={step.image} 
                        alt={step.title}
                        className="w-full h-auto rounded-lg object-contain block max-h-[620px] mx-auto transition-transform duration-300 group-hover/img:scale-[1.01]"
                      />
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-500 italic text-center font-medium">
                      {step.caption}
                    </p>
                  </div>
                )}

                {step.note && (
                  <div className="p-4 bg-indigo-950/20 border border-indigo-500/15 rounded-xl flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-indigo-300 leading-relaxed font-semibold">
                      {step.note}
                    </p>
                  </div>
                )}

                {step.buttonLabel && step.url && (
                  <div className="pt-2">
                    <a
                      href={step.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-4.5 py-2.5 bg-indigo-600/10 hover:bg-indigo-650/20 border border-indigo-500/20 hover:border-indigo-500/35 text-indigo-400 text-xs font-bold rounded-lg transition-all"
                    >
                      {step.buttonLabel}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* 4. Seção “Depois disso, o que acontece?” */}
        <section className="glass-card border-white/[0.04] p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
              <CheckCircle2 className="w-4.5 h-4.5 text-indigo-400" />
            </div>
            <h3 className="text-[17px] font-extrabold text-white tracking-tight">Depois disso, o que acontece?</h3>
          </div>
          
          <div className="space-y-3 text-xs sm:text-sm text-[#94A3B8] leading-relaxed font-medium">
            <p>
              Após cadastrar as credenciais da Shopee Affiliate corretamente nas suas configurações, o Aflyo passará a utilizar a integração direta para automatizar e otimizar a substituição e o processamento de links da plataforma Shopee conforme as definições habilitadas no seu painel.
            </p>
            <p>
              Isso garante maior agilidade no gerenciamento de ofertas e permite que suas publicações automáticas contem com a correta vinculação dos tokens e parâmetros oficiais da Shopee.
            </p>
          </div>
        </section>

        {/* 5. FAQ */}
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

        {/* 6. CTA final */}
        <section className="p-8 sm:p-10 bg-gradient-to-r from-indigo-950/40 to-slate-950/40 border border-indigo-500/15 rounded-3xl text-center space-y-5 relative overflow-hidden">
          {/* Subtle overlay glow */}
          <div className="absolute inset-0 bg-indigo-500/[0.02] pointer-events-none" />
          
          <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">
            Pronto para configurar sua integração?
          </h3>
          <p className="text-xs sm:text-sm text-[#94A3B8] max-w-lg mx-auto leading-relaxed font-medium">
            Retorne às configurações do painel administrativo do Aflyo para colar o seu App ID e Secret Key salvos.
          </p>
          <div className="flex justify-center pt-2">
            <Link
              to="/settings"
              className="w-full sm:w-auto btn-gradient text-xs font-bold px-6 py-3 rounded-lg flex items-center justify-center gap-1.5 shadow-md shadow-indigo-950/40"
            >
              <Settings className="w-4 h-4" />
              Voltar para as configurações
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
};

export default ShopeeAutomationPage;
