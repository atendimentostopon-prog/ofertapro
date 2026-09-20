import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  icons?: React.ComponentType<{ className?: string }>[];
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  variant?: 'first-use' | 'no-results' | 'error' | 'permission';
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  icons = [],
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  variant = 'first-use',
  compact = false,
}) => {
  const iconSet = Icon ? [Icon, ...icons] : icons;
  return (
    <div
      className={`flex flex-col items-center justify-center px-6 text-center w-full ${compact ? 'py-8' : 'py-14'}`}
      data-empty-state={variant}
    >
      {iconSet.length > 0 && (
        <div className="flex items-center justify-center mb-5" aria-hidden="true">
          {iconSet.slice(0, 3).map((StateIcon, index) => (
            <div
              key={index}
              className={`w-12 h-12 rounded-xl bg-surface-1 border border-line flex items-center justify-center shadow-xs ${index > 0 ? '-ml-2.5' : ''} ${index === 0 && iconSet.length > 1 ? '-rotate-6' : ''} ${index === 2 ? 'rotate-6' : ''}`}
            >
              <StateIcon className="w-5 h-5 text-ink-tertiary" />
            </div>
          ))}
        </div>
      )}
      <h3 className="text-ink font-semibold text-[15px] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-ink-secondary mb-6 max-w-xs leading-relaxed">
        {description}
      </p>
      {(actionText || secondaryActionText) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actionText && onAction && (
            <Button variant="primary" size="sm" onClick={onAction}>{actionText}</Button>
          )}
          {secondaryActionText && onSecondaryAction && (
            <Button variant="secondary" size="sm" onClick={onSecondaryAction}>{secondaryActionText}</Button>
          )}
        </div>
      )}
    </div>
  );
};
