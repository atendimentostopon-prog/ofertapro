import React, { useEffect } from 'react';
import { Eye, ArrowLeft } from 'lucide-react';

const PoliticaCookies: React.FC = () => {
  useEffect(() => {
    document.title = 'Política de Cookies | Link Oferta';
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
            <Eye className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-extrabold text-white tracking-tight">Link Oferta</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-[#101827]/60 backdrop-blur-xl border border-white/[0.06] rounded-3xl p-8 sm:p-12 space-y-6 shadow-2xl">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Política de Cookies</h1>
            <p className="text-xs text-[#64748B] font-semibold">Última atualização: 17 de junho de 2026</p>
          </div>

          <div className="space-y-6 text-sm text-[#94A3B8] leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">1. O que são Cookies?</h2>
              <p>
                Cookies são pequenos arquivos de texto armazenados no seu navegador ou dispositivo quando você visita determinados websites. Eles servem para que o sistema se lembre de suas ações e preferências de navegação ao longo do tempo, garantindo uma experiência mais rápida, fluida e personalizada.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">2. Como Utilizamos os Cookies?</h2>
              <p>
                O <strong>Link Oferta</strong> utiliza cookies e tecnologias similares de armazenamento (como localStorage e cookies de sessão) para garantir o funcionamento adequado dos nossos serviços digitais, em especial:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Manter a segurança e a integridade de sua sessão de usuário logado.</li>
                <li>Lembrar suas configurações de layout e preferências estéticas.</li>
                <li>Verificar se você já deu o consentimento de conformidade com a LGPD para ocultar o banner de aviso.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">3. Categorias de Cookies Usados</h2>
              <p>
                Dividimos os cookies que utilizamos nas seguintes categorias:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Cookies Essenciais (Estritamente Necessários):</strong> São cookies fundamentais para o funcionamento do painel e login do Link Oferta. Sem estes cookies, serviços básicos como autenticação no Supabase ou manutenção do carrinho e segurança das sessões não podem ser prestados. Eles não podem ser desativados.
                </li>
                <li>
                  <strong>Cookies Funcionais:</strong> Armazenam informações sobre escolhas que você fez na plataforma (como preferências de idioma ou o fechamento de avisos rápidos), personalizando a sua experiência de uso no painel.
                </li>
                <li>
                  <strong>Cookies Analíticos e de Desempenho:</strong> Podem ser ativados opcionalmente para nos ajudar a entender como os usuários interagem com as vitrines, identificando falhas de carregamento e melhorando o fluxo geral da página. Não salvamos informações confidenciais nestes arquivos.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">4. Cookies de Terceiros</h2>
              <p>
                Em certas áreas do sistema, o Supabase (nossa plataforma de infraestrutura e autenticação) poderá utilizar cookies específicos de segurança para validar tokens de sessão e proteger contra ataques cibernéticos maliciosos. Tais cookies são regulados pela política do próprio Supabase e possuem fins puramente de segurança e estabilidade.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">5. Como Gerenciar Seus Cookies</h2>
              <p>
                Você pode optar por aceitar ou rejeitar cookies a qualquer momento:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Na nossa plataforma:</strong> Ao abrir o site pela primeira vez, você pode optar por aceitar todos os cookies, rejeitar opcionais ("Somente essenciais") nas configurações do banner.</li>
                <li><strong>No seu navegador:</strong> Você pode ajustar as configurações do seu navegador de internet para recusar todos os cookies ou para indicar quando um cookie está sendo enviado. Observe que, ao bloquear cookies essenciais, alguns recursos da nossa área logada deixarão de funcionar corretamente.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">6. Alterações nesta Política</h2>
              <p>
                Podemos revisar esta Política de Cookies periodicamente para adequações a novas leis ou mudanças operacionais na plataforma. Recomendamos que você revise esta página de tempos em tempos para se manter informado.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoliticaCookies;
