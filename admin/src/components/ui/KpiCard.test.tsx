import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('mostra "Dados indisponiveis" quando available e false', () => {
    render(<KpiCard label="Jobs falhos" value={null} available={false} />);
    expect(screen.getByText('Dados indisponíveis')).toBeInTheDocument();
  });

  it('formata numero em pt-BR e aplica suffix', () => {
    render(<KpiCard label="Taxa" value={98.5} available suffix="%" />);
    expect(screen.getByText('98,5%')).toBeInTheDocument();
  });

  it('mostra selo verde quando value > previous', () => {
    render(<KpiCard label="Novos usuarios" value={120} available previous={100} />);
    expect(screen.getByText('▲ 20%')).toBeInTheDocument();
  });

  it('mostra selo vermelho quando value < previous', () => {
    render(<KpiCard label="Novos usuarios" value={80} available previous={100} />);
    expect(screen.getByText('▼ 20%')).toBeInTheDocument();
  });

  it('nao mostra selo sem previous', () => {
    render(<KpiCard label="Usuarios totais" value={500} available />);
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });

  it('nao mostra selo quando previous e 0', () => {
    render(<KpiCard label="Novos usuarios" value={5} available previous={0} />);
    expect(screen.queryByText(/▲|▼/)).not.toBeInTheDocument();
  });

  it('renderiza sparkline quando series tem 2+ pontos', () => {
    render(
      <KpiCard
        label="Cliques"
        value={40}
        available
        series={[{ date: '2026-09-01', value: 10 }, { date: '2026-09-02', value: 30 }]}
      />,
    );
    expect(screen.getByTestId('kpi-sparkline')).toBeInTheDocument();
  });

  it('nao renderiza sparkline com menos de 2 pontos', () => {
    render(
      <KpiCard label="Cliques" value={40} available series={[{ date: '2026-09-01', value: 10 }]} />,
    );
    expect(screen.queryByTestId('kpi-sparkline')).not.toBeInTheDocument();
  });

  it('aplica tratamento maior quando size e hero', () => {
    render(<KpiCard label="Usuarios ativos" value={300} available size="hero" />);
    expect(screen.getByText('300')).toHaveClass('text-4xl');
  });
});
