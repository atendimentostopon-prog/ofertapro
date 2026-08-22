import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  hint,
  icon: Icon,
  className = '',
  id,
  ...props
}, ref) => {
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
          className={`w-full text-sm rounded-md border bg-surface-0 text-ink placeholder-ink-tertiary outline-none transition-colors duration-160 ${
            Icon ? 'pl-10 pr-4' : 'px-3.5'
          } py-2.5 shadow-xs ${
            error
              ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
              : 'border-line focus:border-mint-500 focus:shadow-focus'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-medium text-danger-ink">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-tertiary">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
