import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter } from './dashboard-fixtures';

/**
 * US7 - a member with none of the dashboard permissions (T026, FR-025).
 *
 * The welcome renders in place of the widgets and nothing is requested: no
 * request may ever be issued for a widget the member may not see.
 */
describe('Dashboard with no dashboard permissions (T026)', () => {
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

  it('renders the welcome and dispatches no request at all', async () => {
    seedSignedInSession({ permissions: [] });
    const fetchMock = stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('No dashboard widgets yet')).toBeInTheDocument();
    expect(screen.getByText(/Your account does not hold any of the permissions/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
