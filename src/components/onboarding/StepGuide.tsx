import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, Lightbulb } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { getGuide } from '../../config/activationGuides';

export const guideHref = (route: string, id: string): string => {
  const [path, query = ''] = route.split('?');
  const params = new URLSearchParams(query);
  params.set('guide', id);
  return `${path}?${params.toString()}`;
};

export const StepGuide: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const requested = new URLSearchParams(location.search).get('guide');
  const guide = getGuide(requested);

  const close = () => {
    const params = new URLSearchParams(location.search);
    params.delete('guide');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
  };

  // id desconhecido: limpa o parametro em vez de deixar a URL suja.
  useEffect(() => {
    if (requested && !guide) {
      const params = new URLSearchParams(location.search);
      params.delete('guide');
      const search = params.toString();
      navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    }
  }, [requested, guide, location.pathname, location.search, navigate]);

  if (!guide) return null;

  return (
    <Modal open onClose={close} size="lg" title={guide.title} description={guide.intro}>
      <ol className="space-y-3">
        {guide.steps.map((step, index) => (
          <li key={index} className="flex gap-3">
            <span className="w-6 h-6 rounded-full bg-ice border border-mint-200 text-mint-800 text-xs font-bold flex items-center justify-center flex-shrink-0">
              {index + 1}
            </span>
            <p className="text-sm text-ink leading-relaxed pt-0.5">{step.text}</p>
          </li>
        ))}
      </ol>
      {guide.link && (
        <a
          href={guide.link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-mint-700 underline hover:text-mint-800"
        >
          {guide.link.label}<ExternalLink className="w-3.5 h-3.5" />
        </a>
      )}
      {guide.tip && (
        <div className="mt-5 flex gap-2.5 rounded-xl border border-line bg-surface-1 p-3">
          <Lightbulb className="w-4 h-4 text-mint-700 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-ink-secondary leading-relaxed">{guide.tip}</p>
        </div>
      )}
      <div className="mt-6 flex justify-end">
        <button type="button" onClick={close} className="btn-gradient px-5 py-2 text-xs font-semibold">
          Entendi
        </button>
      </div>
    </Modal>
  );
};

export default StepGuide;
