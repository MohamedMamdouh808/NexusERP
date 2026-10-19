import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { healthyReport, jsonResponse, createTestQueryClient } from '../../test/render';
import { createQueryClient } from '../query-client';
import { routes } from '../router';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('Router (T088)', () => {
  it('serves the overview at the root', () => {
    renderRoute('/');

    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('serves the health panel at /health through the shell', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(healthyReport)));

    renderRoute('/health');

    expect(screen.getByRole('heading', { level: 1, name: 'System health' })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
    expect(await screen.findByText(/uptime 42 seconds/i)).toBeInTheDocument();
  });

  it('redirects an unknown address to the overview rather than showing an empty shell', async () => {
    const router = renderRoute('/no-such-screen');

    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(screen.getByRole('heading', { level: 1, name: 'Overview' })).toBeInTheDocument();
  });
});

describe('Query client (T088)', () => {
  it('never retries a failure on its own', () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.retry).toBe(false);
  });

  it('refreshes when a user returns to the tab', () => {
    const client = createQueryClient();

    expect(client.getDefaultOptions().queries?.refetchOnWindowFocus).toBe(true);
  });
});