import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Card, ErrorState, Skeleton } from '../../components/ui';
import { formatMoneyLocalized, useOrganizationCurrency } from '../../lib/i18n-format';
import {
  getPaymentsReceivedOverTime,
  getPurchasesOverTime,
  getSalesOverTime,
  type OverTimeResponse,
} from '../../services/reports-client';
import type { DateRange } from './date-range-selector';
import { ChartFrame } from './chart-frame';

type Segment = 'sales' | 'orders' | 'invoices';

const SEGMENTS: readonly Segment[] = ['sales', 'orders', 'invoices'];

/** At most this many buckets the chart keeps: the axes read better with few. */
const MAX_CHART_TICKS = 6;

/** Shape of the over-time responses the chart reads. */
interface OverTimeLike {
  readonly label: string;
  readonly value: string;
  readonly count: number;
}

/** A bucket label rendered the way people read dates ("Nov 19"), never a raw timestamp. */
function formatBucketLabel(label: string, language: string): string {
  const date = new Date(label);
  if (Number.isNaN(date.getTime())) return label;
  return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short' }).format(date);
}

/** A value compacted for an axis: thousands collapse to a readable scale. */
function formatCompactValue(value: string, language: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) return value;
  return new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(number);
}

/** The series the chart draws: evenly spread when there are too many buckets. */
function seriesTicks(buckets: readonly OverTimeLike[], max: number): readonly OverTimeLike[] {
  if (buckets.length <= max) return buckets;
  const step = Math.ceil(buckets.length / max);
  const picked = buckets.filter((_, index) => index % step === 0).slice(0, max);
  return picked.length > 0 ? picked : buckets.slice(-max);
}

function allZero(buckets: readonly OverTimeLike[]): boolean {
  // An empty series is an empty chart too: show the informative state rather
  // than axes with nothing drawn on them.
  return buckets.every((bucket) => Number(bucket.value) === 0);
}

/** A three-point moving average, drawn as the trend of a noisy series. */
function movingAverages(values: readonly string[]): number[] {
  const numbers = values.map(Number);
  return numbers.map((_, index) => {
    const window = numbers.slice(Math.max(0, index - 1), Math.min(numbers.length, index + 2));
    return window.reduce((sum, value) => (Number.isFinite(value) ? sum + value : sum), 0) / window.length;
  });
}

/** The source each segment reads: three distinct server streams. */
async function segmentQuery(segment: Segment, start: string, end: string): Promise<OverTimeResponse> {
  if (segment === 'sales') return getSalesOverTime(start, end);
  if (segment === 'orders') return getPurchasesOverTime(start, end);
  return getPaymentsReceivedOverTime(start, end);
}

export function SalesOverviewCard({ range }: { readonly range: DateRange }) {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  const currency = useOrganizationCurrency();
  const [segment, setSegment] = useState<Segment>('sales');

  const query = useQuery({
    queryKey: ['reports', 'sales-overview', segment, range.start, range.end],
    queryFn: () => segmentQuery(segment, range.start, range.end),
  });

  const buckets = query.data?.buckets ?? [];
  const series = seriesTicks(buckets, MAX_CHART_TICKS);
  const empty = series.length === 0 || allZero(series);
  const trend = movingAverages(series.map((bucket) => bucket.value));
  const chartRows = series.map((bucket, index) => ({
    label: formatBucketLabel(String(bucket.label), language),
    value: bucket.value,
    trend: trend[index],
  }));

  const segmentSwitch = (
    <SalesOverviewSegments segment={segment} setSegment={setSegment} />
  );

  if (query.isPending) {
    return (
      <Card title={t('reports.page.salesOverview')} actions={segmentSwitch}>
        <Skeleton label={t('reports.loading')} />
      </Card>
    );
  }
  if (query.isError) {
    return (
      <Card title={t('reports.page.salesOverview')} actions={segmentSwitch}>
        <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />
      </Card>
    );
  }

  return (
    <ChartFrame
      title={t('reports.page.salesOverview')}
      actions={segmentSwitch}
      definition={t('reports.page.salesOverviewDefinition')}
      summary={t('reports.page.salesOverviewSummary', { segment: t(`reports.page.segments.${segment}`) })}
      table={series.map((bucket) => ({
        label: formatBucketLabel(String(bucket.label), language),
        value: formatMoneyLocalized(String(bucket.value), currency, 2),
      }))}
      isEmpty={empty}
      emptyTitle={t('reports.page.salesOverviewEmptyTitle')}
      emptyDescription={t('reports.page.salesOverviewEmptyDescription')}
      focusValues={chartRows.map((row) => ({ label: row.label, value: formatMoneyLocalized(String(row.value), currency, 2) }))}
      focusValuesLabel={t('reports.page.focusValuesLabel')}
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartRows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="label" />
          <YAxis width={56} tickFormatter={(value) => formatCompactValue(String(value), language)} />
          <Tooltip />
          <Legend verticalAlign="bottom" />
          <Line type="monotone" dataKey="value" name={t(`reports.page.segments.${segment}`)} stroke="var(--color-chart-1)" />
          <Line type="monotone" dataKey="trend" name={t('reports.page.salesOverviewTrend')} stroke="var(--color-chart-5)" strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** The segment switch for the sales overview: sales, orders and invoices. */
export function SalesOverviewSegments({
  segment,
  setSegment,
}: {
  segment: Segment;
  setSegment: (segment: Segment) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="reports-segmented" role="tablist" aria-label={t('reports.page.salesOverview')}>
      {SEGMENTS.map((value) => (
        <button
          key={value}
          type="button"
          role="tab"
          aria-selected={segment === value}
          className={['reports-segmented__button', segment === value && 'is-active'].filter(Boolean).join(' ')}
          onClick={() => setSegment(value)}
        >
          {t(`reports.page.segments.${value}`)}
        </button>
      ))}
    </div>
  );
}
