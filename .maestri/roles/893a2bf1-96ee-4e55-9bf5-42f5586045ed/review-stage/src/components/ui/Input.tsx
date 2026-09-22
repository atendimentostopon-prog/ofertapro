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
        <label htmlFor={id} className="text-xs font-semibold text-ink-secondary tracking-wide">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          ref={ref}
          id={id}
          type={effectiveType}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
          className={`w-full text-sm rounded-md border bg-surface-0 text-ink placeholder-ink-tertiary outline-none transition-colors duration-160 ${
            Icon ? 'pl-10' : 'pl-3.5'
          } ${hasRightSlot ? 'pr-10' : 'pr-3.5'} py-2.5 shadow-xs ${
            error
              ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
              : 'border-line focus:border-mint-500 focus:shadow-focus'
          } ${className}`}
          {...props}
        />
        {showToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible(v => !v)}
            aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-tertiary hover:text-ink transition-colors p-1 -m-1"
          >
            {passwordVisible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        ) : IconRight ? (
          <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-tertiary pointer-events-none">
            <IconRight className="w-4 h-4" />
          </div>
        ) : null}
      </div>
      {error && (
        <p id={errorId} className="text-xs font-medium text-danger-ink">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-xs text-ink-tertiary">
          {hint}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
