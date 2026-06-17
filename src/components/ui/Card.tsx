import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'deeper' | 'glass';
  hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  hoverable = false,
  className = '',
  ...props
}) => {
  const baseStyle = 'rounded-2xl border transition-all duration-300';
  
  const variants = {
    default: 'bg-[#101827] border-white/[0.06] shadow-[0_4px_20px_rgba(0,0,0,0.25)]',
    deeper: 'bg-[#0B1020] border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.35)]',
    glass: 'bg-[#111C2E]/60 backdrop-blur-xl border-white/[0.08] shadow-lg'
  };

  const hoverStyle = hoverable 
    ? 'hover:-translate-y-0.5 hover:border-white/[0.12] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]'
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
