import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routes } from '../../../app/router';
import { healthyReport, jsonResponse, createTestQueryClient, renderWithProviders } from '../../../test/render';
import { HealthPanel } from '../health-panel';

/**
 * T081. The healthy state, and the assertion that the whole application - rendered
 * through its real route table - contains no sign-in screen anywhere. The feature
 * has no authentication, so a sign-in screen would advertise a capability that does
 * not exist and would be the first thing a user tried.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HealthPanel healthy state (T081)', () => {
  it('shows the service report with each check attributed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(healthyReport)));

    renderWithProviders(<HealthPanel />);

    expect(await screen.findByText(/uptime 42 seconds/i)).toBeInTheDocument();
    expect(screen.getByText('Application')).toBeInTheDocument();
    expect(screen.getByText('Database')).toBeInTheDocument();
    // The database check carries its own figure, so a slow database cannot hide
    // behind an overall "ok" (FR-033).
    expect(screen.getByText('3 ms')).toBeInTheDocument();
  });

  it('asks the same-origin health address, with no host in the component', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(healthyReport));
    vi.stubGlobal('fetch', fetchMock);

    renderWithProviders(<HealthPanel />);
    await screen.findByText(/uptime 42 seconds/i);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe('/api/v1/health');
  });

  it('reports an unavailable sub-check as unavailable rather than as a whole-system failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          status: 'ok',
          uptimeSeconds: 7,
          checks: {
            application: { status: 'ok' },
            database: { status: 'unavailable' },
          },
        }),
      ),
    );

    renderWithProviders(<HealthPanel />);

    expect(await screen.findByText(/uptime 7 seconds/i)).toBeInTheDocument();
    expect(screen.getByText('unavailable')).toBeInTheDocument();
  });
});

describe('No sign-in screen anywhere (T081)', () => {
  it('renders the health route through the real route table without a sign-in screen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(healthyReport)));

    const router = createMemoryRouter(routes, { initialEntries: ['/health'] });
    render(
      <QueryClientProvider client={createTestQueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    expect(await screen.findByText(/uptime 42 seconds/i)).toBeInTheDocument();

    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign in/i })).not.toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(
      /\b(sign in|sign up|log in|create account|forgot password)\b/i,
    );
  });
});