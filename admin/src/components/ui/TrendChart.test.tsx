import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrendChart } from './TrendChart';

const tabs = [
  { key: 'sends', label: 'Envios', series: [{ date: '2026-09-01', value: 4 }, { date: '2026-09-02', value: 6 }] },
  { key: 'clicks', label: 'Cliques', series: [{ date: '2026-09-01', value: 1 }, { date: '2026-09-02', value: 2 }] },
];

describe('TrendChart', () => {
  it('mostra o total da primeira aba e o grafico acessivel', () => {
    render(<TrendChart tabs={tabs} />);
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Gráfico de Envios por dia' })).toBeInTheDocument();
  });

  it('troca de metrica ao clicar na aba', () => {
    render(<TrendChart tabs={tabs} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Cliques' }));
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Cliques' })).toHaveAttribute('aria-selected', 'true');
  });

  it('nao renderiza sem serie com 2+ pontos', () => {
    const { container } = render(
      <TrendChart tabs={[{ key: 'sends', label: 'Envios', series: [{ date: '2026-09-01', value: 4 }] }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
