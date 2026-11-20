import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

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
  /** An accessible name for the table (WCAG 2.1 AA: the table needs a name). */
  readonly ariaLabel?: string;
  /**
   * What the pager says the total counts. Defaults to the shared "total
   * records" text; a table whose rows represent documents (goods receipts)
   * passes its own words instead.
   */
  readonly totalLabel?: string;
}

export function DataTable<T extends object = Record<string, unknown>>({
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
  emptyMessage,
  className,
  ariaLabel,
  totalLabel,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const resolvedEmptyMessage = emptyMessage ?? t('ui.table.noRecords');
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function handleHeaderClick(col: Column<T>) {
    if (!col.sortable || !onSortChange) return;
    const nextDir = sortColumn === col.key && sortDirection === 'asc' ? 'desc' : 'asc';
    onSortChange(col.key, nextDir);
  }

  return (
    <div className={['table-container', 'table-container--fixed', className].filter(Boolean).join(' ')}>
      <div className="table-scroll">
        <table className="data-table" role="table" aria-busy={loading ? 'true' : undefined} aria-label={ariaLabel}>
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
                {resolvedEmptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, index) => (
              <tr key={(row as { id?: string }).id ?? index}>
                {columns.map((col) => {
                  const val = (row as Record<string, unknown>)[col.key];
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
      </div>
      <div className="data-table__pager">
        <span>{totalLabel ?? t('ui.table.totalRecords', { count: total })}</span>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
          <span>
            {t('ui.table.pageOf', { page, totalPages })}
          </span>
          <button
            type="button"
            className="button"
            disabled={page <= 1}
            onClick={() => onPageChange?.(page - 1)}
          >
            {t('ui.table.previous')}
          </button>
          <button
            type="button"
            className="button"
            disabled={page >= totalPages}
            onClick={() => onPageChange?.(page + 1)}
          >
            {t('ui.table.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
