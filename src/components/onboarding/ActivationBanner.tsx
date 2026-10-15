import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useActivation } from '../../hooks/useActivation';
import { useAccountAccess } from '../../hooks/useAccountAccess';
import { guideHref } from './StepGuide';

const HIDDEN_PATHS = ['/dashboard', '/pricing', '/checkout'];
const STORAGE_KEY = 'aflyo_activation_banner_dismissed';

const readDismissed = (): boolean => {
  try { return sessionStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
};

export const ActivationBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAccountAccess();
  const { state, loading } = useActivation();
  const [dismissed, setDismissed] = useState(readDismissed);

  if (dismissed || loading || state.allDone || !state.next) return null;
  if (!access.hasAccess || access.isExpired) return null;
  if (HIDDEN_PATHS.some(path => location.pathname.startsWith(path))) return null;

  const dismiss = () => {
    try { sessionStorage.setItem(STORAGE_KEY, 'true'); } catch { /* sem storage: so some nesta sessao de render */ }
    setDismissed(true);
  };

  const next = state.next;
  return (
    <div className="mb-4 rounded-2xl border border-mint-200 bg-ice/60 px-4 py-3 flex flex-wrap items-center gap-3">
      <p className="text-xs font-medium text-mint-800 flex-1 min-w-[200px]">
        <span className="font-bold">{state.completed} de {state.total} etapas.</span>{' '}
        Próxima: {next.title}.
        {access.isTrialing && ` Faltam ${access.daysLeft} ${access.daysLeft === 1 ? 'dia' : 'dias'} de teste.`}
      </p>
      <button
        type="button"
        onClick={() => navigate(guideHref(next.route, next.id))}
        className="btn-gradient px-3.5 py-1.5 text-xs font-semibold"
      >
        Continuar<ArrowRight className="w-3.5 h-3.5" />
      </button>
      <button type="button" onClick={dismiss} aria-label="Dispensar aviso" className="text-mint-700 hover:text-mint-800">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export default ActivationBanner;
