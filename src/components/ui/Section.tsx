import React from 'react';

interface SectionProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  variant?: 'default' | 'compact';
  bodyClassName?: string;
  headerClassName?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  icon: Icon,
  variant = 'default',
  bodyClassName = '',
  headerClassName = '',
  footer,
  children,
  className = '',
}) => {
  const hasHeader = !!(title || description || Icon);
  const isCompact = variant === 'compact';

  return (
    <div className={`rounded-2xl border border-white/[0.06] bg-surface-2 overflow-hidden ${className}`}>
      {hasHeader && (
        <div
          className={`flex items-center gap-3 border-b border-white/[0.04] bg-surface-3/30 ${
            isCompact ? 'px-4 py-3' : 'px-6 py-4'
          } ${headerClassName}`}
        >
          {Icon && (
            <div
              className={`rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center flex-shrink-0 ${
                isCompact ? 'w-8 h-8' : 'w-9 h-9'
              }`}
            >
              <Icon className="w-4 h-4 text-brand-400" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {title && (
              <h3
                className={`font-bold text-slate-100 tracking-tight ${
                  isCompact ? 'text-sm' : 'text-base'
                }`}
              >
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs font-medium text-slate-400 mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
      )}
      <div className={`${isCompact ? 'p-4 space-y-4' : 'p-6 space-y-5'} ${bodyClassName}`}>
        {children}
      </div>
      {footer && (
        <div className="px-6 py-4 border-t border-white/[0.04] bg-surface-1/40">
          {footer}
        </div>
      )}
    </div>
  );
};
