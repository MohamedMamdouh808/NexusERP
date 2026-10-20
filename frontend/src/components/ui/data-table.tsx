import type { ReactNode } from 'react';
import { Icon } from './icon';

export interface Column<T> {
  readonly key: string;
  readonly header: string;
  readonly sortable?: boolean;
  readonly numeric?: boolean;
  readonly render?: (row: T) => ReactNode;
}

export interface DataTableProps<T> {
  readonly columns: readonly Column<T>[];
  readonly data: readonly T[];
  readonly loading?: boolean;
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly sortColumn?: string;
  readonly sortDirection?: 'asc' | 'desc';
  readonly onSortChange?: (column: string, direction: 'asc' | 'desc') => void;
  readonly onPageChange?: (page: number) => void;
  readonly emptyMessage?: string;
  readonly className?: string;
}

export function DataTable<T extends Record<string, unknown> = Record<string, unknown>>({
  columns,
  data,
  loading = false,
  total,
  page,
  pageSize,
  sortColumn,
  sortDirection,
  onSortChange,
  onPageChange,
  emptyMessage = 'No records found',
  className,
}: DataTableProps<T>) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleHeaderClick(col: Column<T>) {
    if (!col.sortable || !onSortChange) return;
    const nextDir = sortColumn === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDir);
  }

  return (
    <div className={['table-container', className].filter(Boolean).join(' ')}>
      <table className="data-table" role="table" aria-busy={loading ? 'true' : undefined}>
        <thead>
          <tr>
            {columns.map((col) => {
              const isSorted = sortColumn === col.key;
              const ariaSort = isSorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : undefined;

              return (
                <th
                  key={col.key}
                  role="columnheader"
                  aria-sort={ariaSort}
                  className={col.numeric ? 'numeric-cell' : undefined}
                >
                  {col.sortable ? (
                    <button type="button" onClick={() => handleHeaderClick(col)}>
                      <span>{col.header}</span>
                      <Icon
                        name={
                          !isSorted
                            ? 'sortable'
                            : sortDirection === 'asc'
                              ? 'sortAscending'
                              : 'sortDescending'
                        }
                      />
                    </button>
                  ) : (
                    <span>{col.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} data-testid="table-skeleton-row">
                <td colSpan={columns.length}>
                  <div
                    className="skeleton__bar"
                    style={{ width: '100%', height: '1.25rem' }}
                    aria-hidden="true"
                  />
                </td>
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: 'var(--spacing-xl)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr key={(row.id as string) ?? index}>
                {columns.map((col) => {
                  const val = row[col.key];
                  return (
                    <td key={col.key} className={col.numeric ? 'numeric-cell' : undefined}>
                      {col.render ? col.render(row) : (val as ReactNode)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="data-table__pager">
        <span>{total} total records</span>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            className="button"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            Prev
          </button>
          <button
            type="button"
            className="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
