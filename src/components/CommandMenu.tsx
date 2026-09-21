import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { History, LayoutDashboard, Package, Plus, Radio, Search, Settings, X } from 'lucide-react';

interface CommandMenuProps {
  open: boolean;
  onClose: () => void;
  initialQuery?: string;
}

const commands = [
  { label: 'Ir para o Dashboard', keywords: 'inicio métricas analytics', to: '/dashboard', icon: LayoutDashboard },
  { label: 'Ver todas as ofertas', keywords: 'produtos catálogo', to: '/offers', icon: Package },
  { label: 'Criar nova oferta', keywords: 'produto publicar cadastrar', to: '/offers/new', icon: Plus },
  { label: 'Conectar ou gerenciar canais', keywords: 'whatsapp telegram discord grupos', to: '/channels', icon: Radio },
  { label: 'Abrir histórico de disparos', keywords: 'envios sucesso erro', to: '/history', icon: History },
  { label: 'Abrir configurações', keywords: 'conta bot api templates cobrança', to: '/settings', icon: Settings },
];

const CommandMenu: React.FC<CommandMenuProps> = ({ open, onClose, initialQuery = '' }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState(initialQuery);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, initialQuery]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR');
    const matching = normalized
      ? commands.filter(item => `${item.label} ${item.keywords}`.toLocaleLowerCase('pt-BR').includes(normalized))
      : commands;
    if (normalized) {
      return [
        { label: `Buscar ofertas por “${query.trim()}”`, keywords: '', to: `/offers?q=${encodeURIComponent(query.trim())}`, icon: Search },
        ...matching,
      ];
    }
    return matching;
  }, [query]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  if (!open) return null;

  const run = (to: string) => {
    onClose();
    navigate(to);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-graphite/50 backdrop-blur-xs flex items-start justify-center p-4 pt-[12vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Busca global e ações rápidas"
        className="w-full max-w-xl bg-surface-0 border border-line rounded-2xl shadow-lg overflow-hidden animate-scale-in"
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-line">
          <Search className="w-5 h-5 text-ink-tertiary flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, results.length - 1)); }
              if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); }
              if (event.key === 'Enter' && results[activeIndex]) { event.preventDefault(); run(results[activeIndex].to); }
            }}
            placeholder="Buscar ofertas, canais ou ações…"
            aria-label="Buscar no Aflyo"
            className="flex-1 min-w-0 py-4 bg-transparent outline-none text-sm text-ink placeholder:text-ink-tertiary focus-visible:shadow-none focus-visible:rounded-none"
          />
          <button type="button" onClick={onClose} aria-label="Fechar busca" className="p-2 rounded-lg text-ink-tertiary hover:bg-surface-1 hover:text-ink">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-2 max-h-[min(420px,60vh)] overflow-y-auto">
          <p className="px-2.5 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-tertiary">
            {query.trim() ? 'Resultados e ações' : 'Atalhos'}
          </p>
          {results.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={`${item.to}-${item.label}`}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => run(item.to)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left text-sm transition-colors ${index === activeIndex ? 'bg-ice text-ink' : 'text-ink-secondary hover:bg-surface-1'}`}
              >
                <span className="w-8 h-8 rounded-lg bg-surface-0 border border-line flex items-center justify-center flex-shrink-0"><Icon className="w-4 h-4" /></span>
                <span className="font-medium flex-1 min-w-0 truncate">{item.label}</span>
                {index === activeIndex && <span className="text-[10px] text-ink-tertiary">Enter</span>}
              </button>
            );
          })}
        </div>
        <div className="px-4 py-2.5 border-t border-line bg-surface-1 text-[10px] text-ink-tertiary flex gap-4">
          <span>↑↓ navegar</span><span>Enter abrir</span><span>Esc fechar</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CommandMenu;
