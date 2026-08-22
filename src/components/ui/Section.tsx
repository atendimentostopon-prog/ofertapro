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
    <div className={`rounded-2xl border border-line bg-surface-0 overflow-hidden ${className}`}>
      {hasHeader && (
        <div
          className={`flex items-center gap-3 border-b border-line bg-surface-1 ${
            isCompact ? 'px-4 py-3' : 'px-6 py-4'
          } ${headerClassName}`}
        >
          {Icon && (
            <div
              className={`rounded-xl bg-ice border border-mint-200 flex items-center justify-center flex-shrink-0 ${
                isCompact ? 'w-8 h-8' : 'w-9 h-9'
              }`}
            >
              <Icon className="w-4 h-4 text-mint-700" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            {title && (
              <h3
                className={`font-bold text-ink tracking-tight font-display ${
                  isCompact ? 'text-sm' : 'text-base'
                }`}
              >
                {title}
              </h3>
            )}
            {description && (
              <p className="text-xs font-medium text-ink-secondary mt-0.5">
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
        <div className="px-6 py-4 border-t border-line bg-surface-1">
          {footer}
        </div>
      )}
    </div>
  );
};
