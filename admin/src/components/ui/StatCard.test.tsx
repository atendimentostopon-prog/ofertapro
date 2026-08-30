import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('mostra "Dados indisponiveis" quando available e false', () => {
    render(<StatCard label="Jobs falhos" value={null} available={false} />);
    expect(screen.getByText('Dados indisponiveis')).toBeInTheDocument();
  });
  it('formata numero em pt-BR quando available', () => {
    render(<StatCard label="Usuarios" value={1234} available />);
    expect(screen.getByText('1.234')).toBeInTheDocument();
  });
  it('aplica suffix', () => {
    render(<StatCard label="Taxa" value={98.5} available suffix="%" />);
    expect(screen.getByText('98,5%')).toBeInTheDocument();
  });
});
