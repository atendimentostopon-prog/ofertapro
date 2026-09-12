import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataTable } from './DataTable';

type Row = { id: string; name: string };
const cols = [{ key: 'name', header: 'Nome' }];

describe('DataTable', () => {
  it('estado vazio', () => {
    render(<DataTable<Row> columns={cols} rows={[]} rowKey={(r) => r.id} emptyTitle="Nada aqui" />);
    expect(screen.getByText('Nada aqui')).toBeInTheDocument();
  });
  it('estado de erro com retry', async () => {
    const onRetry = vi.fn();
    render(<DataTable<Row> columns={cols} rows={[]} rowKey={(r) => r.id} error="falhou" onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(onRetry).toHaveBeenCalled();
  });
  it('renderiza linhas e paginacao', async () => {
    const onPageChange = vi.fn();
    render(
      <DataTable<Row>
        columns={cols}
        rows={[{ id: '1', name: 'Ana' }]}
        rowKey={(r) => r.id}
        pagination={{ page: 1, pageSize: 25, total: 60, onPageChange }}
      />,
    );
    expect(screen.getByText('Ana')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /próxima/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
