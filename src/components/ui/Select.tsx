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
        <label htmlFor={id} className="text-xs font-semibold text-slate-400 tracking-wide">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`w-full text-sm rounded-[10px] border bg-surface-1 text-slate-100 outline-none transition-all duration-200 px-3.5 py-2.5 cursor-pointer appearance-none ${
          error
            ? 'border-red-500/25 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
            : 'border-white/[0.06] focus:border-brand-500 focus:ring-2 focus:ring-brand-500/10'
        } ${className}`}
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2364748b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 0.75rem center',
          backgroundSize: '1.25rem',
          backgroundRepeat: 'no-repeat',
          paddingRight: '2.5rem',
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-surface-2 text-slate-100">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs font-medium text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
});

Select.displayName = 'Select';
