import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../../components/shell/page-header';
import { Card, ErrorState, Skeleton } from '../../components/ui';
import { getStockOnHand } from '../../services/reports-client';

export function StockOnHandPage() {
  const { t } = useTranslation();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { setData(await getStockOnHand({ page: 1, pageSize: 20 })); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  return (
    <section aria-label={t('reports.stockOnHand.sectionAria')}>
      <PageHeader title={t('reports.stockOnHand.title')} />
      <Card title={t('reports.stockOnHand.title')}>
        {loading ? <Skeleton label={t('reports.loading')} /> :
          error ? <ErrorState message={error} onRetry={() => void load()} /> :
          !data || data.items.length === 0 ? <p>{t('reports.empty')}</p> :
          <>
            <p>{t('reports.total')}: {data.total}</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(data.items.slice(0, 5), null, 2)}</pre>
            {data.totals && <p>{t('reports.totals')}: {JSON.stringify(data.totals)}</p>}
          </>}
      </Card>
    </section>
  );
}