import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ThemeToggle from './ThemeToggle';
import { ThemeProvider } from '../context/ThemeContext';

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('ThemeToggle', () => {
  it('comeca no tema claro (sem preferencia salva) e alterna pro escuro ao clicar', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    const button = screen.getByRole('button', { name: 'Ativar tema escuro' });
    fireEvent.click(button);
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('clicar duas vezes volta pro tema claro', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ativar tema claro' }));
    expect(screen.getByRole('button', { name: 'Ativar tema escuro' })).toBeInTheDocument();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
