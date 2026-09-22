import React from 'react';
import { Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  children: React.ReactNode; // o valor real (fica borrado)
  className?: string;
}

/** Valor de analytics travado pro plano atual: borra + cadeado, clique -> /pricing. */
export const LockedNumber: React.FC<Props> = ({ children, className = '' }) => {
  const nav = useNavigate();
  return (
    <button
      type="button"
      onClick={() => nav('/pricing')}
      title="Analytics disponível no plano Profissional"
      className={`relative inline-flex items-center cursor-pointer align-middle ${className}`}
    >
      <span className="blur-[5px] select-none pointer-events-none tabular-nums">{children}</span>
      <Lock className="w-3 h-3 text-ink-tertiary absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
    </button>
  );
};
