import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '../../components/shell/page-header';
import {
  Badge,
  Button,
  Card,
  DataTable,
  EmptyState,
  ErrorState,
  Select,
  Skeleton,
} from '../../components/ui';
import type { Column } from '../../components/ui';
import { formatMoney } from '../../lib/format';
import type {
  DashboardActivity,
  DashboardPeriod,
  DashboardSummary,
} from '../../services/catalog-service';
import { useDashboard } from './use-dashboard';

const PERIOD_OPTIONS = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
] as const;

const CATEGORIES = ['All categories', 'Sales', 'Orders', 'Inventory', 'Invoices'] as const;

const ACTIVITY_COLUMNS: readonly Column<DashboardActivity>[] = [
  { key: 'time', header: 'Time' },
  { key: 'activity', header: 'Activity' },
  { key: 'category', header: 'Category' },
  { key: 'user', header: 'User' },
  {
    key: 'status',
    header: 'Status',
    render: (row) => <Badge tone={statusTone(row.status)}>{row.status}</Badge>,
  },
];

function statusTone(status: string): 'success' | 'warning' | 'info' | 'neutral' | 'destructive' {
  if (status === 'CANCELLED' || status === 'VOID') return 'destructive';
  if (status === 'CONFIRMED' || status === 'ISSUED') return 'info';
  if (status === 'DRAFT') return 'neutral';
  if (status === 'ACTIVE') return 'warning';
  return 'success';
}

function ChangeChip({ direction, percent }: { direction: 'up' | 'down'; percent: number }) {
  const arrow = direction === 'up' ? '↑' : '↓';

  return (
    <span className={`overview-change overview-change--${direction}`}>
      <span aria-hidden="true">{arrow}</span>
      <span>{percent.toFixed(1)}%</span>
      <span className="sr-only">{direction}</span>
      <span className="overview-change__comparison">vs previous period</span>
    </span>
  );
}

function LoadingOverview() {
  return (
    <div className="overview-page__body" aria-label="Overview loading">
      <div className="overview-page__kpis">
        {['Sales', 'Active Orders', 'Low Stock Items', 'Outstanding Invoices'].map((title) => (
          <Card key={title} title={title} className="overview-kpi">
            <Skeleton label={`Loading ${title}`} />
          </Card>
        ))}
      </div>
      <div className="overview-page__charts">
        {['Top selling products', 'Sales and orders', 'Orders by status'].map((title) => (
          <Card key={title} title={title} className="overview-chart-card">
            <Skeleton label={`Loading ${title}`} />
          </Card>
        ))}
      </div>
      <Card title="Recent activity">
        <Skeleton label="Loading recent activity" />
      </Card>
    </div>
  );
}

function ErrorOverview({
  message,
  requestId,
  retry,
}: {
  message: string;
  requestId?: string;
  retry: () => void;
}) {
  return (
    <Card title="Overview data">
      <ErrorState message={message} requestId={requestId} onRetry={retry} />
    </Card>
  );
}

function MetricCard({
  title,
  value,
  measure,
  direction,
  percent,
  monetary = false,
}: {
  title: string;
  value: string | number;
  measure: string;
  direction: 'up' | 'down';
  percent: number;
  monetary?: boolean;
}) {
  return (
    <Card title={title} className="overview-kpi">
      <div className="overview-kpi__value">
        {monetary ? (
          <>
            <span className="overview-kpi__currency">USD</span> {formatMoney(String(value))}
          </>
        ) : (
          value
        )}
      </div>
      <ChangeChip direction={direction} percent={percent} />
      <p className="overview-kpi__measure">{measure}</p>
    </Card>
  );
}

