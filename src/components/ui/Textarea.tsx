import React, { forwardRef } from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  hint,
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
      <textarea
        ref={ref}
        id={id}
        className={`w-full text-sm rounded-xl border bg-[#101827] text-[#F8FAFC] placeholder-[#64748B] outline-none transition-all duration-200 px-4 py-2.5 min-h-[80px] ${
          error
            ? 'border-red-500/30 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
            : 'border-white/5 focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-[#64748B]">{hint}</p>}
    </div>
  );
});

Textarea.displayName = 'Textarea';
