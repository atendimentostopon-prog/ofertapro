import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV } from '../nav';
import { useAdminAuth } from '../context/AdminAuthContext';
import { hasPermission } from '../lib/permissions';

const STORAGE_KEY = 'admin:sidebar';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'collapsed';
  } catch {
    return false;
  }
}

export default function Sidebar() {
  const { identity } = useAdminAuth();
  const granted = identity?.permissions ?? [];
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? 'collapsed' : 'expanded');
      } catch {
        /* storage indisponivel: segue so com o estado em memoria */
      }
      return next;
    });
  }

  return (
    <aside
      className={`flex shrink-0 flex-col border-r border-line bg-surface-0 transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center justify-between px-4 py-4">
        {!collapsed && <span className="font-display text-sm font-bold text-ink">Aflyo Admin</span>}
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
          className="rounded-md p-1 text-ink-tertiary transition-colors hover:bg-surface-1 hover:text-ink"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 pb-6">
        {NAV.map((section) => {
          const items = section.items.filter(
            (i) => !i.permission || hasPermission(granted, i.permission),
          );
          if (items.length === 0) return null;
          return (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-ink-tertiary">
                  {section.title}
                </p>
              )}
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  if (item.comingSoon || !item.to) {
                    return (
                      <li key={item.label}>
                        <span
                          aria-disabled
                          className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-ink-tertiary opacity-60"
                          title="Em breve"
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          {!collapsed && (
                            <span className="flex-1 truncate">
                              {item.label}
                              <span className="ml-1.5 text-[10px] font-semibold uppercase">Em breve</span>
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={item.label}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                            isActive
                              ? 'bg-graphite-900 text-ink-inverse'
                              : 'text-ink-secondary hover:bg-surface-1 hover:text-ink'
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
