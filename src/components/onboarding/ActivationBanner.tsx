import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, X } from 'lucide-react';
import { useActivation } from '../../hooks/useActivation';
import { useUser } from '../../context/UserContext';
import { useAccountAccess } from '../../hooks/useAccountAccess';
import { guideHref } from './StepGuide';

const HIDDEN_PATHS = ['/dashboard', '/pricing', '/checkout'];
const storageKey = (userId: string) => `aflyo_activation_banner_dismissed_${userId}`;

const readDismissed = (userId: string | undefined): boolean => {
  if (!userId) return false;
  try { return sessionStorage.getItem(storageKey(userId)) === 'true'; } catch { return false; }
};

export const ActivationBanner: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const access = useAccountAccess();
  const { user } = useUser();
  const { state, loading, error } = useActivation();
  const [dismissed, setDismissed] = useState(() => readDismissed(user?.id));

  // Todos os hooks ficam acima do primeiro return condicional.
  if (dismissed || loading || error || state.allDone || !state.next) return null;
  if (!access.hasAccess || access.isExpired) return null;
  if (!access.isTrialing && state.next.id === 'automatic_offer') return null;
  if (HIDDEN_PATHS.some(path => location.pathname.startsWith(path))) return null;

  const dismiss = () => {
    try { if (user?.id) sessionStorage.setItem(storageKey(user.id), 'true'); } catch { /* sem storage: so some nesta sessao de render */ }
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
