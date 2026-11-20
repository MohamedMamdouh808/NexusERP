import { Fragment, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
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
import { Button, Card, DropdownMenu, Icon } from '../../components/ui';
import type { IconName } from '../../components/ui';
import type { ReactNode } from 'react';
import { formatMoneyLocalized } from '../../lib/i18n-format';
import { hasPermission, useSession } from '../../services/auth-session';
import { isModuleEnabled } from '../../components/shell/module-availability';
import type { AuditEntryPage } from '../../services/audit-client';
import type { ReconciliationResponse } from '../../services/reports-client';
import { ACTIVITY_ICONS, ACTIVITY_LABELS, ACTIVITY_RECORD_LINKS } from './activity-labels';
import { ChartFrame } from '../reports/chart-frame';
import { AttentionSection, type AttentionSectionItem } from './attention-item';
import { DashboardKpiCard, type DashboardKpi } from './dashboard-kpi-card';
import { DashboardWidget, failureOf } from './dashboard-widgets';
import { monthKey, recentMonthKeys, useDashboardWidgets } from './use-dashboard';

/**
 * The dashboard.
 *
 * Every figure comes from the real backend through the existing endpoints;
 * nothing here is sample data. Each widget loads and fails on its own, and a
 * widget the member may not see is never requested at all.
 */

const SALES_ORDER_STATUS_COLOURS: Record<string, string> = {
  DRAFT: 'var(--color-chart-status-draft)',
  CONFIRMED: 'var(--color-chart-status-confirmed)',
  SHIPPED: 'var(--color-chart-status-shipped)',
  CANCELLED: 'var(--color-chart-status-cancelled)',
};

const AGING_COLOURS = [
  'var(--color-chart-1)',
  'var(--color-chart-2)',
  'var(--color-chart-3)',
  'var(--color-chart-4)',
  'var(--color-chart-5)',
];

/** The icon each KPI card starts with. */
const KPI_ICONS: Record<string, IconName> = {
  salesTotal: 'sales',
  purchasesTotal: 'purchasing',
  paymentsReceived: 'invoicing',
  outstanding: 'invoicing',
  invoiceCount: 'invoicing',
  lowStockProductCount: 'inventory',
  outOfStockProductCount: 'inventory',
  purchaseOrderCount: 'purchasing',
  purchaseOrderCreatedCount: 'purchasing',
  salesOrderCount: 'sales',
};

/** The one-line definition every KPI card shows. */
const KPI_DEFINITIONS: Record<string, string> = {
  salesTotal: 'dashboard.kpi.definitions.salesTotal',
  purchasesTotal: 'dashboard.kpi.definitions.purchasesTotal',
  paymentsReceived: 'dashboard.kpi.definitions.paymentsReceived',
  invoiceCount: 'dashboard.kpi.definitions.invoiceCount',
  purchaseOrderCount: 'dashboard.kpi.definitions.purchaseOrderCount',
  purchaseOrderCreatedCount: 'dashboard.kpi.definitions.purchaseOrderCreatedCount',
  salesOrderCount: 'dashboard.kpi.definitions.salesOrderCount',
  lowStockProductCount: 'dashboard.kpi.definitions.lowStockProductCount',
  outOfStockProductCount: 'dashboard.kpi.definitions.outOfStockProductCount',
  outstanding: 'dashboard.kpi.definitions.outstanding',
  outstandingInvoiceCount: 'dashboard.kpi.definitions.outstandingInvoiceCount',
  overdue: 'dashboard.kpi.definitions.overdue',
  overdueInvoiceCount: 'dashboard.kpi.definitions.overdueInvoiceCount',
};

/** At most this many buckets the sales chart keeps: the axes read better with few. */
const MAX_CHART_TICKS = 6;

/** Shape of the over-time responses the page reads. */
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

/** The greeting matches the part of the day the member is actually working in. */
export function greetingKey(hour: number): 'greetingMorning' | 'greetingAfternoon' | 'greetingEvening' {
  if (hour >= 5 && hour < 12) return 'greetingMorning';
  if (hour >= 12 && hour < 17) return 'greetingAfternoon';
  return 'greetingEvening';
}

/** A centred three-point moving average, drawn as the trend of a noisy series. */
function movingAverages(values: readonly string[]): number[] {
  const numbers = values.map(Number);
  return numbers.map((_, index) => {
    const window = numbers.slice(Math.max(0, index - 1), Math.min(numbers.length, index + 2));
    return window.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0) / window.length;
  });
}

