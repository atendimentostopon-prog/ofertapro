import React from 'react';
import { Check, X } from 'lucide-react';

interface PasswordCriterion {
  label: string;
  met: boolean;
}

export interface PasswordStrength {
  label: string;
  width: string;
  colorClass: string;
  textClass: string;
}

export const getPasswordCriteria = (password: string): PasswordCriterion[] => [
  { label: 'Mínimo 8 caracteres', met: password.length >= 8 },
  { label: 'Letra maiúscula', met: /[A-Z]/.test(password) },
  { label: 'Letra minúscula', met: /[a-z]/.test(password) },
  { label: 'Um número', met: /[0-9]/.test(password) },
];

export const isPasswordValid = (password: string): boolean =>
  getPasswordCriteria(password).every(c => c.met);

export const getPasswordStrength = (password: string): PasswordStrength => {
  let metCount = 0;
  if (password.length >= 8) metCount++;
  if (/[A-Z]/.test(password)) metCount++;
  if (/[a-z]/.test(password)) metCount++;
  if (/[0-9]/.test(password)) metCount++;
  if (/[^A-Za-z0-9]/.test(password)) metCount++;

  if (password.length === 0) return { label: 'Inexistente', width: '0%', colorClass: 'bg-line', textClass: 'text-ink-tertiary' };
  if (metCount <= 1) return { label: 'Fraca', width: '25%', colorClass: 'bg-danger', textClass: 'text-danger-ink' };
  if (metCount <= 2) return { label: 'Razoável', width: '50%', colorClass: 'bg-warning', textClass: 'text-warning-ink' };
  if (metCount <= 3) return { label: 'Boa', width: '75%', colorClass: 'bg-info', textClass: 'text-info-ink' };
  return { label: 'Forte', width: '100%', colorClass: 'bg-mint-500', textClass: 'text-mint-800' };
};

interface PasswordStrengthMeterProps {
  password: string;
}

export const PasswordStrengthMeter: React.FC<PasswordStrengthMeterProps> = ({ password }) => {
  if (password.length === 0) return null;

  const strength = getPasswordStrength(password);
  const criteria = getPasswordCriteria(password);

  return (
    <div className="bg-surface-1 border border-line p-3.5 rounded-md space-y-3 animate-slide-up">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-ink-tertiary font-medium">Força da senha</span>
          <span className={`font-semibold ${strength.textClass}`}>{strength.label}</span>
        </div>
        <div className="h-1 w-full bg-surface-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${strength.colorClass}`}
            style={{ width: strength.width }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${
              c.met ? 'bg-mint-500 text-graphite' : 'bg-surface-2 text-ink-tertiary'
            }`}>
              {c.met ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
            </div>
            <span className={`text-[11px] leading-none ${c.met ? 'text-ink' : 'text-ink-tertiary'}`}>
              {c.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
