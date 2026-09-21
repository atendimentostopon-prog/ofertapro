import React from 'react';
import { Check } from 'lucide-react';

export interface StepperItem {
  id: string;
  label: string;
  description?: string;
}

interface StepperProps {
  steps: StepperItem[];
  currentStep: number;
  onStepChange?: (index: number) => void;
  allowCompletedNavigation?: boolean;
}

export const Stepper: React.FC<StepperProps> = ({
  steps,
  currentStep,
  onStepChange,
  allowCompletedNavigation = true,
}) => (
  <ol className="grid grid-cols-4 gap-2" aria-label="Progresso">
    {steps.map((step, index) => {
      const completed = index < currentStep;
      const active = index === currentStep;
      const interactive = !!onStepChange && (active || (completed && allowCompletedNavigation));
      return (
        <li key={step.id} className="min-w-0">
          <button
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onStepChange?.(index)}
            aria-current={active ? 'step' : undefined}
            className={`w-full text-left rounded-xl border p-2.5 transition-colors ${
              active
                ? 'border-mint-500 bg-ice'
                : completed
                ? 'border-mint-200 bg-surface-0'
                : 'border-line bg-surface-1'
            } ${interactive ? 'cursor-pointer hover:border-mint-500' : 'cursor-default'}`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                completed || active ? 'bg-graphite text-ink-inverse' : 'bg-surface-3 text-ink-secondary'
              }`}>
                {completed ? <Check className="w-3 h-3" /> : index + 1}
              </span>
              <span className="text-[11px] font-semibold text-ink truncate">{step.label}</span>
            </span>
            {step.description && <span className="hidden sm:block text-[9px] text-ink-tertiary mt-1 truncate">{step.description}</span>}
          </button>
        </li>
      );
    })}
  </ol>
);
