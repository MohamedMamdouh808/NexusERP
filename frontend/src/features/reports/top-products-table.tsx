import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { Card, ErrorState, Skeleton } from '../../components/ui';
import { formatMoneyLocalized, formatNumber, useOrganizationCurrency } from '../../lib/i18n-format';
import { getTopProducts } from '../../services/reports-client';
import type { DateRange } from './date-range-selector';

export function TopProductsTable({ range }: { readonly range: DateRange }) {
  const { t } = useTranslation();
  const currency = useOrganizationCurrency();

  const query = useQuery({
    queryKey: ['reports', 'top-products', range.start, range.end],
    queryFn: () => getTopProducts(range.start, range.end),
  });

  const rows = query.data?.rows ?? [];

  if (query.isPending) {
    return (
      <Card className="reports-top-products" title={t('reports.page.topProducts')}>
        <Skeleton label={t('reports.loading')} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card className="reports-top-products" title={t('reports.page.topProducts')}>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  const columns = [
    t('reports.page.topProductsColumns.product'),
    t('reports.page.topProductsColumns.unitsSold'),
    t('reports.page.topProductsColumns.revenue'),
  ];

  return (
    <Card className="reports-top-products" title={t('reports.page.topProducts')}>
      <div className="reports-table-scroll">
        <table className="reports-table">
          <thead>
            <tr>
              {columns.map((col, index) => (
                <th key={col} scope="col" style={index > 0 ? { textAlign: 'end' } : undefined}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <div className="reports-table-empty" role="status">
                    <svg className="reports-table-empty__glyph" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
                      <path d="M2 36h60M10 36V26M24 36V18M38 36V10M52 36V4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="reports-table-empty__title">{t('reports.page.topProductsEmptyTitle')}</p>
                    <p className="reports-table-empty__description">{t('reports.page.topProductsEmptyDescription')}</p>
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.productId}>
                  <td>{row.productName}</td>
                  <td className="numeric-cell" style={{ textAlign: 'end' }}>{formatNumber(Number(row.quantity))}</td>
                  <td className="numeric-cell" style={{ textAlign: 'end' }}>{formatMoneyLocalized(row.revenue, currency, 2)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
