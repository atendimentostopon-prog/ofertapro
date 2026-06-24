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
        <label htmlFor={id} className="text-xs font-semibold text-slate-400 tracking-wide">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={`w-full text-sm rounded-[10px] border bg-surface-1 text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 px-3.5 py-2.5 min-h-[80px] resize-y ${
          error
            ? 'border-red-500/25 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
            : 'border-white/[0.06] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
});

Textarea.displayName = 'Textarea';
