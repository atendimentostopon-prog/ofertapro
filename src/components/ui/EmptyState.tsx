import React from 'react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionText,
  onAction
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center w-full">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-line flex items-center justify-center mb-5">
          <Icon className="w-7 h-7 text-ink-tertiary" />
        </div>
      )}
      <h3 className="text-ink font-semibold text-[15px] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-ink-secondary mb-6 max-w-xs leading-relaxed">
        {description}
      </p>
      {actionText && onAction && (
        <Button variant="primary" size="sm" onClick={onAction}>
          {actionText}
        </Button>
      )}
    </div>
  );
};
