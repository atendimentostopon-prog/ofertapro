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
        <label htmlFor={id} className="text-xs font-semibold text-ink-secondary tracking-wide">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={id}
        className={`w-full text-sm rounded-md border bg-surface-0 text-ink placeholder-ink-tertiary outline-none transition-colors duration-160 px-3.5 py-2.5 min-h-[80px] resize-y shadow-xs ${
          error
            ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
            : 'border-line focus:border-mint-500 focus:shadow-focus'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs font-medium text-danger-ink">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-tertiary">{hint}</p>}
    </div>
  );
});

Textarea.displayName = 'Textarea';
