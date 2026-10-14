import React from 'react';
import { Info } from 'lucide-react';
import { EARLY_ACCESS_NOTICE, GUIDE_STEPS, buildFaq, type GuideLimits } from '../../config/instagramGuide';
import { Card } from '../ui/Card';
import { Disclosure } from '../ui/Disclosure';

interface Props {
  defaultOpen: boolean;
  limits: GuideLimits;
}

/** Guia "Como funciona" exibido no topo de /instagram. */
export const GuideCard: React.FC<Props> = ({ defaultOpen, limits }) => (
  <Disclosure
    title="Como funciona"
    description="4 passos para responder comentários com DM automática"
    defaultOpen={defaultOpen}
  >
    <div className="space-y-5">
      <ol className="space-y-3">
        {GUIDE_STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-mint-400/20 text-xs font-bold text-mint-700"
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink">{step.title}</p>
              <p className="text-sm text-ink-secondary leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <Card variant="deeper" className="p-4">
        <div className="flex gap-3">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-ink-secondary" aria-hidden="true" />
          <div className="text-sm leading-relaxed">
            <p className="font-bold text-ink">{EARLY_ACCESS_NOTICE.title}</p>
            <p className="text-ink-secondary">{EARLY_ACCESS_NOTICE.body}</p>
            <p className="text-ink-secondary mt-1">{EARLY_ACCESS_NOTICE.contact}</p>
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-ink-secondary tracking-wide">PERGUNTAS FREQUENTES</p>
        {buildFaq(limits).map((item) => (
          <Disclosure key={item.q} title={item.q}>
            <p className="text-sm text-ink-secondary leading-relaxed">{item.a}</p>
          </Disclosure>
        ))}
      </div>
    </div>
  </Disclosure>
);