/** Which day an activity entry belongs to, relative to today. */
function activityDay(stamp: string, now: Date = new Date()): 'today' | 'yesterday' | 'older' {
  const date = new Date(stamp);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date >= today) return 'today';
  if (date >= yesterday) return 'yesterday';
  return 'older';
}

export function OverviewPage(): ReactNode {
  const { t, i18n } = useTranslation();
  const language = i18n.language;
  // The chosen month lives in the URL, so a period is shareable and the back
  // button steps through the periods the member has looked at.
  const [searchParams, setSearchParams] = useSearchParams();
  const currentMonth = monthKey();
  const monthChoices = recentMonthKeys(12);
  const requestedMonth = searchParams.get('month');
  const selectedMonth = requestedMonth !== null && monthChoices.includes(requestedMonth) ? requestedMonth : currentMonth;
  const widgets = useDashboardWidgets(selectedMonth);
  const queryClient = useQueryClient();
  const [refreshedAt, setRefreshedAt] = useState<string | null>(() => new Date().toISOString());

  function selectMonth(key: string): void {
    const next = new URLSearchParams(searchParams);
    if (key === currentMonth) next.delete('month');
    else next.set('month', key);
    setSearchParams(next);
  }

  function refresh(): void {
    setRefreshedAt(new Date().toISOString());
    void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  }

  // Keep the page current while it is open, but never work in a background tab.
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 60_000);
    return () => window.clearInterval(interval);
  }, [queryClient]);

  const {
    kpis,
    salesOverTime,
    documentsByStatus,
    receivablesAging,
    overdueInvoices,
    confirmedSalesOrders,
    purchaseOrdersAwaitingReceipt,
    lowStockProducts,
    reconciliation,
    recentActivity,
    checklist,
    permissions,
  } = widgets;

  if (!widgets.hasAnyWidget) {
    return (
      <section className="overview-page" aria-label={t('dashboard.sectionAria')}>
        <Card title={t('dashboard.noWidgetsTitle')} className="overview-welcome">
          <p className="overview-welcome__greeting">{t(`dashboard.${greetingKey(new Date().getHours())}`, { name: widgets.memberName })}</p>
          <p className="overview-welcome__org">
            {t('dashboard.organization')}: {widgets.organizationName}
          </p>
          <p>{t('dashboard.noWidgetsDescription')}</p>
        </Card>
      </section>
    );
  }

  const kpiList: readonly DashboardKpi[] = kpis.data?.kpis ?? [];
  const findKpi = (key: string): DashboardKpi | undefined => kpiList.find((kpi) => kpi.key === key);
  const overdue = findKpi('overdue');

  // The period picker drives the range the range-bound widgets query. The
  // current month keeps its short "This month" name; older months are named in
  // full so the choice is unambiguous.
  const monthLabel = (key: string): string =>
    key === currentMonth
      ? t('dashboard.periodLabel')
      : new Intl.DateTimeFormat(language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`));
  const periodLabel = monthLabel(selectedMonth);
  const updatedTime = new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(new Date(refreshedAt ?? Date.now()));

  const currency = widgets.currency;
  const salesBuckets = salesOverTime.data?.buckets ?? [];
  const salesSeries = seriesTicks(salesBuckets, MAX_CHART_TICKS);
  const salesEmpty = allZero(salesSeries);
  const salesTrend = movingAverages(salesSeries.map((entry) => entry.value));
  const salesChartRows = salesSeries.map((bucket, index) => ({
    label: formatBucketLabel(String(bucket.label), language),
    value: bucket.value,
    trend: salesTrend[index],
  }));

  const soGroups = documentsByStatus.data?.salesOrders ?? {};
  const soEntries = Object.entries(soGroups).map(([status, group]) => ({
    status,
    count: group.count,
    total: group.totalAmount,
  }));
  const soRows = soEntries.map((entry) => ({
    label: entry.status,
    value: `${entry.count} — ${formatMoneyLocalized(String(entry.total), currency, 2)}`,
  }));
  const documentsEmpty = soEntries.every((entry) => entry.count === 0);

  const aging = receivablesAging.data?.aging;
  const agingEntries = aging
    ? [
        { key: 'current', label: t('dashboard.aging.current'), count: aging.current.count, balance: aging.current.balance },
        { key: 'd1_30', label: t('dashboard.aging.d1_30'), count: aging.d1_30.count, balance: aging.d1_30.balance },
        { key: 'd31_60', label: t('dashboard.aging.d31_60'), count: aging.d31_60.count, balance: aging.d31_60.balance },
        { key: 'd61_90', label: t('dashboard.aging.d61_90'), count: aging.d61_90.count, balance: aging.d61_90.balance },
        { key: 'over90', label: t('dashboard.aging.over90'), count: aging.over90.count, balance: aging.over90.balance },
      ]
    : [];
  const agingTotal = agingEntries.reduce((total, entry) => total + entry.count, 0);
  const agingEmpty = agingEntries.length > 0 && agingTotal === 0;
  const agingRows = agingEntries.map((entry) => ({
    label: entry.label,
    value: `${entry.count} — ${formatMoneyLocalized(String(entry.balance), currency, 2)}`,
  }));

  const range = widgets.range;
  const reportsRange = `start=${range.start}&end=${range.end}`;

  const kpiCard = (key: string): DashboardKpi => {
    const found = findKpi(key);
    if (found !== undefined) return found;
    return { key, label: key, value: '0.00', unit: 'money' };
  };

  const attentionItems = (): AttentionSectionItem[] => [
    {
      key: 'overdueInvoices',
      icon: 'invoicing',
      title: t('dashboard.attention.overdueInvoices'),
      count: overdueInvoices.data?.total ?? 0,
      balance: overdueInvoices.data?.overdue ?? undefined,
      to: '/invoicing?overdue=1',
      viewAllLabel: t('dashboard.attention.overdueInvoicesViewAll'),
      emptyLabel: t('dashboard.attention.overdueInvoicesEmpty'),
      enabled: permissions.invoices,
      rows: (overdueInvoices.data?.items ?? []).slice(0, 5).map((invoice) => ({
        key: invoice.id,
        label: invoice.number ?? invoice.id,
        to: `/invoicing/${invoice.id}`,
        detail: formatMoneyLocalized(String(invoice.balance), currency, 2),
        preview: t('dashboard.attention.dueOn', { date: invoice.dueDate }),
      })),
    },
    {
      key: 'confirmedSalesOrders',
      icon: 'sales',
      title: t('dashboard.attention.confirmedSalesOrders'),
      count: confirmedSalesOrders.data?.total ?? 0,
      to: '/sales',
      viewAllLabel: t('dashboard.attention.confirmedSalesOrdersViewAll'),
      emptyLabel: t('dashboard.attention.confirmedSalesOrdersEmpty'),
      enabled: permissions.sales,
      rows: (confirmedSalesOrders.data?.items ?? []).slice(0, 5).map((order) => ({
        key: order.id,
        label: order.number,
        to: `/sales/${order.id}`,
        detail: order.customerName,
        preview: t('dashboard.attention.orderedOn', { date: order.orderDate }),
      })),
    },
    {
      key: 'purchaseOrdersAwaitingReceipt',
      icon: 'purchasing',
      title: t('dashboard.attention.purchaseOrdersAwaitingReceipt'),
      count: purchaseOrdersAwaitingReceipt.data?.total ?? 0,
      to: '/purchasing',
      viewAllLabel: t('dashboard.attention.purchaseOrdersAwaitingReceiptViewAll'),
      emptyLabel: t('dashboard.attention.purchaseOrdersAwaitingReceiptEmpty'),
      enabled: permissions.purchasing,
      rows: (purchaseOrdersAwaitingReceipt.data?.items ?? []).slice(0, 5).map((order) => ({
        key: order.id,
        label: order.number,
        to: `/purchasing/${order.id}`,
        detail: order.supplierName,
        preview: t('dashboard.attention.orderedOn', { date: order.orderDate }),
      })),
    },
    {
      key: 'lowStock',
      icon: 'inventory',
      title: t('dashboard.attention.lowStock'),
      count: lowStockProducts.data?.total ?? 0,
      to: '/inventory?lowStock=1',
      viewAllLabel: t('dashboard.attention.lowStockViewAll'),
      emptyLabel: t('dashboard.attention.lowStockEmpty'),
      enabled: permissions.inventory,
      rows: (lowStockProducts.data?.items ?? []).slice(0, 5).map((row) => ({
        key: row.productId,
        label: `${row.sku} — ${row.productName}`,
        to: `/products/${row.productId}`,
        detail: `${t('dashboard.attention.available')} ${row.available}`,
        preview: row.warehouseName ?? undefined,
      })),
    },
  ];

  return (
    <section className="overview-page" aria-label={t('dashboard.sectionAria')}>
      <PageHeader
        title={t('shell.sidebar.entries.Overview')}
        description={t(`dashboard.${greetingKey(new Date().getHours())}`, { name: widgets.memberName })}
        primaryAction={
          <>
            <span className="overview-page__updated" title={t('dashboard.autoRefresh')}>{t('dashboard.lastUpdated', { time: updatedTime })}</span>
            <Button variant="secondary" onClick={refresh}>
              {t('dashboard.refresh')}
            </Button>
          </>
        }
      />
      <div className="overview-page__meta">
        <span className="overview-page__meta-chip">{t('dashboard.organization')} — {widgets.organizationName}</span>
        <DropdownMenu
          className="overview-page__period"
          label={t('dashboard.periodPickerLabel')}
          trigger={
            <>
              <span>{periodLabel}</span>
              <Icon name="chevronDown" />
            </>
          }
          entries={monthChoices.map((key) => ({
            kind: 'item' as const,
            id: key,
            label: monthLabel(key),
            selected: key === selectedMonth,
            onSelect: () => selectMonth(key),
          }))}
        />
      </div>
      <p className="overview-page__info">{t('dashboard.infoLine')}</p>

      {permissions.reports && (
        <section className="overview-page__analytics" aria-label={t('dashboard.analyticsTitle')}>
          <h2 className="overview-page__section-title">
            {t('dashboard.section.withCount', { title: t('dashboard.analyticsTitle'), count: kpiList.length })}
          </h2>
          <div className="overview-page__kpis">
            {[
              kpiCard('salesTotal'),
              kpiCard('purchasesTotal'),
              kpiCard('paymentsReceived'),
              kpiCard('outstanding'),
              kpiCard('invoiceCount'),
              kpiCard('salesOrderCount'),
              kpiCard('purchaseOrderCount'),
              kpiCard('lowStockProductCount'),
            ].map((kpi) => (
              <DashboardKpiCard
                key={kpi.key}
                kpi={kpi}
                currency={currency}
                icon={KPI_ICONS[kpi.key] ?? 'reports'}
                lowerIsBetter={kpi.key === 'outstanding' || kpi.key === 'overdue' || kpi.key === 'lowStockProductCount'}
                to={kpi.key === 'outstanding' ? `/reports/outstanding-invoices?${reportsRange}` : `/reports?${reportsRange}`}
                periodLabel={periodLabel}
                definition={t(KPI_DEFINITIONS[kpi.key] ?? KPI_DEFINITIONS.salesTotal)}
                secondary={kpi.key === 'outstanding' ? { label: t('dashboard.kpi.overdueLabel'), value: overdue?.value ?? '0.00' } : undefined}
              />
            ))}
          </div>
        </section>
      )}

      <div className="overview-page__charts">
        <ChartFrame
          title={t('dashboard.charts.salesOverTime')}
          definition={t('dashboard.charts.salesOverTimeDefinition')}
          summary={t('dashboard.charts.salesOverTime')}
          table={salesBuckets.map((bucket) => ({ label: formatBucketLabel(String(bucket.label), language), value: formatMoneyLocalized(String(bucket.value), currency, 2) }))}
          isEmpty={salesEmpty}
          emptyTitle={t('dashboard.charts.salesOverTimeEmpty')}
          emptyDescription={t('dashboard.charts.salesOverTimeEmptyDescription')}
          emptyAction={permissions.sales ? { label: t('dashboard.quickActions.newSalesOrder'), to: '/sales/new' } : undefined}
          focusValues={salesChartRows.map((row) => ({ label: row.label, value: formatMoneyLocalized(String(row.value), currency, 2) }))}
          focusValuesLabel={t('dashboard.charts.focusValuesLabel')}
        >
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={salesChartRows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis width={56} tickFormatter={(value) => formatCompactValue(String(value), language)} />
              <Tooltip />
              <Legend verticalAlign="bottom" />
              <Line type="monotone" dataKey="trend" name={t('dashboard.charts.salesOverTimeTrend')} stroke="var(--color-chart-5)" strokeDasharray="4 4" dot={false} />
              <Line type="monotone" dataKey="value" name={t('dashboard.charts.salesOverTime')} stroke="var(--color-chart-1)" />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title={t('dashboard.charts.documentsByStatus')}
          definition={t('dashboard.charts.documentsByStatusDefinition')}
          summary={t('dashboard.charts.documentsByStatus')}
          table={soRows}
          isEmpty={documentsEmpty}
          emptyTitle={t('dashboard.charts.documentsByStatusEmpty')}
          emptyDescription={t('dashboard.charts.documentsByStatusEmptyDescription')}
          emptyAction={permissions.sales ? { label: t('dashboard.quickActions.newSalesOrder'), to: '/sales/new' } : undefined}
          focusValues={soRows}
          focusValuesLabel={t('dashboard.charts.focusValuesLabel')}
        >
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={soEntries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis width={40} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {soEntries.map((entry) => (
                  <Cell key={entry.status} fill={SALES_ORDER_STATUS_COLOURS[entry.status] ?? 'var(--color-chart-5)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title={t('dashboard.charts.receivablesAging')}
          definition={t('dashboard.charts.receivablesAgingDefinition')}
          summary={t('dashboard.charts.receivablesAgingDefinition')}
          table={agingRows}
          isEmpty={agingEmpty}
          emptyTitle={t('dashboard.charts.receivablesAgingEmpty')}
          emptyDescription={t('dashboard.charts.receivablesAgingEmptyDescription')}
          emptyAction={permissions.invoices ? { label: t('dashboard.charts.receivablesAgingEmptyAction'), to: '/invoicing' } : undefined}
          focusValues={agingRows}
          focusValuesLabel={t('dashboard.charts.focusValuesLabel')}
        >
          <div className="overview-page__aging">
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={agingEntries} dataKey="count" nameKey="label" outerRadius={90}>
                  {agingEntries.map((entry, index) => (
                    <Cell key={entry.key} fill={AGING_COLOURS[index % AGING_COLOURS.length]} />
                  ))}
                </Pie>
                <Legend layout="vertical" align="right" />
              </PieChart>
            </ResponsiveContainer>
            <ul className="overview-page__aging-rows">
              {agingEntries.map((entry) => (
                <li key={entry.key} className="overview-page__aging-row">
                  <span className="overview-page__aging-row-label">{entry.label}</span>
                  <span className="overview-page__aging-row-values">
                    <span className="dashboard-kpi__count">{entry.count}</span>
                    <span className="mono">{formatMoneyLocalized(String(entry.balance), currency, 2)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </ChartFrame>
      </div>

      {(permissions.invoices || permissions.sales || permissions.purchasing || permissions.inventory || permissions.reports) && (
        <div className="overview-page__focus">
          <h2 className="overview-page__section-title">{t('dashboard.group.focus')}</h2>
          <AttentionSection ariaLabel={t('dashboard.attentionTitle')} title={t('dashboard.attentionTitle')} items={attentionItems()} />
          <ReconciliationCard query={reconciliation} visible={permissions.reports} />
          <QuickActions />
        </div>
      )}

      {(permissions.audit || permissions.products || permissions.contacts || permissions.inventory) && (
        <div className="overview-page__context">
          <h2 className="overview-page__section-title">{t('dashboard.group.context')}</h2>
          <RecentActivity enabled={permissions.audit} query={recentActivity} />
          <FirstUseChecklist products={checklist.products} contacts={checklist.contacts} stock={checklist.stock} />
        </div>
      )}
    </section>
  );
}

/** The stock reconciliation card: quiet when clean, muted when there are discrepancies. */
function ReconciliationCard({ query, visible }: { query: UseQueryResult<ReconciliationResponse, Error>; visible: boolean }): ReactNode {
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <DashboardWidget
      className="overview-page__reconciliation"
      title={t('dashboard.attention.reconciliation')}
      isPending={query.isPending}
      isError={query.isError}
      errorMessage={failureOf(query.error).message}
      onRetry={() => void query.refetch()}
      asOf={query.data?.checkedAt}
    >
      {query.data && query.data.items.length === 0 ? (
        <p className="overview-page__reconciliation-empty">{t('dashboard.attention.reconciliationClean')}</p>
      ) : (
        <ul className="overview-page__reconciliation-rows">
          {(query.data?.items ?? []).map((row) => (
            <li key={`${row.productId}-${row.warehouseId}`} className="overview-page__reconciliation-row">
              <span className="overview-page__reconciliation-row-text">{row.productName} — {row.warehouseName}</span>
              <span className="overview-page__reconciliation-row-detail">{row.kinds.join(', ')}</span>
            </li>
          ))}
        </ul>
      )}
      <Link className="overview-page__reconciliation-view-all" to="/reports/stock-reconciliation">
        {t('dashboard.attention.reconciliationViewAll')}
      </Link>
    </DashboardWidget>
  );
}

/** The quick actions card: the app's writing surface, permission-gated. */
function QuickActions(): ReactNode {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();

  const actions = [
    { key: 'sales', label: t('dashboard.quickActions.newSalesOrder'), to: '/sales/new', permission: 'sales.write', module: 'sales', variant: 'primary' as const, icon: 'sales' as const },
    { key: 'purchasing', label: t('dashboard.quickActions.newPurchaseOrder'), to: '/purchasing/new', permission: 'purchasing.write', module: 'purchasing', variant: 'secondary' as const, icon: 'purchasing' as const },
    { key: 'products', label: t('dashboard.quickActions.newProduct'), to: '/products/new', permission: 'products.write', module: 'products', variant: 'secondary' as const, icon: 'products' as const },
    { key: 'contacts', label: t('dashboard.quickActions.newContact'), to: '/contacts/new', permission: 'contacts.write', module: 'contacts', variant: 'secondary' as const, icon: 'contacts' as const },
    { key: 'payments', label: t('dashboard.quickActions.recordPayment'), to: '/invoicing/payments/new', permission: 'payments.record', module: 'invoicing', variant: 'secondary' as const, icon: 'invoicing' as const },
    { key: 'inventory', label: t('dashboard.quickActions.adjustStock'), to: '/inventory', permission: 'inventory.adjust', module: 'inventory', variant: 'secondary' as const, icon: 'inventory' as const },
  ].filter((action) => hasPermission(session, action.permission) && isModuleEnabled(session, action.module));

  if (actions.length === 0) return null;
  return (
    <Card className="overview-page__quick-actions" aria-label={t('dashboard.quickActionsTitle')}>
      <h2 className="overview-page__section-title">{t('dashboard.quickActionsTitle')}</h2>
      <div className="overview-page__quick-actions-grid">
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.variant}
            className="overview-page__quick-action"
            onClick={() => navigate(action.to)}
          >
            <Icon name={action.icon} />
            <span>{action.label}</span>
          </Button>
        ))}
      </div>
    </Card>
  );
}

/** The recent activity card: readable sentences, links to the records. */
function RecentActivity({
  enabled,
  query,
}: {
  enabled: boolean;
  query: UseQueryResult<AuditEntryPage | null, Error>;
}): ReactNode {
  const { t, i18n } = useTranslation();
  const entries = query.data?.entries ?? [];
  if (!enabled || entries.length === 0) return null;

  const time = (stamp: string): string =>
    new Intl.DateTimeFormat(i18n.language, { hour: 'numeric', minute: '2-digit' }).format(new Date(stamp));

  const groups = [
    { key: 'today', label: t('dashboard.activity.today') },
    { key: 'yesterday', label: t('dashboard.activity.yesterday') },
    { key: 'older', label: t('dashboard.activity.older') },
  ]
    .map((group) => ({ ...group, entries: entries.filter((entry) => activityDay(entry.createdAt) === group.key) }))
    .filter((group) => group.entries.length > 0);

  const row = (entry: (typeof entries)[number]): ReactNode => {
    const icon = ACTIVITY_ICONS[entry.recordType] ?? 'health';
    const labelKey = ACTIVITY_LABELS[entry.action];
    const link = entry.recordId !== null ? ACTIVITY_RECORD_LINKS[entry.recordType]?.(entry.recordId) : undefined;
    return (
      <li key={entry.id} className="overview-page__activity-item">
        <span className={`overview-page__activity-icon dashboard-activity-icon--${icon}`} aria-hidden="true">
          <Icon name={icon} />
        </span>
        <span className="overview-page__activity-body">
          <span className="overview-page__activity-sentence">{t(labelKey ?? entry.action)}</span>
          {link !== undefined && <Link className="overview-page__activity-record" to={link}>{entry.recordId}</Link>}
        </span>
        <span className="overview-page__activity-time">{time(entry.createdAt)}</span>
      </li>
    );
  };

  return (
    <Card className="overview-page__activity" title={t('dashboard.activityTitle')} aria-label={t('dashboard.activityTitle')}>
      <ul className="overview-page__activity-list">
        {groups.map((group) => (
          <Fragment key={group.key}>
            <li className="overview-page__activity-divider">{group.label}</li>
            {group.entries.map(row)}
          </Fragment>
        ))}
      </ul>
    </Card>
  );
}

/** The first-use checklist card: progress bar, step rows, muted completed steps. */
function FirstUseChecklist({
  products,
  contacts,
  stock,
}: {
  products: UseQueryResult<number | null, Error>;
  contacts: UseQueryResult<number | null, Error>;
  stock: UseQueryResult<number | null, Error>;
}): ReactNode {
  const { t } = useTranslation();
  type ChecklistStep = { key: string; label: string; reason: string; to: string; count?: number | null };
  const dataSteps: ChecklistStep[] = [
    { key: 'product', label: t('dashboard.checklist.addProduct'), reason: t('dashboard.checklist.addProductReason'), to: '/products/new', count: products.data },
    { key: 'customer', label: t('dashboard.checklist.addCustomer'), reason: t('dashboard.checklist.addCustomerReason'), to: '/contacts/new', count: contacts.data },
    { key: 'stock', label: t('dashboard.checklist.addStock'), reason: t('dashboard.checklist.addStockReason'), to: '/inventory', count: stock.data },
  ].filter((step) => step.count !== undefined);
  // The steps the data cannot tick (and so always stay pending): the flows begin with them.
  const flowSteps: ChecklistStep[] = [
    { key: 'purchase-order', label: t('dashboard.checklist.createPurchaseOrder'), reason: t('dashboard.checklist.createPurchaseOrderReason'), to: '/purchasing/new' },
    { key: 'sales-order', label: t('dashboard.checklist.createSalesOrder'), reason: t('dashboard.checklist.createSalesOrderReason'), to: '/sales/new' },
  ];

  if (dataSteps.length === 0) return null;
  const remaining = dataSteps.filter((step) => (step.count ?? 0) === 0);
  if (remaining.length === 0) return null;
  const done = dataSteps.length - remaining.length;
  const progressPercent = Math.round((done / dataSteps.length) * 100);
  const steps = [...dataSteps, ...flowSteps];

  return (
    <Card className="overview-page__checklist" title={t('dashboard.checklistTitle')} aria-label={t('dashboard.checklistTitle')}>
      <div className="overview-page__checklist-head">
        <span className="overview-page__checklist-progress">{t('dashboard.checklist.progress', { done, total: dataSteps.length })}</span>
        <span className="overview-page__checklist-bar" aria-hidden="true">
          <span className="overview-page__checklist-bar-fill" style={{ width: `${progressPercent}%` }} />
        </span>
      </div>
      <ul className="overview-page__checklist-list">
        {steps.map((step) => {
          const complete = dataSteps.includes(step) && (step.count ?? 0) > 0;
          return (
            <li key={step.key} className={`overview-page__checklist-step${complete ? ' is-complete' : ''}`}>
              <span className="overview-page__checklist-mark" aria-hidden="true">{complete ? <Icon name="check" /> : '○'}</span>
              <span className="overview-page__checklist-body">
                <span className="overview-page__checklist-title">
                  <Link to={step.to}>{step.label}</Link>
                </span>
                <span className="overview-page__checklist-reason">{step.reason}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
