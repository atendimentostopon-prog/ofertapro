import React from 'react';
import { CreditCard, Sparkles } from 'lucide-react';
import { APP_NAME } from '../../config/app';
import { SettingsSection } from './shared';

export const BillingTab: React.FC = () => (
  <div className="space-y-6">
    <SettingsSection
      title="Planos & Cobrança"
      description={`Status do seu plano de faturamento no ${APP_NAME}`}
      icon={CreditCard}
    >
      <div className="p-6 bg-indigo-950/20 border border-indigo-900/40 rounded-2xl flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-[#101827] border border-white/5 flex items-center justify-center text-indigo-400 flex-shrink-0">
          <Sparkles className="w-5 h-5 animate-pulse" />
        </div>
        <div className="space-y-1.5 font-medium">
          <h4 className="text-sm font-bold text-white">Plano Beta Gratuito Ativo 🚀</h4>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            O {APP_NAME} está atualmente em fase de testes beta pública e é 100% gratuito. Todos os recursos PRO estão liberados por padrão para a sua conta, sem bloqueios de uso, limites de ofertas cadastradas ou restrições nos canais conectados.
          </p>
          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 text-[11px] font-bold text-indigo-400 rounded-xl">
            Recursos PRO Liberados: Sem limites ou cobranças no Beta
          </div>
        </div>
      </div>
    </SettingsSection>
  </div>
);
