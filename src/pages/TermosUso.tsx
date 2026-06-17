import React, { useEffect } from 'react';
import { FileText, ArrowLeft } from 'lucide-react';

const TermosUso: React.FC = () => {
  useEffect(() => {
    document.title = 'Termos de Uso | Link Oferta';
  }, []);

  return (
    <div className="min-h-screen bg-[#070A12] text-[#F8FAFC] py-16 px-4 sm:px-6 relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-[#7C3AED]/5 rounded-full blur-3xl opacity-50 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-[#6366F1]/5 rounded-full blur-3xl opacity-45 pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10">
        {/* Navigation / Header */}
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-white/[0.06]">
          <button
            onClick={() => window.close()}
            className="flex items-center gap-2 text-xs font-bold text-[#94A3B8] hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </button>
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-extrabold text-white tracking-tight">Link Oferta</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-[#101827]/60 backdrop-blur-xl border border-white/[0.06] rounded-3xl p-8 sm:p-12 space-y-6 shadow-2xl">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Termos de Uso</h1>
            <p className="text-xs text-[#64748B] font-semibold">Última atualização: 17 de junho de 2026</p>
          </div>

          <div className="space-y-6 text-sm text-[#94A3B8] leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">1. Relação Contratual</h2>
              <p>
                Bem-vindo ao <strong>Link Oferta</strong>. Ao se cadastrar ou utilizar nossa plataforma, você concorda expressamente em cumprir e vincular-se a estes Termos de Uso. Caso não concorde com qualquer termo estabelecido, você não deverá acessar ou utilizar nossos serviços.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">2. Elegibilidade e Cadastro de Conta</h2>
              <p>
                Para utilizar a plataforma, você deve ter capacidade legal plena. O cadastro exige a criação de uma senha segura e e-mail ativo. Você é inteiramente responsável por manter a confidencialidade de sua senha e por todas as atividades que ocorram sob o uso de sua conta pessoal. O compartilhamento de credenciais de login com terceiros é estritamente proibido.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">3. Regras de Conduta e Uso Aceitável</h2>
              <p>
                O usuário compromete-se a usar o Link Oferta de boa-fé. É expressamente vedado:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Publicar ou disseminar links de ofertas falsas, enganosas, ou que configurem golpes financeiros e esquemas de pirâmide.</li>
                <li>Cadastrar links que redirecionem para vírus, malware ou qualquer software nocivo aos usuários finais.</li>
                <li>Utilizar ferramentas automatizadas (scripts, bots) de forma abusiva que afetem a integridade e o desempenho dos nossos servidores ou do banco de dados do Supabase.</li>
                <li>Infringir direitos autorais ou propriedade intelectual de terceiros nas imagens ou nomes de produtos inseridos.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">4. Propriedade Intelectual</h2>
              <p>
                Todo o conteúdo visual, códigos de programação, interfaces, designs, marcas, logotipos e patentes relacionados à plataforma são de propriedade exclusiva do <strong>Link Oferta</strong>. O uso do serviço confere a você uma licença temporária, revogável, não-exclusiva e pessoal, limitada ao painel e vitrines providos de acordo com seu plano atual.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">5. Limitação de Responsabilidade</h2>
              <p>
                O Link Oferta funciona como uma plataforma facilitadora de organização de links e vitrines. Nós não garantimos vendas, tráfego ou lucros decorrentes da divulgação de seus links. Também não nos responsabilizamos pelas transações efetuadas entre o seu público final e as lojas parceiras (como Mercado Livre, Amazon, Shopee, Magalu e AliExpress). Qualquer problema relativo à compra do produto deve ser resolvido junto ao respectivo marketplace.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">6. Versão Beta e Disponibilidade</h2>
              <p>
                A plataforma pode operar em versão Beta ou de testes contínuos para novos recursos. Sendo assim, o sistema é fornecido "como está" e "conforme disponível". Podemos suspender temporariamente o painel para manutenção, atualizações ou correção de falhas críticas sem aviso prévio.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">7. Suspensão ou Encerramento de Conta</h2>
              <p>
                Reservamo-nos o direito de suspender temporariamente ou encerrar definitivamente a conta de qualquer usuário que viole reiteradamente estes termos, realize fraudes, publique conteúdo impróprio ou infrinja leis vigentes no Brasil, sem direito a qualquer compensação financeira.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">8. Modificações dos Termos</h2>
              <p>
                Podemos modificar estes termos a qualquer momento para refletir mudanças operacionais, regulatórias ou de segurança. Ao continuar a usar o Link Oferta após a data das atualizações, você aceita implicitamente as novas regras contratuais.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TermosUso;
