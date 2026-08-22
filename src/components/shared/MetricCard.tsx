import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  change: string;
  positive: boolean;
  icon: React.ElementType;
  gradient: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, change, positive, icon: Icon, gradient }) => (
  <div className="glass-card p-6 flex flex-col justify-between group cursor-default">
    <div className="flex items-start justify-between mb-6">
      <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-sm ring-1 ring-line-subtle group-hover:scale-110 transition-transform duration-300`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <span className={`flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
        positive ? 'bg-success-bg text-success-ink border-success/20' : 'bg-danger-bg text-danger-ink border-danger/20'
      }`}>
        {positive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
        {change}
      </span>
    </div>
    <div>
      <p className="text-[28px] font-bold text-ink tracking-tight leading-none mb-1.5">{value}</p>
      <p className="text-sm font-medium text-ink-secondary">{label}</p>
    </div>
  </div>
);

export default MetricCard;
