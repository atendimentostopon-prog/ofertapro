import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Circle, Loader2, Rocket } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus';
import { APP_NAME } from '../../config/app';

interface OnboardingWizardModalProps {
  isOpen: boolean;
}

const HIDE_ON_PATHS = ['/settings', '/channels', '/integrations'];

export const OnboardingWizardModal: React.FC<OnboardingWizardModalProps> = ({ isOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useUser();
  const { steps, allDone, loading, refresh } = useOnboardingStatus();
  const [persisting, setPersisting] = useState(false);

  useEffect(() => {
    if (isOpen) refresh();
  }, [isOpen, location.pathname]);

  useEffect(() => {
    if (!user || persisting) return;
    if (user.onboarded === true) return;
    if (loading || !allDone) return;

    const persist = async () => {
      setPersisting(true);
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ onboarded: true, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (error) throw error;
        setUser(prev => (prev ? { ...prev, onboarded: true } : prev));
      } catch (err) {
        console.error('[OnboardingWizardModal] falha ao persistir onboarded:', err);
      } finally {
        setPersisting(false);
      }
    };

    persist();
  }, [allDone, loading, user, persisting, setUser]);

  const hideForRoute = HIDE_ON_PATHS.some(p => location.pathname.startsWith(p));
  if (!isOpen || !user || hideForRoute) return null;

  const doneCount = steps.filter(s => s.done).length;
  const total = steps.length;

  return (
    <Modal
      open
      onClose={() => {}}
      size="lg"
      showCloseButton={false}
      closeOnBackdrop={false}
      closeOnEsc={false}
      title={`Bem-vindo ao ${APP_NAME}`}
      description="Complete os 3 passos abaixo para começar a disparar ofertas automaticamente."
    >
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-ink-secondary">Seu progresso</span>
            <span className="font-mono font-bold text-ink-tertiary tabular-nums">
              {doneCount} / {total}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-surface-3 overflow-hidden flex gap-1">
            {steps.map(s => (
              <div
                key={s.id}
                className={`h-full flex-1 rounded-full transition-colors ${
                  s.done ? 'bg-mint-500' : 'bg-surface-4'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`p-4 rounded-2xl border transition-colors ${
                step.done
                  ? 'bg-ice/40 border-mint-200'
                  : 'bg-surface-1 border-line hover:border-line-strong'
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${
                    step.done
                      ? 'bg-ice border-mint-200 text-mint-700'
                      : 'bg-surface-2 border-line text-ink-tertiary'
                  }`}
                >
                  {step.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold text-ink-tertiary uppercase tracking-wider">
                      Passo {index + 1}
                    </span>
                    {step.done && (
                      <span className="text-[10px] font-bold text-mint-700 uppercase tracking-wider">
                        Concluído
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-ink mt-1 tracking-tight">{step.title}</h3>
                  <p className="text-xs text-ink-tertiary mt-1 leading-relaxed">{step.description}</p>
                </div>
                {!step.done && (
                  <button
                    type="button"
                    onClick={() => navigate(step.route)}
                    className="btn-gradient px-3.5 py-2 flex items-center gap-1.5 text-xs font-bold flex-shrink-0"
                  >
                    Fazer agora
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {allDone && (
          <div className="p-4 rounded-2xl bg-ice/60 border border-mint-200 flex items-center gap-3">
            <Rocket className="w-5 h-5 text-mint-700 flex-shrink-0" />
            <div className="flex-1 text-xs">
              <p className="font-bold text-mint-700">Tudo pronto!</p>
              <p className="text-ink-tertiary mt-0.5">
                {persisting ? 'Finalizando setup...' : 'Liberando o painel...'}
              </p>
            </div>
            {persisting && <Loader2 className="w-4 h-4 text-mint-700 animate-spin flex-shrink-0" />}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default OnboardingWizardModal;
