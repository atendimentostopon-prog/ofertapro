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
  const baseStyle = 'rounded-2xl border transition-all duration-220';

  const variants = {
    default: 'bg-surface-0 border-line shadow-xs',
    deeper:  'bg-surface-1 border-line',
    glass:   'bg-surface-0/80 backdrop-blur-md border-line shadow-sm',
    metric:  'bg-surface-0 border-line shadow-xs metric-card',
  };

  const hoverStyle = hoverable
    ? 'cursor-pointer hover:-translate-y-0.5 hover:border-line-strong hover:shadow-md'
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
