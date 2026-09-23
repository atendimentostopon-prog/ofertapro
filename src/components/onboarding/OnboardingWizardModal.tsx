import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, LockKeyhole } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Stepper } from '../ui/Stepper';
import { supabase } from '../../lib/supabase';
import { useUser } from '../../context/UserContext';
import { useOnboardingStatus } from '../../hooks/useOnboardingStatus';
import { APP_NAME } from '../../config/app';

interface Props { isOpen: boolean; }
const SETUP_PATHS = ['/settings', '/channels', '/integrations'];

export const OnboardingWizardModal: React.FC<Props> = ({ isOpen }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, setUser } = useUser();
  const { steps, currentStep, allDone, loading, error, refresh } = useOnboardingStatus();
  const [persistError, setPersistError] = useState(false);
  const completionAttempted = useRef(false);

  useEffect(() => { if (isOpen) refresh(); }, [isOpen, location.pathname, refresh]);
  useEffect(() => {
    if (!user || loading || !allDone || user.onboarded === true || completionAttempted.current) return;
    completionAttempted.current = true;
    supabase.from('profiles').update({ onboarded: true, updated_at: new Date().toISOString() }).eq('id', user.id)
      .then(({ error: updateError }) => {
        if (updateError) {
          console.error('[OnboardingWizardModal] falha ao finalizar onboarding:', updateError);
          setPersistError(true); completionAttempted.current = false; return;
        }
        setUser(previous => previous ? { ...previous, onboarded: true } : previous);
      });
  }, [allDone, loading, setUser, user]);

  if (!isOpen || !user || SETUP_PATHS.some(path => location.pathname.startsWith(path))) return null;
  const activeIndex = Math.max(0, Math.min(currentStep - 1, steps.length - 1));
  const firstName = (user.preferred_name || user.full_name || '').trim().split(' ')[0];
  const openStep = (index: number) => { const step = steps[index]; if (step && !step.locked) navigate(step.route); };

  return (
    <Modal open onClose={() => {}} size="xl" showCloseButton={false} closeOnBackdrop={false} closeOnEsc={false}
      title={firstName ? `Vamos configurar sua conta, ${firstName}` : `Vamos configurar sua conta no ${APP_NAME}`}
      description="Conclua as quatro etapas em ordem. Cada etapa só é liberada após a validação real da anterior.">
      <div className="space-y-6">
        <Stepper steps={steps.map(step => ({ id: step.id, label: step.title }))} currentStep={activeIndex}
          onStepChange={openStep} allowCompletedNavigation />
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-ink-secondary">Progresso da configuração</span>
          <span className="font-mono font-bold text-ink-tertiary tabular-nums">{steps.filter(step => step.done).length} / {steps.length}</span>
        </div>
        {error && <div role="alert" className="rounded-xl border border-danger/25 bg-danger-bg p-4">
          <p className="text-sm font-semibold text-danger-ink">{error}</p>
          <button type="button" onClick={refresh} className="mt-3 text-xs font-bold text-danger-ink underline underline-offset-2">Tentar novamente</button>
        </div>}
        {persistError && <p role="alert" className="text-sm text-danger-ink">As etapas foram concluídas, mas não foi possível liberar o painel. A confirmação será tentada novamente.</p>}
        {loading ? <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-mint-700 animate-spin" aria-label="Carregando progresso" /></div>
          : !error && <ol className="space-y-3">{steps.map((step, index) => {
            const Icon = step.icon; const active = index === activeIndex && !allDone;
            return <li key={step.id} className={`p-4 rounded-2xl border ${step.done ? 'bg-ice/40 border-mint-200' : active ? 'bg-surface-0 border-mint-500 shadow-sm' : 'bg-surface-1 border-line opacity-70'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 border ${step.done ? 'bg-ice border-mint-200 text-mint-700' : active ? 'bg-graphite border-graphite text-ink-inverse' : 'bg-surface-2 border-line text-ink-tertiary'}`}>
                  {step.done ? <CheckCircle2 className="w-5 h-5" /> : step.locked ? <LockKeyhole className="w-4 h-4" /> : <Icon className="w-[18px] h-[18px]" />}
                </div>
                <div className="flex-1 min-w-0"><div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-ink-tertiary uppercase tracking-wider">Etapa {index + 1}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${step.done ? 'text-mint-700' : 'text-ink-tertiary'}`}>{step.done ? 'Validada' : step.locked ? 'Bloqueada' : 'Em andamento'}</span>
                </div><h3 className="text-sm font-bold text-ink mt-1">{step.title}</h3><p className="text-xs text-ink-tertiary mt-1 leading-relaxed">{step.description}</p></div>
                {!step.locked && !step.done && <button type="button" onClick={() => openStep(index)} className="btn-gradient px-3.5 py-2 flex items-center gap-1.5 text-xs font-bold flex-shrink-0"><span className="hidden sm:inline">Continuar etapa</span><ArrowRight className="w-3.5 h-3.5" /></button>}
                {step.done && <button type="button" onClick={() => openStep(index)} className="px-3 py-2 text-xs font-bold text-ink-secondary hover:text-ink flex-shrink-0">Revisar</button>}
              </div>
            </li>;
          })}</ol>}
      </div>
    </Modal>
  );
};

export default OnboardingWizardModal;
