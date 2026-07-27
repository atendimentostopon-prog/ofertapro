import React, { useState } from 'react';

interface ToggleProps {
  label?: string;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  description,
  checked: controlledChecked,
  defaultChecked = false,
  onChange,
  disabled = false,
  id,
  className = '',
}) => {
  const [internalChecked, setInternalChecked] = useState(defaultChecked);
  const isControlled = controlledChecked !== undefined;
  const isChecked = isControlled ? controlledChecked : internalChecked;

  const handleToggle = () => {
    if (disabled) return;
    const next = !isChecked;
    if (!isControlled) {
      setInternalChecked(next);
    }
    onChange?.(next);
  };

  const button = (
    <button
      type="button"
      role="switch"
      aria-checked={isChecked}
      aria-label={label}
      id={id}
      disabled={disabled}
      onClick={handleToggle}
      className={`relative w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 ${
        disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
      } ${isChecked ? 'bg-brand-600' : 'bg-surface-3'} ${className}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          isChecked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  if (!label && !description) {
    return button;
  }

  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        {label && (
          <label
            htmlFor={id}
            onClick={handleToggle}
            className={`text-sm font-medium text-slate-200 select-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
          >
            {label}
          </label>
        )}
        {description && (
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        )}
      </div>
      {button}
    </div>
  );
};
