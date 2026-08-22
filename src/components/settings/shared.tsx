import React from 'react';

export const SettingsSection: React.FC<{
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, description, icon: Icon, children }) => (
  <div className="glass-card overflow-hidden border-line">
    <div className="px-6 py-4 border-b border-line bg-surface-1 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-ice border border-mint-200 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-mint-700" size={18} />
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-ink tracking-tight">{title}</h3>
        {description && <p className="text-[12px] font-medium text-ink-secondary mt-0.5">{description}</p>}
      </div>
    </div>
    <div className="p-6 space-y-5">{children}</div>
  </div>
);

export const Field: React.FC<{
  label: string;
  hint?: string;
  children: React.ReactNode;
}> = ({ label, hint, children }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-medium text-ink-secondary">{label}</label>
    {children}
    {hint && <p className="text-xs text-ink-tertiary">{hint}</p>}
  </div>
);
