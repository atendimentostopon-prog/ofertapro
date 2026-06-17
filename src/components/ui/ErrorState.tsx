import React from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Ocorreu um erro',
  message,
  onRetry
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center bg-red-950/10 rounded-3xl border border-red-500/10 w-full">
      <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5 text-red-400">
        <AlertCircle className="w-7 h-7 text-current" />
      </div>
      <h3 className="text-[#F8FAFC] font-bold text-lg mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-red-400/80 mb-6 max-w-sm leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
};
