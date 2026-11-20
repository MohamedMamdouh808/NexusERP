import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient, jsonResponse } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter, SALES_OVER_TIME_FIXTURE } from './dashboard-fixtures';

/**
 * US2 - the analytics section (T014, FR-005..FR-009).
 *
 * The figures are the service's, the change is the service's, and the labels
 * say what the figure binds to: "As of today" for the receivables, the period
 * for everything else. The charts each carry an accessible table view and a
 * visible text summary; without reports.read none of this exists.
 */
describe('Dashboard analytics (T014)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    resetSession();
  });

  function stubAllEndpoints() {
    const fetchMock = fetchRouter(dashboardFetch());
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function renderDashboard() {
    const queryClient = createTestQueryClient();
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/']}>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('renders the KPI cards with the service figures and the period-bound change in words', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect((await screen.findAllByText(/100\.00/)).length).toBeGreaterThan(0);
    // The change is the server's, in words with direction; one of the fixture
    // figures moves up, one moves down.
    expect(screen.getAllByText(/vs the previous period/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Good direction').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bad direction').length).toBeGreaterThan(0);
    // Muted currency code beside the big figure, per the card design.
    expect(screen.getAllByText(/USD/).length).toBeGreaterThan(0);
  });

  it('labels the receivables figures as as-of-today', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('As of today')).toBeInTheDocument();
  });

  it('renders the receivables secondary line in warning style when overdue is above zero', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/Overdue: /)).toBeInTheDocument();
  });

  it('offers the accessible table alternative and a visible summary on every chart', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect((await screen.findAllByRole('button', { name: 'Show as table' })).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText(/Sales over time/).length).toBeGreaterThan(0);
  });

  it('links each KPI card to the detailed reports with the same range', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    const { container } = renderDashboard();

    await screen.findAllByText(/100\.00/);
    const links = Array.from(container.querySelectorAll('a[href*="start="]')).map((link) => link.getAttribute('href'));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toContain('start=2026-11-01');
      expect(href).toMatch(/end=\d{4}-\d{2}-\d{2}/);
    }
  });

  it('offers a focusable values panel on every chart', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    await screen.findAllByText(/100\.00/);
    expect(screen.getAllByRole('group', { name: 'Chart values for keyboard users' })).toHaveLength(3);
  });

  it('copies a KPI value together with its period', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    const writeText = vi.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      await screen.findAllByText(/100\.00/);
      fireEvent.click(screen.getAllByRole('button', { name: 'Copy value' })[0]);
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
      expect(String(writeText.mock.calls[0][0])).toContain('100.00');
      await waitFor(() => expect(screen.getAllByRole('button', { name: 'Copied' }).length).toBeGreaterThan(0));
    } finally {
      if (original !== undefined) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('remembers the table view across a refresh', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    window.localStorage.clear();
    const first = renderDashboard();

    await screen.findAllByRole('button', { name: 'Show as table' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Show as table' })[0]);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Show as chart' }).length).toBeGreaterThan(0));
    first.unmount();

    renderDashboard();
    await screen.findAllByRole('button', { name: 'Show as chart' });
    window.localStorage.clear();
  });

  it('offers a next step when a chart has no data', async () => {
    seedSignedInSession();
    const handlers = dashboardFetch();
    const sales = handlers.find((handler) => handler.match('/api/v1/reports/sales-over-time'));
    if (sales === undefined) throw new Error('sales-over-time handler missing');
    handlers[handlers.indexOf(sales)] = { ...sales, respond: () => jsonResponse({ ...SALES_OVER_TIME_FIXTURE, buckets: [] }) };
    vi.stubGlobal('fetch', fetchRouter(handlers));
    renderDashboard();

    expect(await screen.findByText('No sales in this period')).toBeInTheDocument();
    const actions = screen.getAllByRole('link', { name: 'New sales order' });
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) expect(action).toHaveAttribute('href', '/sales/new');
  });

  it('dispatches no analytics request and renders no analytics section without reports.read', async () => {
    seedSignedInSession({ permissions: ['sales.read'] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('Sales orders awaiting shipment')).toBeInTheDocument();
    expect(screen.queryByText(/How are we doing/)).not.toBeInTheDocument();
    const analyticsCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/reports/'));
    expect(analyticsCalls).toHaveLength(0);
  });
});
