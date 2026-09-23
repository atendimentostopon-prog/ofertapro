import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeContext';

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span>theme:{theme}</span>
      <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>toggle</button>
    </div>
  );
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  // @ts-expect-error limpa mock de matchMedia entre testes
  delete window.matchMedia;
});

describe('ThemeProvider', () => {
  it('sem preferencia salva e sem matchMedia -> light', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('theme:light')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('SO em modo escuro e sem preferencia salva -> dark', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('theme:dark')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('preferencia salva no localStorage tem prioridade sobre o SO', () => {
    localStorage.setItem('admin:theme', 'light');
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia;
    render(<ThemeProvider><Probe /></ThemeProvider>);
    expect(screen.getByText('theme:light')).toBeInTheDocument();
  });

  it('setTheme troca o estado, persiste no localStorage e atualiza data-theme', () => {
    render(<ThemeProvider><Probe /></ThemeProvider>);
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByText('theme:dark')).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('admin:theme')).toBe('dark');
  });

  it('useTheme fora do provider lanca erro', () => {
    function Bad() { useTheme(); return null; }
    expect(() => render(<Bad />)).toThrow('useTheme fora do ThemeProvider');
  });
});
