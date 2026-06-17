import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOnboarding } from '../../hooks/useOnboarding';
import { 
  CheckCircle2, Circle, ArrowRight, Sparkles, Trophy, X, 
  User, Radio, Package, Send, MousePointerClick 
} from 'lucide-react';

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

  // Se tudo estiver concluído, mostrar card de comemoração compacto
  if (allCompleted) {
    return (
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-500 via-teal-600 to-cyan-600 rounded-2xl p-6 text-white border border-emerald-400/20 shadow-xl shadow-emerald-500/10 animate-fade-in">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -translate-y-12 translate-x-12" />
        <button 
          onClick={handleDismiss} 
          className="absolute top-4 right-4 text-emerald-100 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex flex-col sm:flex-row items-center gap-4 relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-white/20 border border-white/20 flex items-center justify-center flex-shrink-0">
            <Trophy className="w-6 h-6 text-amber-300 animate-bounce" />
          </div>
          <div className="text-center sm:text-left space-y-1 flex-1">
            <h3 className="text-base font-bold tracking-tight">Parabéns! Sua conta está 100% ativa! 🚀</h3>
            <p className="text-xs text-emerald-100 font-medium">Você completou todos os passos de onboarding. Comece a monitorar seus cliques no Dashboard!</p>
          </div>
        </div>
      </div>
    );
  }

  const checklistItems = [
    {
      id: 'profile',
      label: 'Configurar seu perfil público',
      description: 'Defina uma bio, avatar e um nome público.',
      completed: steps.profileCompleted,
      actionLabel: 'Configurar',
      route: '/settings',
      icon: User
    },
    {
      id: 'channel',
      label: 'Conectar primeiro canal',
      description: 'Conecte Discord, WhatsApp ou Telegram.',
      completed: steps.channelConnected,
      actionLabel: 'Conectar',
      route: '/channels',
      icon: Radio
    },
    {
      id: 'offer',
      label: 'Criar sua primeira oferta',
      description: 'Cadastre um produto com link de afiliado.',
      completed: steps.offerCreated,
      actionLabel: 'Criar Oferta',
      route: '/offers',
      icon: Package
    },
    {
      id: 'dispatch',
      label: 'Fazer o primeiro disparo',
      description: 'Envie sua oferta ativa para os canais.',
      completed: steps.firstDispatch,
      actionLabel: 'Disparar',
      route: '/offers',
      icon: Send
    },
    {
      id: 'clicks',
      label: 'Gerar os primeiros cliques',
      description: 'Acompanhe as visitas no Dashboard.',
      completed: steps.clicksReceived,
      actionLabel: 'Ver Analytics',
      route: '/dashboard',
      icon: MousePointerClick
    }
  ];

  return (
    <div className="glass-card border-slate-200/60 p-6 space-y-5 animate-fade-in relative overflow-hidden">
      <div className="absolute top-0 right-0 w-40 h-40 bg-indigo-500/5 rounded-full blur-3xl -translate-y-12 translate-x-12" />
      
      {/* Header do Onboarding */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            Primeiros Passos no OfertaPro
          </h2>
          <p className="text-xs text-slate-500 font-medium">Complete as etapas abaixo para configurar sua estrutura de vendas.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg">
            {percentCompleted}% Concluído
          </span>
        </div>
      </div>

      {/* Barra de Progresso */}
      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500 ease-out"
          style={{ width: `${percentCompleted}%` }}
        />
      </div>

      {/* Lista de Itens */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3.5 pt-2">
        {checklistItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div 
              key={item.id}
              className={`flex flex-col justify-between p-4 rounded-xl border transition-all ${
                item.completed 
                  ? 'bg-slate-50/50 border-slate-200/60 opacity-75' 
                  : 'bg-white border-slate-200 hover:border-indigo-200 shadow-sm'
              }`}
            >
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shadow-sm ${
                    item.completed ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : 'bg-slate-50 border-slate-100 text-slate-500'
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  {item.completed ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 fill-emerald-50" />
                  ) : (
                    <Circle className="w-5 h-5 text-slate-300" />
                  )}
                </div>
                
                <div className="space-y-0.5">
                  <p className="text-[12px] font-bold text-slate-900 tracking-tight leading-tight">{item.label}</p>
                  <p className="text-[10px] text-slate-400 font-medium leading-snug">{item.description}</p>
                </div>
              </div>

              {!item.completed && (
                <button
                  onClick={() => navigate(item.route)}
                  className="mt-3 w-full py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] transition-colors flex items-center justify-center gap-1 group"
                >
                  {item.actionLabel}
                  <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default OnboardingChecklist;
