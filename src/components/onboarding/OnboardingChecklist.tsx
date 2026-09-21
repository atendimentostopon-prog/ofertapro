import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../hooks/useOnboarding';
import {
  CheckCircle2, Circle, ArrowRight, Sparkles, Trophy, X,
  User, Radio, Package, Send, MousePointerClick
} from 'lucide-react';
import { Card } from '../ui/Card';
import { Disclosure } from '../ui/Disclosure';
import { useUser } from '../../context/UserContext';
import { APP_NAME } from '../../config/app';

const OnboardingChecklist: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { steps, percentCompleted, allCompleted, loading, refresh } = useOnboarding();
  const dismissalKey = user?.id ? `ofertapro_onboarding_dismissed_${user.id}` : null;
  const [dismissal, setDismissal] = useState<{ key: string | null; dismissed: boolean }>({
    key: null,
    dismissed: false,
  });

  useEffect(() => {
    setDismissal({
      key: dismissalKey,
      dismissed: dismissalKey !== null && localStorage.getItem(dismissalKey) === 'true',
    });
  }, [dismissalKey]);

  const handleDismiss = () => {
    if (!dismissalKey) return;
    localStorage.setItem(dismissalKey, 'true');
    setDismissal({ key: dismissalKey, dismissed: true });
  };

  if (loading || !dismissalKey || dismissal.key !== dismissalKey || dismissal.dismissed) return null;

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
    { id: 'offer',    label: 'Criar sua primeira oferta',     description: 'Cadastre um produto com link de afiliado.', completed: steps.offerCreated,     actionLabel: 'Criar oferta', route: '/offers/new', icon: Package },
    { id: 'dispatch', label: 'Fazer o primeiro disparo',      description: 'Envie sua oferta ativa para os canais.',    completed: steps.firstDispatch,    actionLabel: 'Disparar',   route: '/offers', icon: Send },
    { id: 'clicks',   label: 'Gerar os primeiros cliques',    description: 'Acompanhe as visitas no Dashboard.',        completed: steps.clicksReceived,   actionLabel: 'Ver resultados', route: '/dashboard', icon: MousePointerClick },
  ];

  const nextItem = checklistItems.find(item => !item.completed) ?? checklistItems[checklistItems.length - 1];
  const NextIcon = nextItem.icon;

  return (
    <Disclosure title={`Primeiros passos · ${percentCompleted}% concluído`} description="Consulte as próximas etapas para configurar sua conta." defaultOpen={!user?.onboarded}>
    <div className="space-y-5">
      {/* Header do Onboarding */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-ink tracking-tight flex items-center gap-1.5 font-display">
            <Sparkles className="w-4 h-4 text-mint-700" />
            Primeiros Passos no {APP_NAME}
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

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-3.5 pt-1">
        <div className="rounded-xl border border-mint-200 bg-ice p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-surface-0 border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
            <NextIcon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-mint-800">Próxima melhor ação</p>
            <h3 className="text-sm font-bold text-ink mt-1 font-display">{nextItem.label}</h3>
            <p className="text-xs text-ink-secondary mt-0.5">{nextItem.description}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate(nextItem.route)}
            className="btn-gradient px-4 py-2 text-xs font-semibold flex-shrink-0"
          >
            {nextItem.actionLabel}<ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="rounded-xl border border-line bg-surface-0 p-3 space-y-1">
        {checklistItems.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg"
            >
              <div className={`w-7 h-7 rounded-md flex items-center justify-center ${item.completed ? 'bg-ice text-mint-700' : 'bg-surface-1 text-ink-tertiary'}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${item.completed ? 'text-ink-secondary line-through' : 'text-ink'}`}>{item.label}</span>
              {item.completed ? <CheckCircle2 className="w-4 h-4 text-mint-700" /> : <Circle className="w-4 h-4 text-ink-disabled" />}
            </div>
          );
        })}
        </div>
      </div>
    </div>
    </Disclosure>
  );
};

export default OnboardingChecklist;
