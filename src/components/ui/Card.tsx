import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'deeper' | 'glass' | 'metric';
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  hoverable = false,
  className = '',
  ...props
}) => {
  const baseStyle = 'rounded-2xl border transition-all duration-200';
  
  const variants = {
    default: 'bg-surface-2 border-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.2)]',
    deeper: 'bg-surface-1 border-white/[0.04] shadow-[0_2px_16px_rgba(0,0,0,0.25)]',
    glass: 'bg-surface-2/60 backdrop-blur-xl border-white/[0.06] shadow-md',
    metric: 'bg-surface-2 border-white/[0.06] shadow-[0_2px_12px_rgba(0,0,0,0.2)] metric-card',
  };

  const hoverStyle = hoverable 
    ? 'cursor-pointer hover:-translate-y-0.5 hover:border-white/[0.1] hover:shadow-[0_6px_20px_rgba(0,0,0,0.3)]'
    : '';

  return (
    <div
      className={`${baseStyle} ${variants[variant]} ${hoverStyle} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
