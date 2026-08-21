import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
  variant?: 'default' | 'compact';
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  children,
  variant = 'default',
  className = '',
}) => {
  const isCompact = variant === 'compact';

  return (
    <div
      className={`flex flex-col sm:flex-row sm:items-end justify-between gap-3 ${
        isCompact ? 'mb-4' : 'mb-6'
      } ${className}`}
    >
      <div className="space-y-1 min-w-0">
        <h1
          className={`font-bold text-slate-100 tracking-tight truncate ${
            isCompact ? 'text-base md:text-lg' : 'text-xl md:text-2xl'
          }`}
        >
          {title}
        </h1>
        {description && (
          <p
            className={`text-slate-400 leading-relaxed ${
              isCompact ? 'text-xs' : 'text-sm'
            }`}
          >
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
          {children}
        </div>
      )}
    </div>
  );
};