function ProductChart({ summary }: { summary: DashboardSummary }) {
  const productText = summary.topSellingProducts
    .map(({ product, unitsSold }) => `${product}: ${unitsSold} units`)
    .join('; ');

  return (
    <Card
      title="Top selling products"
      description="Units sold this period"
      className="overview-chart-card"
    >
      <div
        className="overview-chart-frame"
        role="img"
        aria-label={`Top selling products bar chart. ${productText}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={summary.topSellingProducts}
            margin={{ top: 8, right: 8, bottom: 24, left: 0 }}
          >
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="product"
              angle={-24}
              textAnchor="end"
              interval={0}
              tickLine={false}
              axisLine={false}
            />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <Tooltip formatter={(value) => [`${value} units`, 'Units sold']} />
            <Bar dataKey="unitsSold" name="Units sold" radius={[4, 4, 0, 0]}>
              {summary.topSellingProducts.map((item, index) => (
                <Cell key={item.product} fill={`var(--color-chart-${index + 1})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">Product units sold: {productText}.</p>
      <ul className="overview-chart-legend">
        {summary.topSellingProducts.map((item, index) => (
          <li key={item.product}>
            <span
              className="overview-legend-swatch"
              style={{ background: `var(--color-chart-${index + 1})` }}
              aria-hidden="true"
            />
            <span>{item.product}</span>
            <strong>{item.unitsSold}</strong>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TrendChart({ summary }: { summary: DashboardSummary }) {
  const totalOrders = summary.salesOrdersTrend.reduce((total, point) => total + point.orders, 0);
  const trendText = summary.salesOrdersTrend
    .map((point) => `${point.date}: USD ${formatMoney(point.sales)} sales, ${point.orders} orders`)
    .join('; ');

  return (
    <Card
      title="Sales and orders"
      description={`USD ${formatMoney(summary.sales.value)} total sales · ${totalOrders} total orders`}
      className="overview-chart-card"
    >
      <div
        className="overview-chart-frame"
        role="img"
        aria-label={`Sales and orders line chart. ${trendText}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={summary.salesOrdersTrend}
            margin={{ top: 8, right: 8, bottom: 8, left: 0 }}
          >
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis
              yAxisId="sales"
              tickFormatter={(value) => formatMoney(String(value))}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="orders"
              orientation="right"
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              formatter={(value, name) =>
                name === 'Sales' ? [`USD ${formatMoney(String(value))}`, name] : [value, name]
              }
            />
            <Line
              yAxisId="sales"
              type="monotone"
              dataKey="sales"
              name="Sales"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="orders"
              type="monotone"
              dataKey="orders"
              name="Orders"
              stroke="var(--color-chart-2)"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">Sales and orders by date: {trendText}.</p>
      <div className="overview-inline-legend">
        <span>
          <i className="overview-legend-swatch overview-legend-swatch--sales" aria-hidden="true" />
          Sales (USD)
        </span>
        <span>
          <i className="overview-legend-swatch overview-legend-swatch--orders" aria-hidden="true" />
          Orders
        </span>
      </div>
    </Card>
  );
}

function OrdersStatusChart({ summary }: { summary: DashboardSummary }) {
  const total = summary.ordersByStatus.reduce((sum, item) => sum + item.count, 0);
  const statusText = summary.ordersByStatus
    .map(({ status, count }) => `${status}: ${count}`)
    .join('; ');
  const colors: Record<string, string> = {
    DRAFT: 'var(--color-chart-status-draft)',
    CONFIRMED: 'var(--color-chart-status-confirmed)',
    SHIPPED: 'var(--color-chart-status-shipped)',
    CANCELLED: 'var(--color-chart-status-cancelled)',
  };

  return (
    <Card
      title="Orders by status"
      description={`${total} orders in the selected period`}
      className="overview-chart-card"
    >
      <div className="overview-donut-frame">
        <div
          className="overview-chart-frame"
          role="img"
          aria-label={`Orders by status donut chart, ${total} total. ${statusText}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={summary.ordersByStatus}
                dataKey="count"
                nameKey="status"
                innerRadius="62%"
                outerRadius="88%"
                paddingAngle={2}
              >
                {summary.ordersByStatus.map((item) => (
                  <Cell key={item.status} fill={colors[item.status]} />
                ))}
              </Pie>
              <Tooltip formatter={(value, name) => [value, name]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="overview-donut-center" aria-hidden="true">
          <strong>{total}</strong>
          <span>orders</span>
        </div>
      </div>
      <p className="sr-only">
        Orders by status: {statusText}; {total} total.
      </p>
      <ul className="overview-status-legend">
        {summary.ordersByStatus.map(({ status, count }) => (
          <li key={status}>
            <span
              className={`overview-legend-swatch overview-legend-swatch--${status.toLowerCase()}`}
              aria-hidden="true"
            />
            <span>
              <Badge status={status}>{status}</Badge>
            </span>
            <strong>{count}</strong>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function DashboardContent({ summary }: { summary: DashboardSummary }) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All categories');
  const filteredActivity = useMemo(
    () =>
      summary.recentActivity.filter(
        (row) => category === 'All categories' || row.category === category,
      ),
    [summary.recentActivity, category],
  );

  if (summary.empty) {
    return (
      <EmptyState
        title="Your overview is ready when your first activity arrives"
        description="This sample organization has no dashboard activity yet. Sales, orders, stock and invoice figures will appear here when records are available."
      />
    );
  }

  return (
    <div className="overview-page__body">
      <div className="overview-page__kpis">
        <MetricCard
          title="Sales"
          value={summary.sales.value}
          direction={summary.sales.changeDirection}
          percent={summary.sales.changePercent}
          measure={summary.sales.measure}
          monetary
        />
        <MetricCard
          title="Active Orders"
          value={summary.activeOrders.value}
          direction={summary.activeOrders.changeDirection}
          percent={summary.activeOrders.changePercent}
          measure={summary.activeOrders.measure}
        />
        <MetricCard
          title="Low Stock Items"
          value={summary.lowStockItems.value}
          direction={summary.lowStockItems.changeDirection}
          percent={summary.lowStockItems.changePercent}
          measure={summary.lowStockItems.measure}
        />
        <MetricCard
          title="Outstanding Invoices"
          value={summary.outstandingInvoices.value}
          direction={summary.outstandingInvoices.changeDirection}
          percent={summary.outstandingInvoices.changePercent}
          measure={summary.outstandingInvoices.measure}
          monetary
        />
      </div>
      <div className="overview-page__charts">
        <ProductChart summary={summary} />
        <TrendChart summary={summary} />
        <OrdersStatusChart summary={summary} />
      </div>
      <Card
        title="Recent activity"
        description="Latest sample changes across business operations"
        actions={
          <div className="overview-activity-filter">
            <Select
              id="activity-category"
              label="Category"
              options={CATEGORIES.map((value) => ({ value, label: value }))}
              value={category}
              onChange={(event) => setCategory(event.target.value as (typeof CATEGORIES)[number])}
            />
          </div>
        }
      >
        <DataTable
          columns={ACTIVITY_COLUMNS}
          data={filteredActivity}
          total={filteredActivity.length}
          page={1}
          pageSize={20}
          emptyMessage={`No ${category.toLowerCase()} activity in this period.`}
        />
      </Card>
    </div>
  );
}

export function OverviewPage() {
  const [period, setPeriod] = useState<DashboardPeriod>('this-month');
  const { data, isPending, isError, error, refetch } = useDashboard(period);
  const apiFailure =
    error && typeof error === 'object' && 'requestId' in error
      ? (error as Error & { requestId: string })
      : undefined;

  return (
    <section className="overview-page" aria-label="Overview dashboard">
      <PageHeader
        title="Overview"
        secondaryActions={[
          <div className="overview-page__header-controls" key="overview-controls">
            <div className="overview-period-select">
              <Select
                id="overview-period"
                label="Period"
                options={PERIOD_OPTIONS}
                value={period}
                onChange={(event) => setPeriod(event.target.value as DashboardPeriod)}
              />
            </div>
            <div className="overview-sample-marker">
              <span className="sample-marker">Sample data</span>
              <span>Figures are illustrative, not live</span>
            </div>
          </div>,
        ]}
        primaryAction={
          <Button variant="primary" disabled reason="Arrives with Sales Orders">
            New Sales Order
          </Button>
        }
      />
      {isPending ? (
        <LoadingOverview />
      ) : isError || data === undefined ? (
        <ErrorOverview
          message={
            error instanceof Error ? error.message : 'The dashboard summary could not be loaded.'
          }
          requestId={apiFailure?.requestId}
          retry={() => void refetch()}
        />
      ) : (
        <DashboardContent summary={data} />
      )}
    </section>
  );
}
