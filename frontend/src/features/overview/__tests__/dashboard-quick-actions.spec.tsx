import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import { createTestQueryClient } from '../../../test/render';
import { resetSession, seedSignedInSession } from '../../../test/session';
import { OverviewPage } from '../dashboard-page';
import { dashboardFetch, fetchRouter } from './dashboard-fixtures';

/**
 * US4 - quick actions (T020, FR-010).
 *
 * The six writing actions are real buttons in a wrapping grid. Every action
 * needs its permission held by the member; those without permission are not
 * rendered at all.
 */
describe('Dashboard quick actions (T020)', () => {
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

  it('renders every action for a member holding every write permission', async () => {
    seedSignedInSession();
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByRole('button', { name: 'New sales order' })).toHaveClass('button--primary');
    expect(screen.getByRole('button', { name: 'New purchase order' })).toHaveClass('button--secondary');
    expect(screen.getByRole('button', { name: 'New product' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New contact' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adjust stock' })).toBeInTheDocument();
  });

  it('shows only the sales action for a member holding only sales.write', async () => {
    seedSignedInSession({ permissions: ['sales.read', 'sales.write'] });
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByRole('button', { name: 'New sales order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New purchase order' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New product' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New contact' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record payment' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adjust stock' })).not.toBeInTheDocument();
  });

  it('renders no quick-actions section for a member with no write permission', async () => {
    seedSignedInSession({ permissions: ['sales.read'] });
    stubAllEndpoints();
    renderDashboard();

    expect(await screen.findByText('Sales orders awaiting shipment')).toBeInTheDocument();
    expect(screen.queryByText('Quick actions')).not.toBeInTheDocument();
  });
});
