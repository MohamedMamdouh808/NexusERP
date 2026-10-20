import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataTable } from '../data-table';

describe('DataTable states (T041, FR-024-FR-026, FR-050)', () => {
  interface Item extends Record<string, unknown> {
    id: string;
    sku: string;
    name: string;
    quantity: number;
  }

  const columns = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'name', header: 'Product Name', sortable: true },
    { key: 'quantity', header: 'Quantity', numeric: true },
  ];

  const items: Item[] = [
    { id: '1', sku: 'SKU-001', name: 'Widget A', quantity: 42 },
    { id: '2', sku: 'SKU-002', name: 'Widget B', quantity: 10 },
  ];

  it('renders default state with table role and columnheaders', () => {
    render(
      <DataTable
        columns={columns}
        data={items}
        total={2}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByRole('columnheader')).toHaveLength(3);
    expect(screen.getByText('Widget A')).toBeInTheDocument();
  });

  it('renders loading state as skeleton rows with aria-busy="true"', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        loading
        total={0}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
      />,
    );
    const table = screen.getByRole('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByTestId('table-skeleton-row').length).toBeGreaterThan(0);
  });

  it('renders empty state when there are no items and not loading', () => {
    render(
      <DataTable
        columns={columns}
        data={[]}
        total={0}
        page={1}
        pageSize={10}
        onPageChange={() => {}}
        emptyMessage="No inventory found"
      />,
    );
    expect(screen.getByText('No inventory found')).toBeInTheDocument();
  });

  it('renders sorted-ascending and sorted-descending headers', async () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <DataTable
        columns={columns}
        data={items}
        total={2}
        page={1}
        pageSize={10}
        sortColumn="name"
        sortDirection="asc"
        onSortChange={onSortChange}
        onPageChange={() => {}}
      />,
    );

    const nameHeader = screen.getByRole('columnheader', { name: /Product Name/ });
    expect(nameHeader).toHaveAttribute('aria-sort', 'ascending');

    rerender(
      <DataTable
        columns={columns}
        data={items}
        total={2}
        page={1}
        pageSize={10}
        sortColumn="name"
        sortDirection="desc"
        onSortChange={onSortChange}
        onPageChange={() => {}}
      />,
    );
    expect(nameHeader).toHaveAttribute('aria-sort', 'descending');
  });

  it('renders a page after the first and reports visible total count', () => {
    render(
      <DataTable
        columns={columns}
        data={items}
        total={50}
        page={2}
        pageSize={10}
        onPageChange={() => {}}
      />,
    );
    expect(screen.getByText(/Page 2 of 5/i)).toBeInTheDocument();
    expect(screen.getByText(/50 total/i)).toBeInTheDocument();
  });
});
