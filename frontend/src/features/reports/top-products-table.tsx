import { useTranslation } from 'react-i18next';

import { Card } from '../../components/ui';

/**
 * Top products by revenue — an empty, honest table. Ranking only becomes
 * meaningful once invoice lines exist; until then the columns stand alone
 * and the body says so.
 */
export function TopProductsTable() {
  const { t } = useTranslation();
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
                <th
                  key={col}
                  scope="col"
                  style={index > 0 ? { textAlign: 'end' } : undefined}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={columns.length}>
                <div className="reports-table-empty" role="status">
                  <svg className="reports-table-empty__glyph" viewBox="0 0 64 40" aria-hidden="true" focusable="false">
                    <path d="M2 36h60M10 36V26M24 36V18M38 36V10M52 36V4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <p className="reports-table-empty__title">{t('reports.page.topProductsEmptyTitle')}</p>
                  <p className="reports-table-empty__description">{t('reports.page.topProductsEmptyDescription')}</p>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}