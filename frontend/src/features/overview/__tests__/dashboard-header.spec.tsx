import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter } from './dashboard-fixtures';

/**
 * US1 - the dashboard header (T010, FR-001..FR-004).
 *
 * The greeting names the member the way the service knows them; the
 * organization and the period travel with it as muted chips; Refresh
 * re-requests every visible widget through the same queries, so nothing goes
 * stale silently.
 */
describe('Dashboard header (T010)', () => {
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

  it('greets the member by their membership name', async () => {
    seedSignedInSession({ membershipName: 'Nora Eaton' });
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/Nora Eaton/)).toBeInTheDocument();
  });

  it('falls back to the email address when the membership carries no name', async () => {
    seedSignedInSession({ membershipName: null });
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/nora\.eaton@example\.test/)).toBeInTheDocument();
  });

  it('shows the organization name and the fixed period label as chips', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/Test Organization \(One\)/)).toBeInTheDocument();
    expect(screen.getAllByText('This month').length).toBeGreaterThan(0);
  });

  it('shows the info line', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/Figures show your organization/)).toBeInTheDocument();
  });

  it('shows the last-update time in hours and minutes only', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    const text = (await screen.findByText(/Last updated/)).textContent ?? '';
    expect(text).toMatch(/\d{1,2}:\d{2}/);
    expect(text).not.toMatch(/\d{2}:\d{2}:\d{2}/);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });

  it('lets the member choose a month and re-queries the range-bound reports', async () => {
    seedSignedInSession();
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText(/Nora Eaton|nora\.eaton/)).toBeInTheDocument();
    expect(screen.getAllByText('This month').length).toBeGreaterThan(0);

    const now = new Date();
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousKey = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
    const previousLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(previous);

    fireEvent.click(screen.getByRole('button', { name: 'This month' }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: previousLabel }));

    expect((await screen.findAllByText(previousLabel)).length).toBeGreaterThan(0);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/reports/kpi-summary'));
      expect(calls.some(([input]) => String(input).includes(`start=${previousKey}-01`))).toBe(true);
    });
  });

  it('reads the chosen month from the URL so a period can be shared', async () => {
    seedSignedInSession();
    const fetchMock = stubAllEndpoints();
    const now = new Date();
    const previous = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const previousKey = `${previous.getUTCFullYear()}-${String(previous.getUTCMonth() + 1).padStart(2, '0')}`;
    const previousLabel = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(previous);

    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <MemoryRouter initialEntries={[`/?month=${previousKey}`]}>
          <OverviewPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect((await screen.findAllByText(previousLabel)).length).toBeGreaterThan(0);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/reports/kpi-summary'));
      expect(calls.some(([input]) => String(input).includes(`start=${previousKey}-01`))).toBe(true);
    });
  });

  it('re-requests the visible widgets when Refresh is pressed', async () => {
    seedSignedInSession({ membershipName: 'Nora Eaton' });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    await screen.findByText(/Nora Eaton/);
    const kpiCallsBefore = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/reports/kpi-summary')).length;
    const auditCallsBefore = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/audit-logs')).length;

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => {
      const kpiCallsAfter = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/reports/kpi-summary')).length;
      const auditCallsAfter = fetchMock.mock.calls.filter(([input]) => String(input).includes('/api/v1/audit-logs')).length;
      expect(kpiCallsAfter).toBeGreaterThan(kpiCallsBefore);
      expect(auditCallsAfter).toBeGreaterThan(auditCallsBefore);
    });
  });
});
