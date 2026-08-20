import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../hooks/useOnboarding';
import {
  CheckCircle2, Circle, ArrowRight, Sparkles, Trophy, X,
  User, Radio, Package, Send, MousePointerClick
} from 'lucide-react';
import { Card } from '../ui/Card';

const OnboardingChecklist: React.FC = () => {
  const navigate = useNavigate();
  const { steps, percentCompleted, allCompleted, loading, refresh } = useOnboarding();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const isDismissed = localStorage.getItem('ofertapro_onboarding_dismissed') === 'true';
    setDismissed(isDismissed);
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('ofertapro_onboarding_dismissed', 'true');
    setDismissed(true);
  };

  if (loading || dismissed) return null;

  if (allCompleted) {
    return (
      <div className="relative overflow-hidden bg-ice rounded-2xl p-6 border border-mint-200 shadow-xs animate-fade-in">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-mint-700 hover:text-mint-800 transition-colors"
          aria-label="Dispensar"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-mint-500 flex items-center justify-center flex-shrink-0 shadow-sm">
            <Trophy className="w-6 h-6 text-graphite" />
          </div>
          <div className="text-center sm:text-left space-y-1 flex-1">
            <h3 className="text-base font-bold tracking-tight text-ink font-display">Parabéns! Sua conta está 100% ativa</h3>
            <p className="text-xs text-mint-800 font-medium">Você completou todos os passos de onboarding. Comece a monitorar seus cliques no Dashboard.</p>
          </div>
        </div>
      </div>
    );
  }

  const checklistItems = [
    { id: 'profile',  label: 'Configurar seu perfil público', description: 'Defina uma bio, avatar e um nome público.', completed: steps.profileCompleted, actionLabel: 'Configurar', route: '/settings', icon: User },
    { id: 'channel',  label: 'Conectar primeiro canal',       description: 'Conecte Discord, WhatsApp ou Telegram.',    completed: steps.channelConnected, actionLabel: 'Conectar',   route: '/channels', icon: Radio },
    { id: 'offer',    label: 'Criar sua primeira oferta',     description: 'Cadastre um produto com link de afiliado.', completed: steps.offerCreated,     actionLabel: 'Criar Oferta', route: '/offers', icon: Package },
    { id: 'dispatch', label: 'Fazer o primeiro disparo',      description: 'Envie sua oferta ativa para os canais.',    completed: steps.firstDispatch,    actionLabel: 'Disparar',   route: '/offers', icon: Send },
    { id: 'clicks',   label: 'Gerar os primeiros cliques',    description: 'Acompanhe as visitas no Dashboard.',        completed: steps.clicksReceived,   actionLabel: 'Ver Analytics', route: '/dashboard', icon: MousePointerClick },
  ];

  return (
    <Card variant="default" className="p-6 space-y-5 animate-fade-in relative overflow-hidden">
      {/* Header do Onboarding */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-ink tracking-tight flex items-center gap-1.5 font-display">
            <Sparkles className="w-4 h-4 text-mint-700" />
            Primeiros Passos no Aflyo
          </h2>
          <p className="text-xs text-ink-secondary font-medium">Complete as etapas abaixo para configurar sua estrutura de vendas.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-mint-800 bg-ice border border-mint-200 px-2.5 py-1 rounded-md">
            {percentCompleted}% Concluído
          </span>
        </div>
      </div>

      {/* Barra de Progresso */}
      <div className="w-full bg-surface-1 h-2 rounded-full overflow-hidden border border-line">
        <div
          className="h-full bg-mint-500 transition-all duration-500 ease-out"
          style={{ width: `${percentCompleted}%` }}
        />
      </div>

      {/* Lista de Itens */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-2">
        {checklistItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                item.completed
                  ? 'bg-surface-1 border-line opacity-70'
                  : 'bg-surface-0 border-line hover:border-line-strong hover:shadow-sm'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center border ${
                    item.completed
                      ? 'bg-ice border-mint-200 text-mint-700'
                      : 'bg-surface-1 border-line text-ink-secondary'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-mint-700 fill-ice" />
                  ) : (
                    <Circle className="w-5 h-5 text-ink-disabled" />
                  )}
                </div>

                <div className="space-y-0.5">
                  <p className="text-[12px] font-bold text-ink tracking-tight leading-tight">{item.label}</p>
                  <p className="text-[10px] text-ink-tertiary font-medium leading-snug">{item.description}</p>
                </div>
              </div>

              {!item.completed && (
                <button
                  onClick={() => navigate(item.route)}
                  className="mt-3 w-full py-1.5 rounded-md bg-graphite hover:bg-graphite-800 text-ink-inverse font-semibold text-[10px] transition-colors flex items-center justify-center gap-1 group cursor-pointer"
                >
                  {item.actionLabel}
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default OnboardingChecklist;
