import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, BookOpen, CheckCircle2, Circle, Sparkles, Trophy,
  Bot, KeyRound, Radio, Send, Zap, PlugZap,
} from 'lucide-react';
import { Disclosure } from '../ui/Disclosure';
import { APP_NAME } from '../../config/app';
import { useActivation } from '../../hooks/useActivation';
import type { MilestoneId } from '../../lib/activationMilestones';
import { guideHref } from './StepGuide';

const ICONS: Record<MilestoneId, React.ElementType> = {
  telegram: Bot,
  marketplaces: KeyRound,
  source: Radio,
  destination: PlugZap,
  test_dispatch: Send,
  automatic_offer: Zap,
};

const ActivationPanel: React.FC = () => {
  const navigate = useNavigate();
  const { state, loading, error, refresh } = useActivation();

  if (loading) return null;

  if (state.allDone) {
    return (
      <div className="rounded-2xl border border-mint-200 bg-ice p-6 flex items-center gap-4 animate-fade-in">
        <div className="w-12 h-12 rounded-2xl bg-mint-500 flex items-center justify-center flex-shrink-0">
          <Trophy className="w-6 h-6 text-graphite" />
        </div>
        <div>
          <h3 className="text-base font-bold text-ink font-display">Seu bot já enviou a primeira oferta sozinho</h3>
          <p className="text-xs text-mint-800 font-medium mt-1">Tudo configurado. Acompanhe cliques e resultados aqui no Dashboard.</p>
        </div>
      </div>
    );
  }

  const next = state.next;
  if (!next) return null;
  const NextIcon = ICONS[next.id];

  return (
    <Disclosure
      title={`Primeiros passos · ${state.percent}% concluído`}
      description="Siga as etapas até o bot enviar a primeira oferta sozinho."
      defaultOpen
    >
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-ink tracking-tight flex items-center gap-1.5 font-display">
              <Sparkles className="w-4 h-4 text-mint-700" />
              Primeiros Passos no {APP_NAME}
            </h2>
            <p className="text-xs text-ink-secondary font-medium">Etapa {state.milestones.findIndex(m => m.id === next.id) + 1} de {state.total}. Cada uma tem um passo a passo.</p>
          </div>
          <span className="text-xs font-bold text-mint-800 bg-ice border border-mint-200 px-2.5 py-1 rounded-md self-start">
            {state.percent}% Concluído
          </span>
        </div>

        <div className="w-full bg-surface-1 h-2 rounded-full overflow-hidden border border-line">
          <div className="h-full bg-mint-500 transition-all duration-500 ease-out" style={{ width: `${state.percent}%` }} />
        </div>

        {error && (
          <p role="alert" className="text-xs text-warning-ink">
            Não foi possível atualizar tudo agora.{' '}
            <button type="button" onClick={refresh} className="font-bold underline">Tentar novamente</button>
          </p>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-3.5 pt-1">
          <div className="rounded-xl border border-mint-200 bg-ice p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-11 h-11 rounded-xl bg-surface-0 border border-mint-200 flex items-center justify-center text-mint-700 flex-shrink-0">
              <NextIcon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-mint-800">Próxima melhor ação</p>
              <h3 className="text-sm font-bold text-ink mt-1 font-display">{next.title}</h3>
              <p className="text-xs text-ink-secondary mt-0.5">{next.description}</p>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => navigate(guideHref(next.route, next.id))}
                className="btn-gradient px-4 py-2 text-xs font-semibold"
              >
                {next.actionLabel}<ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate(guideHref('/dashboard', next.id))}
                className="text-xs font-semibold text-mint-800 hover:text-mint-700 flex items-center justify-center gap-1"
              >
                <BookOpen className="w-3.5 h-3.5" />Ver passo a passo
              </button>
            </div>
          </div>

          <ul className="rounded-xl border border-line bg-surface-0 p-3 space-y-1">
            {state.milestones.map(item => {
              const Icon = ICONS[item.id];
              return (
                <li key={item.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${item.done ? 'bg-ice text-mint-700' : 'bg-surface-1 text-ink-tertiary'}`}>
                    <Icon aria-hidden="true" className="w-3.5 h-3.5" />
                  </div>
                  <span className={`text-[11px] font-medium flex-1 min-w-0 truncate ${item.done ? 'text-ink-secondary line-through' : 'text-ink'}`}>
                    {item.title}
                    {item.done && <span className="sr-only"> (concluído)</span>}
                  </span>
                  {!item.done && (
                    <button
                      type="button"
                      onClick={() => navigate(guideHref('/dashboard', item.id))}
                      className="text-[10px] font-bold text-mint-800 underline flex-shrink-0"
                      aria-label={`Ver passo a passo: ${item.title}`}
                    >
                      Guia
                    </button>
                  )}
                  {item.done
                    ? <CheckCircle2 aria-hidden="true" className="w-4 h-4 text-mint-700 flex-shrink-0" />
                    : <Circle aria-hidden="true" className="w-4 h-4 text-ink-disabled flex-shrink-0" />}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Disclosure>
  );
};

export default ActivationPanel;
