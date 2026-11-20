/**
 * Reports data wiring (Feature 019 follow-up): the /reports page, its KPIs,
 * its charts and its tables are fed by the backend reports endpoints. These
 * tests prove each card renders the server's figures, and nothing invents
 * data when the response is empty.
 */
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getSalesOverTime, getTopProducts } from '../../../services/reports-client';
import { renderWithProviders } from '../../../test/render';
import { KpiCard } from '../kpi-card';
import { TopProductsTable } from '../top-products-table';
import { SalesOverviewCard } from '../sales-overview-card';

vi.mock('../../../services/reports-client', () => ({
  getSalesOverTime: vi.fn(),
  getPurchasesOverTime: vi.fn(),
  getPaymentsReceivedOverTime: vi.fn(),
  getTopProducts: vi.fn(),
}));

const RANGE = { start: '2026-11-01', end: '2026-11-20', preset: 'custom' as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KpiCard (reports wiring)', () => {
  it('renders the server figure with its currency code', () => {
    renderWithProviders(<KpiCard title="Total sales" data={{ value: '1234.56', unit: 'money' }} loading={false} />);
    expect(screen.getByText(/1,?234\.56/)).toBeTruthy();
    expect(screen.getByText(/USD/)).toBeTruthy();
  });

  it('keeps the honest empty state when there is no figure', () => {
    renderWithProviders(<KpiCard title="Total sales" data={null} loading={false} />);
    expect(screen.getByText(/No data available/)).toBeTruthy();
  });
});

describe('TopProductsTable (reports wiring)', () => {
  it('renders the server rows with units sold and revenue', async () => {
    vi.mocked(getTopProducts).mockResolvedValue({
      filters: { start: RANGE.start, end: RANGE.end },
      asOf: new Date().toISOString(),
      rows: [
        { productId: 'p1', productName: 'Widget', sku: 'W-1', revenue: '42.00', quantity: '2', unit: 'ea' },
      ],
    });

    renderWithProviders(<TopProductsTable range={RANGE} />);

    await waitFor(() => expect(screen.getByText('Widget')).toBeTruthy());
    expect(screen.getByText(/42\.00/)).toBeTruthy();
  });

  it('shows the empty state when the server has no rows', async () => {
    vi.mocked(getTopProducts).mockResolvedValue({
      filters: { start: RANGE.start, end: RANGE.end },
      asOf: new Date().toISOString(),
      rows: [],
    });

    renderWithProviders(<TopProductsTable range={RANGE} />);

    await waitFor(() => expect(screen.getByText(/No product sales yet/)).toBeTruthy());
  });
});

describe('SalesOverviewCard (reports wiring)', () => {
  it('renders the over-time chart from the sales stream', async () => {
    vi.mocked(getSalesOverTime).mockResolvedValue({
      filters: { start: RANGE.start, end: RANGE.end },
      asOf: new Date().toISOString(),
      granularity: 'day',
      buckets: [{ label: '2026-11-19', value: '100.00', count: 1 }],
    });

    const { container } = renderWithProviders(<SalesOverviewCard range={RANGE} />);

    await waitFor(() => expect(container.querySelector('.chart-frame__canvas')).toBeTruthy());
    expect(screen.getAllByRole('tab').length).toBe(3);
  });

  it('shows the empty state when the series is all zero', async () => {
    vi.mocked(getSalesOverTime).mockResolvedValue({
      filters: { start: RANGE.start, end: RANGE.end },
      asOf: new Date().toISOString(),
      granularity: 'day',
      buckets: [{ label: '2026-11-19', value: '0.00', count: 0 }],
    });

    renderWithProviders(<SalesOverviewCard range={RANGE} />);

    await waitFor(() => expect(screen.getByText(/No sales data yet/)).toBeTruthy());
  });
});
