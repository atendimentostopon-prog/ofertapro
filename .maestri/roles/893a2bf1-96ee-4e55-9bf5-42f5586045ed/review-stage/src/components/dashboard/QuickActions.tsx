import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Send, Radio, Radar } from 'lucide-react';

const ACTIONS: { label: string; Icon: React.ComponentType<{ className?: string }>; to: string }[] = [
  { label: 'Nova oferta',       Icon: Plus,  to: '/offers/new' },
  { label: 'Disparar oferta',   Icon: Send,  to: '/offers' },
  { label: 'Conectar canal',    Icon: Radio, to: '/channels' },
  { label: 'Grupos de origem',  Icon: Radar, to: '/integrations' },
];

export const QuickActions: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {ACTIONS.map(({ label, Icon, to }) => (
        <button
          key={to}
          type="button"
          onClick={() => navigate(to)}
          className="btn-secondary flex flex-col items-center justify-center gap-1.5 py-4 px-2 text-xs font-semibold cursor-pointer"
        >
          <Icon className="w-4 h-4" />
          {label}
        </button>
      ))}
    </div>
  );
};
