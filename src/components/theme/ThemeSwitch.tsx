import React from 'react';
import { useTheme } from 'next-themes';
import { Sun, Moon } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Label } from '../ui/label';

const ThemeSwitch: React.FC = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return (
    <div className="flex items-center gap-1.5">
      <Label htmlFor="theme-switch" className="sr-only">
        Alternar tema claro/escuro
      </Label>
      <Switch
        id="theme-switch"
        checked={isDark}
        onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
        aria-label={isDark ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      />
      {isDark ? (
        <Moon className="w-4 h-4 text-ink-secondary" />
      ) : (
        <Sun className="w-4 h-4 text-ink-secondary" />
      )}
    </div>
  );
};

export default ThemeSwitch;
