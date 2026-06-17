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
        <label htmlFor={id} className="text-xs font-bold text-[#94A3B8] tracking-wide uppercase">
          {label}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#64748B]">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <input
          ref={ref}
          id={id}
          className={`w-full text-sm rounded-xl border bg-[#101827] text-[#F8FAFC] placeholder-[#64748B] outline-none transition-all duration-200 ${
            Icon ? 'pl-10 pr-4' : 'px-4'
          } py-2.5 ${
            error
              ? 'border-red-500/30 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
              : 'border-white/5 focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15'
          } ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-[#64748B]">{hint}</p>}
    </div>
  );
});

Input.displayName = 'Input';
