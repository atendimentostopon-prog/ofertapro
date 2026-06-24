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
          className={`w-full text-sm rounded-[10px] border bg-surface-1 text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 ${
            Icon ? 'pl-10 pr-4' : 'px-3.5'
          } py-2.5 ${
            error
              ? 'border-red-500/25 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
              : 'border-white/[0.06] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
