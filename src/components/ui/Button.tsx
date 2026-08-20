import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon: Icon,
  className = '',
  disabled,
  ...props
}) => {
  const baseStyle = 'inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors duration-160 cursor-pointer focus:outline-none focus-visible:shadow-focus active:translate-y-px disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed';

  const variants = {
    primary:   'bg-graphite hover:bg-graphite-800 text-ink-inverse border border-graphite',
    secondary: 'bg-surface-0 hover:bg-surface-1 text-ink border border-line hover:border-line-strong shadow-xs',
    danger:    'bg-danger-bg hover:bg-danger/15 text-danger-ink border border-danger/20',
    success:   'bg-success-bg hover:bg-success/15 text-success-ink border border-success/20',
    ghost:     'text-ink-secondary hover:text-ink hover:bg-surface-1 border border-transparent'
  };

  const sizes = {
    sm: 'text-xs px-3.5 py-2 gap-1.5',
    md: 'text-sm px-4 py-2.5',
    lg: 'text-sm px-6 py-3'
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="w-4 h-4 animate-spin text-current" />
      ) : Icon ? (
        <Icon className="w-4 h-4 flex-shrink-0 text-current" />
      ) : null}
      {children}
    </button>
  );
};
