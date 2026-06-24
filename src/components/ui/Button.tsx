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
  const baseStyle = 'inline-flex items-center justify-center gap-2 font-semibold rounded-[10px] transition-all duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0 active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-gradient-to-b from-brand-500 to-brand-600 hover:from-brand-400 hover:to-brand-500 text-white shadow-sm shadow-brand-900/20 border border-white/10',
    secondary: 'bg-surface-3 hover:bg-surface-4 text-slate-100 border border-white/[0.06] shadow-sm',
    danger: 'bg-red-500/8 hover:bg-red-500/15 text-red-400 border border-red-500/15',
    success: 'bg-emerald-500/8 hover:bg-emerald-500/15 text-emerald-400 border border-emerald-500/15',
    ghost: 'text-slate-400 hover:text-slate-100 hover:bg-white/[0.04] border border-transparent'
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
