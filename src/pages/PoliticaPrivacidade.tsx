import React, { useEffect } from 'react';
import { Shield, ArrowLeft } from 'lucide-react';

const PoliticaPrivacidade: React.FC = () => {
  useEffect(() => {
    document.title = 'Política de Privacidade | Link Oferta';
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
            <Shield className="w-5 h-5 text-indigo-400" />
            <span className="text-sm font-extrabold text-white tracking-tight">Link Oferta</span>
          </div>
        </div>

        {/* Content */}
        <div className="bg-[#101827]/60 backdrop-blur-xl border border-white/[0.06] rounded-3xl p-8 sm:p-12 space-y-6 shadow-2xl">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">Política de Privacidade</h1>
            <p className="text-xs text-[#64748B] font-semibold">Última atualização: 17 de junho de 2026</p>
          </div>

          <div className="space-y-6 text-sm text-[#94A3B8] leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">1. Introdução e Escopo</h2>
              <p>
                O <strong>Link Oferta</strong> tem o compromisso de proteger sua privacidade e seus dados pessoais. Esta política detalha como coletamos, usamos, armazenamos e compartilhamos os seus dados no uso da nossa plataforma de vitrines e disparos de ofertas.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">2. Dados que Coletamos</h2>
              <p>
                Coletamos informações essenciais para o funcionamento e a segurança do serviço:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Informações de Registro:</strong> Nome completo, endereço de e-mail e credenciais de login criadas no momento do cadastro.</li>
                <li><strong>Informações do Perfil:</strong> Biografia, nome de exibição, foto do avatar, links de canais sociais (WhatsApp, Telegram, Discord) fornecidos voluntariamente por você para compor sua vitrine pública.</li>
                <li><strong>Dados de Utilização:</strong> Cliques nas ofertas cadastradas e logs de disparos de canais de notificação para compor seus relatórios analíticos de desempenho.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">3. Finalidade do Uso dos Dados</h2>
              <p>
                Os seus dados são utilizados estritamente para as seguintes finalidades:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Prestar e gerenciar o acesso ao serviço de vitrine e controle de links.</li>
                <li>Gerenciar e autenticar sessões de login de forma segura.</li>
                <li>Habilitar o compartilhamento público de suas ofertas com seus seguidores e audiência.</li>
                <li>Coletar estatísticas agregadas de cliques e acessos para análise interna e exibição de relatórios no seu dashboard.</li>
                <li>Cumprimento de obrigações legais e manutenção de segurança do sistema.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">4. Provedores de Serviços Terceirizados</h2>
              <p>
                Compartilhamos dados exclusivamente com serviços terceirizados essenciais que garantem a infraestrutura e segurança do Link Oferta:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li><strong>Supabase:</strong> Infraestrutura de banco de dados, armazenamento de perfis e serviço de autenticação com segurança de dados de ponta a ponta.</li>
                <li><strong>Vercel / Cloudflare:</strong> Hospedagem web e entrega de conteúdo segura e otimizada globalmente.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">5. Cookies</h2>
              <p>
                Utilizamos cookies de sessão essenciais para mantê-lo autenticado de forma segura no painel e salvar suas preferências de exibição de layout. O consentimento e gerenciamento de cookies podem ser definidos por meio do nosso banner de cookies. Detalhes estão disponíveis em nossa Política de Cookies.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">6. Retenção e Exclusão de Dados</h2>
              <p>
                Os dados são mantidos pelo tempo que sua conta estiver ativa na plataforma. Você pode solicitar a exclusão total de sua conta e dados pessoais diretamente pelo painel de configurações ou entrando em contato conosco pelo e-mail de suporte. Uma vez solicitada, a remoção do seu perfil e ofertas do banco de dados do Supabase é imediata e definitiva.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">7. Direitos do Titular (LGPD)</h2>
              <p>
                Nos termos da Lei Geral de Proteção de Dados (Lei nº 13.709/18 - LGPD), você possui o direito de:
              </p>
              <ul className="list-disc pl-5 space-y-1.5">
                <li>Confirmar a existência do tratamento de seus dados pessoais.</li>
                <li>Acessar seus dados armazenados na plataforma de forma simplificada.</li>
                <li>Corrigir dados incompletos, inexatos ou desatualizados nas configurações do seu perfil.</li>
                <li>Revogar o consentimento e solicitar a eliminação dos dados tratados a qualquer momento.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-base font-extrabold text-white">8. Contato e Encarregado de Proteção de Dados (DPO)</h2>
              <p>
                Se você tiver alguma dúvida sobre esta Política de Privacidade ou sobre o tratamento de seus dados pessoais pelo Link Oferta, envie um e-mail para <a href="mailto:privacidade@linkoferta.com" className="text-indigo-400 font-bold hover:underline">privacidade@linkoferta.com</a>.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PoliticaPrivacidade;
