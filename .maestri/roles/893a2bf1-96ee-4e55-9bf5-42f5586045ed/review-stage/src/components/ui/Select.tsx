import React, { forwardRef } from 'react';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  hint,
  options,
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
      <select
        ref={ref}
        id={id}
        className={`w-full text-sm rounded-md border bg-surface-0 text-ink outline-none transition-colors duration-160 px-3.5 py-2.5 cursor-pointer appearance-none shadow-xs ${
          error
            ? 'border-danger focus:border-danger focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
            : 'border-line focus:border-mint-500 focus:shadow-focus'
        } ${className}`}
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236B7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1.25rem',
          backgroundRepeat: 'no-repeat',
          paddingRight: '2.5rem',
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-0 text-ink">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs font-medium text-danger-ink">{error}</p>}
      {hint && !error && <p className="text-xs text-ink-tertiary">{hint}</p>}
    </div>
  );
});

Select.displayName = 'Select';
