import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Algo deu errado',
  message,
  onRetry
}) => {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center w-full">
      <div className="w-16 h-16 rounded-2xl bg-red-500/8 border border-red-500/15 flex items-center justify-center mb-5 shadow-sm">
        <AlertCircle className="w-7 h-7 text-red-400" />
      </div>
      <h3 className="text-slate-100 font-semibold text-[15px] mb-2 tracking-tight">
        {title}
      </h3>
      <p className="text-sm text-slate-400 mb-6 max-w-sm leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} icon={RefreshCw}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
};
