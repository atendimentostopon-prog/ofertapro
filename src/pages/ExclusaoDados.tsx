import React, { useEffect } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { APP_NAME } from '../config/app';
import { CompanyIdentity } from '../components/legal/CompanyIdentity';

const ExclusaoDados: React.FC = () => {
  useEffect(() => {
    document.title = `Exclusão de dados | ${APP_NAME}`;
  }, []);

  return (
    <div className="min-h-screen bg-surface-1 text-ink py-16 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-10 pb-6 border-b border-line">
          <a href="/" className="flex items-center gap-2 text-xs font-bold text-ink-secondary hover:text-ink transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Voltar
          </a>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-mint-700" />
            <span className="text-sm font-extrabold text-ink tracking-tight">{APP_NAME}</span>
          </div>
        </div>
        <div className="bg-surface-0 border border-line rounded-3xl p-8 sm:p-12 space-y-5 text-sm text-ink-secondary leading-relaxed">
          <h1 className="text-3xl font-black text-ink tracking-tight">Exclusão de dados do Instagram</h1>
          <p>
            Quando você remove o {APP_NAME} nas configurações do Instagram ou pede a exclusão por e-mail, apagamos na hora, dos nossos servidores:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>token de acesso da conta;</li>
            <li>automações configuradas;</li>
            <li>contatos e nomes de usuário de quem interagiu;</li>
            <li>registro de mensagens enviadas e eventos recebidos.</li>
          </ul>
          <p>
            Se você apenas desconectar a conta no painel do {APP_NAME}, o token de acesso é apagado na hora e as automações ficam pausadas. Os demais dados (automações, contatos, registro de mensagens e eventos) são apagados 30 dias depois da desconexão. Se você reconectar a mesma conta antes disso, as automações voltam a aparecer pausadas.
          </p>
          <p>
            Para solicitar a exclusão manualmente, envie um e-mail para <a className="underline" href="mailto:aflyoapp@gmail.com">aflyoapp@gmail.com</a> a partir do e-mail da sua conta, informando o usuário do Instagram. Respondemos em até 15 dias úteis.
          </p>
          <CompanyIdentity />
        </div>
      </div>
    </div>
  );
};

export default ExclusaoDados;
