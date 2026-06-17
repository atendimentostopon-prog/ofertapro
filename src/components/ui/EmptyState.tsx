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
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-[#101827] rounded-3xl border border-white/[0.06] w-full">
      {Icon && (
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/[0.08] flex items-center justify-center mb-5 text-[#94A3B8]">
          <Icon className="w-8 h-8 text-current" />
        </div>
      )}
      <h3 className="text-[#F8FAFC] font-bold text-lg mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-[#94A3B8] mb-6 max-w-sm leading-relaxed">
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
