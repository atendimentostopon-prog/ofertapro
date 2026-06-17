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
        <label htmlFor={id} className="text-xs font-bold text-[#94A3B8] tracking-wide uppercase">
          {label}
        </label>
      )}
      <select
        ref={ref}
        id={id}
        className={`w-full text-sm rounded-xl border bg-[#101827] text-[#F8FAFC] outline-none transition-all duration-200 px-4 py-2.5 cursor-pointer appearance-none ${
          error
            ? 'border-red-500/30 focus:border-red-500 focus:ring-2 focus:ring-red-500/10'
            : 'border-white/5 focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/15'
        } ${className}`}
        style={{
          backgroundImage: `url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%2394a3b8' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
          backgroundPosition: 'right 1rem center',
          backgroundSize: '1.25rem',
          backgroundRepeat: 'no-repeat',
        }}
        {...props}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="bg-[#101827] text-[#F8FAFC]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs font-semibold text-red-400">{error}</p>}
      {hint && !error && <p className="text-xs text-[#64748B]">{hint}</p>}
    </div>
  );
});

Select.displayName = 'Select';
