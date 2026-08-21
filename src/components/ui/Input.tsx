import React, { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
  iconRight?: React.ComponentType<{ className?: string }>;
  passwordToggle?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  icon: Icon,
  iconRight: IconRight,
  passwordToggle,
  className = '',
  id,
  type = 'text',
  ...props
}, ref) => {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const showToggle = passwordToggle || type === 'password';
  const effectiveType = showToggle
    ? (passwordVisible ? 'text' : 'password')
    : type;
  const hasRightSlot = showToggle || !!IconRight;

  const errorId = id ? `${id}-error` : undefined;
  const hintId = id ? `${id}-hint` : undefined;

  return (
    <div className="space-y-1.5 w-full">
      {label && (
        <label htmlFor={id} className="text-xs font-semibold text-slate-400 tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          ref={ref}
          id={id}
          type={effectiveType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`w-full text-sm rounded-[10px] border bg-surface-1 text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 ${
            Icon ? 'pl-10' : 'pl-3.5'
          } ${hasRightSlot ? 'pr-10' : 'pr-3.5'} py-2.5 ${
            error
              ? 'border-red-500/25 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
              : 'border-white/[0.06] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10'
          } ${className}`}
          {...props}
        />
        {showToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible(v => !v)}
            aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1 -m-1"
          >
            {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        ) : IconRight ? (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
            <IconRight className="w-4 h-4" />
          </div>
        ) : null}
      </div>
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-400">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
