import React from 'react';
import { Shield, Users, TrendingUp } from 'lucide-react';
import { APP_NAME } from '../../config/app';

interface AuthLayoutProps {
  title: string;
  description: string;
  headerRightAction?: React.ReactNode;
  showFeatureHighlights?: boolean;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({
  title,
  description,
  headerRightAction,
  showFeatureHighlights = true,
  children,
}) => {
  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center relative overflow-hidden text-ink p-4 sm:p-6">
      <div className="relative z-10 w-full max-w-[420px] my-8">
        <div className="bg-surface-0 rounded-2xl shadow-lg p-6 sm:p-8 border border-line flex flex-col justify-between">
          <div className="flex items-center justify-between mb-6">
            <img
              src="/brand/logo-primary.png"
              alt={APP_NAME}
              className="h-8 w-auto select-none"
              draggable={false}
            />
            {headerRightAction}
          </div>

          <div className="mb-6">
            <h1 className="text-xl font-bold text-ink tracking-tight font-display">{title}</h1>
            <p className="text-sm text-ink-secondary mt-1">{description}</p>
          </div>

          {children}
        </div>

        {showFeatureHighlights && (
          <div className="mt-5 flex items-center justify-center gap-6 z-10 relative select-none">
            {[
              { icon: <Shield className="w-3.5 h-3.5" />, text: 'Seguro' },
              { icon: <Users className="w-3.5 h-3.5" />, text: 'Multi-canal' },
              { icon: <TrendingUp className="w-3.5 h-3.5" />, text: 'Analytics' },
            ].map(f => (
              <div key={f.text} className="flex items-center gap-1.5 text-ink-tertiary">
                <span className="text-mint-700">{f.icon}</span>
                <span className="text-xs font-medium">{f.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
