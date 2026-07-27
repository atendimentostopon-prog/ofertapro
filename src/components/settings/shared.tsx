import React from 'react';

export const SettingsSection: React.FC<{
  title: string;
  description?: string;
  icon: React.ElementType;
  children: React.ReactNode;
}> = ({ title, description, icon: Icon, children }) => (
  <div className="glass-card overflow-hidden border-white/[0.04]">
    <div className="px-6 py-4 border-b border-white/[0.04] bg-surface-3/30 flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
        <Icon className="w-4.5 h-4.5 text-indigo-400" size={18} />
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-slate-100 tracking-tight">{title}</h3>
        {description && <p className="text-[12px] font-medium text-slate-400 mt-0.5">{description}</p>}
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
    <label className="text-sm font-medium text-slate-400">{label}</label>
    {children}
    {hint && <p className="text-xs text-slate-500">{hint}</p>}
  </div>
);
